import { beforeEach, afterEach, it, expect, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ currentUser: vi.fn() }));
import {
  sendDiscordEvidence,
  readDiscordEvidence,
  deleteDiscordEvidence,
} from "../src/lib/discord-evidence";
const ref = {
  discord_webhook_id: "123456789012345678",
  discord_message_id: "234567890123456789",
  discord_attachment_id: "345678901234567890",
};
const filename = "11111111-1111-4111-8111-111111111111.webp",
  channel = "456789012345678901";
const bytes = new Uint8Array(Buffer.from("RIFF0000WEBPexample"));
const attachment = (
  url = `https://cdn.discordapp.com/attachments/${channel}/${ref.discord_attachment_id}/${filename}?ex=fresh`,
) => ({
  id: ref.discord_message_id,
  channel_id: channel,
  attachments: [{ id: ref.discord_attachment_id, filename, url }],
});
const send = vi.fn<typeof fetch>();
beforeEach(() => {
  send.mockReset();
  vi.stubGlobal("fetch", send);
  vi.stubEnv(
    "DISCORD_WEBHOOK_URL",
    `https://discord.com/api/webhooks/${ref.discord_webhook_id}/dummy-test-token`,
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("posts a multipart file with an attachment preview and obtains durable IDs instead of saving a signed CDN URL", async () => {
  send.mockResolvedValue(Response.json(attachment()));
  expect(await sendDiscordEvidence(bytes, filename, "LE-256911001234")).toEqual(
    ref,
  );
  const [url, options] = send.mock.calls[0];
  expect(new URL(String(url)).searchParams.get("wait")).toBe("true");
  expect(options?.redirect).toBe("error");
  const form = options?.body as FormData;
  expect(form.get("files[0]")).toBeInstanceOf(File);
  const payload = JSON.parse(form.get("payload_json") as string);
  expect(payload.allowed_mentions).toEqual({ parse: [] });
  expect(payload.embeds[0].image.url).toBe(`attachment://${filename}`);
});
it("fetches a fresh attachment URL from the stored message on every read and proxies bounded WebP bytes", async () => {
  send
    .mockResolvedValueOnce(Response.json(attachment()))
    .mockResolvedValueOnce(new Response(bytes))
    .mockResolvedValueOnce(
      Response.json(
        attachment(
          `https://cdn.discordapp.com/attachments/${channel}/${ref.discord_attachment_id}/${filename}?ex=newer`,
        ),
      ),
    )
    .mockResolvedValueOnce(new Response(bytes));
  expect(await readDiscordEvidence(ref)).toEqual(bytes);
  expect(await readDiscordEvidence(ref)).toEqual(bytes);
  expect(String(send.mock.calls[0][0])).toContain(
    `/messages/${ref.discord_message_id}`,
  );
  expect(String(send.mock.calls[3][0])).toContain("ex=newer");
  for (const [, options] of send.mock.calls) {
    expect(options?.redirect).toBe("error");
    expect(options?.cache).toBe("no-store");
  }
});
it.each([
  "https://evil.example/private",
  "https://cdn.discordapp.com.evil.example/file",
  "http://cdn.discordapp.com/file",
  `https://cdn.discordapp.com/attachments/${channel}/999999999999999999/file.webp`,
])(
  "rejects an unexpected attachment URL %s without following it",
  async (url) => {
    send.mockResolvedValue(Response.json(attachment(url)));
    await expect(readDiscordEvidence(ref)).rejects.toThrow("ที่อยู่ไฟล์หลักฐาน");
    expect(send).toHaveBeenCalledOnce();
  },
);
it("fails closed when the attachment or message has been deleted", async () => {
  send.mockResolvedValue(Response.json({ attachments: [] }));
  await expect(readDiscordEvidence(ref)).rejects.toThrow("ไม่พบไฟล์แนบ");
  send.mockResolvedValue(new Response(null, { status: 404 }));
  await expect(readDiscordEvidence(ref)).rejects.toThrow("ไม่พบรูปหลักฐาน");
});
it("treats already deleted attachment messages as successful cleanup", async () => {
  send.mockResolvedValue(Response.json({ code: 10008 }, { status: 404 }));
  await expect(deleteDiscordEvidence(ref)).resolves.toBeUndefined();
  expect(send.mock.calls[0][1]?.method).toBe("DELETE");
});
it("does not declare cleanup successful if the webhook itself is unavailable", async () => {
  send.mockResolvedValue(Response.json({ code: 10015 }, { status: 404 }));
  await expect(deleteDiscordEvidence(ref)).rejects.toThrow(
    "ไม่สามารถยืนยันการลบรูป",
  );
});
it("rejects changed webhook ownership and non-Discord hosts without making requests", async () => {
  await expect(
    readDiscordEvidence({ ...ref, discord_webhook_id: "999999999999999999" }),
  ).rejects.toThrow("Webhook ปัจจุบันไม่ตรง");
  vi.stubEnv(
    "DISCORD_WEBHOOK_URL",
    "https://evil.example/api/webhooks/123456789012345678/token",
  );
  await expect(
    sendDiscordEvidence(bytes, filename, "LE-256911001234"),
  ).rejects.toThrow("Webhook ไม่ถูกต้อง");
  expect(send).not.toHaveBeenCalled();
});
it("bounds oversized and non-WebP attachment responses and sanitizes provider failures", async () => {
  send.mockResolvedValueOnce(Response.json(attachment())).mockResolvedValueOnce(
    new Response(bytes, {
      headers: { "content-length": String(9 * 1024 * 1024) },
    }),
  );
  await expect(readDiscordEvidence(ref)).rejects.toThrow("ใหญ่เกินกำหนด");
  send
    .mockResolvedValueOnce(Response.json(attachment()))
    .mockResolvedValueOnce(new Response("<script>bad</script>"));
  await expect(readDiscordEvidence(ref)).rejects.toThrow("ไม่ใช่รูป WebP");
  send.mockResolvedValue(
    new Response("provider secret details", { status: 429 }),
  );
  await expect(
    sendDiscordEvidence(bytes, filename, "LE-256911001234"),
  ).rejects.toThrow("จำกัดการส่งชั่วคราว");
});
