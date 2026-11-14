import { NextResponse } from "next/server";
import {
  apiUser,
  check,
  checkOrigin,
  errorResponse,
  HttpError,
} from "@/lib/api";
import { reviewSchema, correctionSchema } from "@/lib/domain";
import { sessionClient, adminClient } from "@/lib/supabase/server";
import { deriveToken, newToken } from "@/lib/security";
import { z } from "zod";
import { wakeWorker } from "@/lib/worker-wakeup";
export const maxDuration = 300;
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; action: string }> },
) {
  try {
    checkOrigin(request);
    await apiUser();
    const { id, action } = await params;
    z.uuid().parse(id);
    const db = await sessionClient();
    const visible = await db
      .from("leave_requests")
      .select("id,line_retracted")
      .eq("id", id)
      .maybeSingle();
    check(visible);
    if (!visible.data) throw new HttpError(404, "ไม่พบใบลา");
    if (action === "link") {
      const r = await adminClient()
        .from("evidence_upload_tokens")
        .select("nonce")
        .eq("leave_id", id)
        .eq("state", "ACTIVE")
        .maybeSingle();
      check(r);
      if (!r.data) throw new HttpError(410, "ลิงก์ถูกใช้งานหรือยกเลิกแล้ว");
      const token = deriveToken(
        r.data.nonce,
        process.env.UPLOAD_TOKEN_SECRET || "",
      );
      return NextResponse.json(
        { url: `${process.env.NEXT_PUBLIC_APP_URL}/upload/${token}` },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (action === "correct") {
      const input = correctionSchema.parse(await request.json());
      const token = visible.data.line_retracted
        ? newToken(process.env.UPLOAD_TOKEN_SECRET || "")
        : null;
      const payload = {
        ...input,
        ...(token
          ? { new_token_hash: token.hash, new_token_nonce: token.nonce }
          : {}),
      };
      check(await db.rpc("correct_leave", { lid: id, payload }));
    } else if (action === "review") {
      const input = reviewSchema.parse(await request.json());
      const t =
        input.action === "reupload"
          ? newToken(process.env.UPLOAD_TOKEN_SECRET || "")
          : null;
      check(
        await db.rpc("review_leave", {
          lid: id,
          expected_version: input.version,
          action: input.action,
          reason: input.reason,
          rejection_type: input.rejection_type || null,
          token_hash: t?.hash || null,
          token_nonce: t?.nonce || null,
        }),
      );
    } else throw new HttpError(404, "ไม่พบรายการ");
    wakeWorker();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
