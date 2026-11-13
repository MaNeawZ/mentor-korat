import "server-only";
import { HttpError } from "./api";
import { MAX_FILE_BYTES, imageType } from "./security";
import { limitedBody } from "./body";

export type DiscordEvidenceRef = {
  discord_webhook_id: string;
  discord_message_id: string;
  discord_attachment_id: string;
};
const snowflake = /^[0-9]{15,22}$/;
type Attachment = { id: string; filename?: string; url?: string };
type DiscordMessage = {
  id?: string;
  channel_id?: string;
  attachments?: Attachment[];
  embeds?: { image?: { url?: string; proxy_url?: string } }[];
};
function attachmentUrl(raw: string, channelId: string, id?: string) {
  const url = new URL(raw);
  const parts = url.pathname.match(
    /^\/attachments\/([0-9]{15,22})\/([0-9]{15,22})\/([^/]+)$/,
  );
  if (
    url.protocol !== "https:" ||
    !["cdn.discordapp.com", "media.discordapp.net"].includes(url.hostname) ||
    url.port ||
    url.username ||
    url.password ||
    !parts ||
    parts[1] !== channelId ||
    (id && parts[2] !== id)
  )
    throw new HttpError(503, "ที่อยู่ไฟล์หลักฐาน Discord ไม่ถูกต้อง");
  return { url, id: parts[2], filename: decodeURIComponent(parts[3]) };
}
function messageAttachments(message: DiscordMessage): Attachment[] {
  const candidates = Array.isArray(message.attachments)
    ? message.attachments.filter((a) => snowflake.test(a.id))
    : [];
  // Discord excludes attachments referenced by an embed from attachments[].
  for (const embed of message.embeds || []) {
    for (const raw of [embed.image?.url, embed.image?.proxy_url]) {
      if (!raw || !snowflake.test(message.channel_id || "")) continue;
      try {
        const found = attachmentUrl(raw, message.channel_id!);
        if (!candidates.some((a) => a.id === found.id))
          candidates.push({
            id: found.id,
            filename: found.filename,
            url: found.url.toString(),
          });
      } catch {
        /* Never follow external embeds or attachment:// placeholders. */
      }
    }
  }
  return candidates;
}
function webhook(
  ref?: Pick<DiscordEvidenceRef, "discord_webhook_id" | "discord_message_id">,
) {
  let url: URL;
  try {
    url = new URL(process.env.DISCORD_WEBHOOK_URL || "");
  } catch {
    throw new HttpError(503, "กรุณาตั้งค่า Discord Webhook ก่อนอัปโหลดหลักฐาน");
  }
  const parts = url.pathname.match(
    /^\/api\/(?:v10\/)?webhooks\/([0-9]{15,22})\/([A-Za-z0-9._-]+)\/?$/,
  );
  if (
    url.protocol !== "https:" ||
    url.hostname !== "discord.com" ||
    url.port ||
    url.username ||
    url.password ||
    !parts
  )
    throw new HttpError(503, "Discord Webhook ไม่ถูกต้อง");
  url.pathname = `/api/v10/webhooks/${parts[1]}/${parts[2]}`;
  url.searchParams.delete("wait");
  url.hash = "";
  if (ref) {
    if (
      !snowflake.test(ref.discord_message_id) ||
      ref.discord_webhook_id !== parts[1]
    )
      throw new HttpError(
        503,
        "Webhook ปัจจุบันไม่ตรงกับที่เก็บหลักฐาน กรุณาติดต่อผู้ดูแลระบบ",
      );
    url.pathname += `/messages/${ref.discord_message_id}`;
  }
  return { url, webhookId: parts[1] };
}
async function providerRequest(url: URL, options: RequestInit = {}) {
  let r: Response;
  try {
    r = await fetch(url, {
      ...options,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new HttpError(503, "เชื่อมต่อ Discord ไม่สำเร็จ กรุณาลองใหม่");
  }
  if (!r.ok) {
    if (r.status === 404 && options.method === "DELETE") {
      const error = await r.json().catch(() => null);
      if (error?.code === 10008) return new Response(null, { status: 204 });
      throw new HttpError(503, "ไม่สามารถยืนยันการลบรูปได้ กรุณาตรวจสอบ webhook เดิม");
    }
    if (r.status === 404 || r.status === 410)
      throw new HttpError(410, "ไม่พบรูปหลักฐานใน Discord อาจถูกลบแล้ว");
    if (r.status === 413)
      throw new HttpError(413, "ไฟล์ใหญ่เกินขีดจำกัด Discord กรุณาลดขนาดรูป");
    throw new HttpError(
      503,
      r.status === 429
        ? "Discord จำกัดการส่งชั่วคราว กรุณารอสักครู่แล้วลองใหม่"
        : "Discord ไม่สามารถรับหรือเปิดไฟล์ได้ในขณะนี้",
    );
  }
  return r;
}
export async function sendDiscordEvidence(
  bytes: Uint8Array,
  filename: string,
  documentNumber: string,
): Promise<DiscordEvidenceRef> {
  if (!/^[0-9a-f-]{36}\.webp$/.test(filename) || bytes.length > MAX_FILE_BYTES)
    throw new HttpError(400, "ไฟล์หลักฐานไม่ถูกต้อง");
  const { url, webhookId } = webhook();
  url.searchParams.set("wait", "true");
  const form = new FormData();
  form.append(
    "payload_json",
    JSON.stringify({
      content: `📎 หลักฐานใบลา ${documentNumber}`,
      allowed_mentions: { parse: [] },
      attachments: [{ id: 0, filename }],
    }),
  );
  form.append(
    "files[0]",
    new Blob([new Uint8Array(bytes)], { type: "image/webp" }),
    filename,
  );
  const r = await providerRequest(url, { method: "POST", body: form });
  const message: DiscordMessage = await r.json();
  const attachments = messageAttachments(message);
  // Exactly one file is sent. A provider-normalized filename is acceptable
  // only when there is one unambiguous attachment, never choose arbitrarily.
  const attachment =
    attachments.find((a) => a.filename === filename) ||
    (attachments.length === 1 ? attachments[0] : undefined);
  if (
    !snowflake.test(message.id || "") ||
    !snowflake.test(attachment?.id || "")
  )
    throw new HttpError(
      503,
      "Discord ตอบกลับข้อมูลไฟล์ไม่ครบ กรุณาติดต่อผู้ดูแลระบบก่อนลองใหม่",
    );
  return {
    discord_webhook_id: webhookId,
    discord_message_id: message.id!,
    discord_attachment_id: attachment!.id,
  };
}
export async function deleteDiscordEvidence(
  ref: Pick<DiscordEvidenceRef, "discord_webhook_id" | "discord_message_id">,
) {
  const { url } = webhook(ref);
  await providerRequest(url, { method: "DELETE" });
}
export async function readDiscordEvidence(ref: DiscordEvidenceRef) {
  if (!snowflake.test(ref.discord_attachment_id))
    throw new HttpError(503, "ข้อมูลอ้างอิงหลักฐานไม่ถูกต้อง");
  const { url } = webhook(ref);
  // Fetch the message each time: Discord attachment URLs expire.
  const message: DiscordMessage = await (await providerRequest(url)).json();
  const attachment = messageAttachments(message).find(
    (a) => a.id === ref.discord_attachment_id,
  );
  if (!attachment) throw new HttpError(410, "ไม่พบไฟล์แนบในข้อความ Discord");
  let downloadUrl: URL;
  try {
    downloadUrl = attachmentUrl(
      attachment.url || "",
      message.channel_id || "",
      ref.discord_attachment_id,
    ).url;
  } catch {
    throw new HttpError(503, "ที่อยู่ไฟล์หลักฐาน Discord ไม่ถูกต้อง");
  }
  const response = await providerRequest(downloadUrl);
  if (Number(response.headers.get("content-length")) > MAX_FILE_BYTES)
    throw new HttpError(413, "ไฟล์หลักฐานใหญ่เกินกำหนด");
  const data = await limitedBody(response, MAX_FILE_BYTES);
  if (imageType(data) !== "image/webp")
    throw new HttpError(503, "ไฟล์หลักฐานใน Discord ไม่ใช่รูป WebP ที่รองรับ");
  return data;
}
