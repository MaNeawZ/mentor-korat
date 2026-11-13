import { NextResponse } from "next/server";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import {
  checkOrigin,
  errorResponse,
  check,
  HttpError,
  limited,
} from "@/lib/api";
import { uploadContext } from "@/lib/evidence";
import { hashToken, imageType, MAX_FILE_BYTES } from "@/lib/security";
import { adminClient } from "@/lib/supabase/server";
import { limitedBody } from "@/lib/body";
import { wakeWorker } from "@/lib/worker-wakeup";
import {
  sendDiscordEvidence,
  deleteDiscordEvidence,
  type DiscordEvidenceRef,
} from "@/lib/discord-evidence";
export const maxDuration = 300;
export const runtime = "nodejs";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  let path: string | undefined;
  let discord: DiscordEvidenceRef | undefined;
  let cleanupSafe = false;
  const db = adminClient();
  try {
    checkOrigin(request);
    const { token } = await params;
    await limited(`upload:${token}`, 12, 600);
    if (Number(request.headers.get("content-length")) > MAX_FILE_BYTES + 65536)
      throw new HttpError(413, "ไฟล์ต้องมีขนาดไม่เกิน 8 MB");
    const context = await uploadContext(token);
    const ready = await db.rpc("discord_evidence_ready");
    if (ready.error?.code === "PGRST202")
      throw new HttpError(
        503,
        "กรุณาติดตั้ง migration สำหรับเก็บหลักฐานใน Discord ก่อนอัปโหลด",
      );
    check(ready);
    const body = await limitedBody(request, MAX_FILE_BYTES + 65536);
    const form = await new Response(body, {
      headers: { "Content-Type": request.headers.get("content-type") || "" },
    }).formData();
    const file = form.get("file");
    if (
      !(file instanceof File) ||
      file.size === 0 ||
      file.size > MAX_FILE_BYTES
    )
      throw new HttpError(400, "ไฟล์ต้องมีขนาดไม่เกิน 8 MB");
    const bytes = Buffer.from(await file.arrayBuffer());
    const mime = imageType(bytes);
    if (!mime || mime !== file.type)
      throw new HttpError(400, "รองรับเฉพาะ JPEG, PNG และ WebP");
    let output: Buffer;
    try {
      output = await sharp(bytes, {
        limitInputPixels: 24_000_000,
        animated: false,
      })
        .rotate()
        .resize({
          width: 2200,
          height: 2200,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 85 })
        .toBuffer();
    } catch {
      throw new HttpError(400, "ไฟล์รูปภาพไม่ถูกต้องหรือมีขนาดภาพใหญ่เกินไป");
    }
    if (output.length > MAX_FILE_BYTES)
      throw new HttpError(413, "รูปหลังประมวลผลยังใหญ่เกินกำหนด กรุณาลดขนาดรูป");
    const filename = `${randomUUID()}.webp`;
    path = `${context.id}/${filename}`;
    discord = await sendDiscordEvidence(
      output,
      filename,
      context.document_number,
    );
    const done = await db.rpc("complete_discord_upload", {
      hash: hashToken(token),
      file_path: path,
      file_size: output.length,
      webhook_id: discord.discord_webhook_id,
      message_id: discord.discord_message_id,
      attachment_id: discord.discord_attachment_id,
    });
    // Only a definitive database rejection proves that metadata did not commit.
    // Supabase can also return transport errors as results rather than throwing.
    cleanupSafe =
      !!done.error &&
      (/^[A-Z0-9]{5}$/.test(done.error.code || "") ||
        ["PGRST202", "PGRST203"].includes(done.error.code));
    check(done);
    path = undefined;
    try {
      wakeWorker();
    } catch {
      console.error("Evidence notification deferred", {
        code: "EVIDENCE_WAKE_FAILED",
      });
    }
    return NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    // A lost network response may follow a committed transaction. Never delete
    // evidence on an ambiguous transport failure; reconcile orphans separately.
    if (path && discord && cleanupSafe) {
      try {
        await deleteDiscordEvidence(discord);
      } catch {
        try {
          const queued = await db.from("storage_cleanup_jobs").upsert({
            path,
            provider: "discord",
            discord_webhook_id: discord.discord_webhook_id,
            discord_message_id: discord.discord_message_id,
          });
          check(queued);
        } catch {
          console.error("Evidence cleanup requires reconciliation", {
            code: "DISCORD_EVIDENCE_CLEANUP_FAILED",
          });
        }
      }
    }
    return errorResponse(e);
  }
}
