import { NextResponse } from "next/server";
import {
  apiUser,
  check,
  checkOrigin,
  errorResponse,
  HttpError,
} from "@/lib/api";
import { sessionClient } from "@/lib/supabase/server";
import { clearRequestSchema } from "@/lib/data-clear";
import { wakeWorker } from "@/lib/worker-wakeup";
export const maxDuration = 300;
async function clearUser() {
  const user = await apiUser("data.clear");
  if (user.role !== "CENTER_HEAD")
    throw new HttpError(403, "เฉพาะหัวหน้าศูนย์ที่ได้รับสิทธิ์เท่านั้น");
  return user;
}
function checkClear(result: {
  error: { message: string; code?: string } | null;
}) {
  const error = result.error;
  if (error?.code === "PGRST202")
    throw new HttpError(503, "กรุณาติดตั้ง migration ฟีเจอร์ล้างข้อมูลก่อนใช้งาน");
  if (error?.message.includes("STALE_CLEAR_PREVIEW"))
    throw new HttpError(409, "ข้อมูลเปลี่ยนแปลงแล้ว กรุณาตรวจจำนวนข้อมูลและยืนยันใหม่");
  if (error?.message.includes("CLEAR_BUSY") || error?.code === "55P03")
    throw new HttpError(409, "มีงานกำลังประมวลผล กรุณารอให้เสร็จแล้วตรวจจำนวนใหม่");
  check(result);
}
export async function GET() {
  try {
    await clearUser();
    const db = await sessionClient();
    const r = await db.rpc("preview_leave_data_clear");
    checkClear(r);
    return NextResponse.json(r.data, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    await clearUser();
    const input = clearRequestSchema.parse(await request.json());
    const db = await sessionClient();
    if (input.action === "retry_files") {
      const r = await db.rpc("retry_storage_cleanup");
      checkClear(r);
      wakeWorker();
      return NextResponse.json({ ok: true });
    }
    const r = await db.rpc("clear_leave_data", {
      expected_snapshot: input.snapshot,
      confirmation: input.confirmation,
      reason: input.reason,
    });
    checkClear(r);
    // DB deletion and the exact file cleanup outbox have committed at this point.
    // A background scheduling failure must not turn that committed action into a
    // misleading HTTP failure; the scheduled worker can still claim these paths.
    try {
      wakeWorker();
    } catch {
      console.error("Evidence cleanup deferred to scheduler", {
        code: "STORAGE_CLEANUP_WAKE_FAILED",
      });
    }
    return NextResponse.json(
      { ok: true, ...r.data },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
