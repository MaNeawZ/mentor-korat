import "server-only";
import { adminClient } from "./supabase/server";
import { hashToken } from "./security";
import { HttpError, check } from "./api";
export async function uploadContext(token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token))
    throw new HttpError(404, "ลิงก์นี้ไม่สามารถใช้งานได้แล้ว กรุณาขอลิงก์ใหม่จาก Mentor");
  const db = adminClient();
  const r = await db
    .from("evidence_upload_tokens")
    .select("state,leave_id")
    .eq("token_hash", hashToken(token))
    .maybeSingle();
  check(r);
  if (!r.data || r.data.state === "REVOKED")
    throw new HttpError(410, "ลิงก์นี้ไม่สามารถใช้งานได้แล้ว กรุณาขอลิงก์ใหม่จาก Mentor");
  if (r.data.state === "USED")
    throw new HttpError(410, "ลิงก์นี้ถูกใช้งานเรียบร้อยแล้ว");
  const l = await db
    .from("leave_requests")
    .select("id,document_number,leave_date,leave_type,employees(name)")
    .eq("id", r.data.leave_id)
    .single();
  check(l);
  return l.data!;
}
