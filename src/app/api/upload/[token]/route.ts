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
export const maxDuration = 300;
export const runtime = "nodejs";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  let path: string | undefined;
  let cleanupSafe = false;
  const db = adminClient();
  try {
    checkOrigin(request);
    const { token } = await params;
    await limited(`upload:${token}`, 12, 600);
    if (Number(request.headers.get("content-length")) > MAX_FILE_BYTES + 65536)
      throw new HttpError(413, "ไฟล์ต้องมีขนาดไม่เกิน 8 MB");
    const context = await uploadContext(token);
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
    path = `${context.id}/${randomUUID()}.webp`;
    const stored = await db.storage
      .from("mentor-korat-evidence")
      .upload(path, output, { contentType: "image/webp", upsert: false });
    cleanupSafe = !!stored.error;
    check(stored);
    const done = await db.rpc("complete_upload", {
      hash: hashToken(token),
      file_path: path,
      file_size: output.length,
    });
    cleanupSafe = !!done.error;
    check(done);
    path = undefined;
    wakeWorker();
    return NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    // A lost network response may follow a committed transaction. Never delete
    // evidence on an ambiguous transport failure; reconcile orphans separately.
    if (path && cleanupSafe)
      await db.storage.from("mentor-korat-evidence").remove([path]);
    return errorResponse(e);
  }
}
