import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { currentUser } from "./auth";
import { can, type Permission } from "./domain";
import { adminClient } from "./supabase/server";
import { hashToken } from "./security";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function apiUser(permission?: Permission) {
  const u = await currentUser();
  if (!u) throw new HttpError(401, "กรุณาเข้าสู่ระบบ");
  if (permission && !can(u, permission))
    throw new HttpError(403, "ไม่มีสิทธิ์ดำเนินการ");
  return u;
}
export function checkOrigin(request: Request) {
  if (
    request.headers.get("origin") !==
    new URL(process.env.NEXT_PUBLIC_APP_URL || request.url).origin
  )
    throw new HttpError(403, "คำขอไม่ถูกต้อง");
}
export function check(result: { error: { message: string } | null }) {
  if (result.error) {
    const m = result.error.message;
    if (/VERSION_CONFLICT/.test(m))
      throw new HttpError(409, "รายการเปลี่ยนแปลงแล้ว กรุณาโหลดข้อมูลใหม่");
    if (/FORBIDDEN/.test(m)) throw new HttpError(403, "ไม่มีสิทธิ์ดำเนินการ");
    if (/INVALID_|REASON_|TOKEN_|CANNOT_/.test(m))
      throw new HttpError(400, "ข้อมูลหรือสถานะไม่อนุญาตให้ดำเนินการ");
    if (/duplicate key/.test(m)) throw new HttpError(409, "ข้อมูลซ้ำในระบบ");
    throw new HttpError(503, "ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่");
  }
}
export function errorResponse(error: unknown) {
  if (error instanceof SyntaxError)
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  if (error instanceof ZodError)
    return NextResponse.json(
      { error: error.issues[0]?.message || "ข้อมูลไม่ถูกต้อง" },
      { status: 400 },
    );
  if (error instanceof HttpError)
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  console.error("Request failed", { code: "INTERNAL_ERROR" });
  return NextResponse.json(
    { error: "ระบบไม่สามารถดำเนินการได้ในขณะนี้" },
    { status: 500 },
  );
}
export async function limited(key: string, max = 20, seconds = 60) {
  const r = await adminClient().rpc("rate_limit", {
    k: hashToken(key),
    max_hits: max,
    seconds,
  });
  check(r);
  if (!r.data) throw new HttpError(429, "ส่งคำขอบ่อยเกินไป กรุณารอสักครู่");
}
export function workerAuth(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`)
    throw new HttpError(401, "Unauthorized");
}
