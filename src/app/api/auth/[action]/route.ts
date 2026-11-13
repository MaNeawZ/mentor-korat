import { NextResponse } from "next/server";
import { z } from "zod";
import { sessionClient, configured } from "@/lib/supabase/server";
import { checkOrigin, errorResponse, HttpError, limited } from "@/lib/api";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ action: string }> },
) {
  try {
    checkOrigin(request);
    if (!configured()) throw new HttpError(503, "กรุณาตั้งค่า Supabase ก่อนใช้งาน");
    const { action } = await params;
    const db = await sessionClient();
    if (action === "logout") {
      await db.auth.signOut();
      return NextResponse.json({ ok: true });
    }
    const payload = await request.json();
    await limited(
      `auth:${request.headers.get("x-forwarded-for")?.split(",")[0] || "shared"}`,
      20,
      600,
    );
    if (action === "login") {
      const input = z
        .object({ email: z.email(), password: z.string().min(1).max(200) })
        .parse(payload);
      const { error } = await db.auth.signInWithPassword(input);
      if (error) throw new HttpError(400, "อีเมลหรือรหัสผ่านไม่ถูกต้อง");
      const profile = await db.rpc("my_profile");
      if (!profile.data) {
        await db.auth.signOut();
        throw new HttpError(403, "บัญชีนี้ยังไม่ได้รับสิทธิ์หรือถูกปิดใช้งาน");
      }
    } else if (action === "forgot") {
      const { email } = z.object({ email: z.email() }).parse(payload);
      await db.auth.resetPasswordForEmail(email, {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/reset-password`,
      });
    } else if (action === "reset") {
      const { password } = z
        .object({ password: z.string().min(12).max(200) })
        .parse(payload);
      const {
        data: { user },
      } = await db.auth.getUser();
      if (!user) throw new HttpError(401, "ลิงก์หมดอายุ กรุณาขอลิงก์ใหม่");
      const { error } = await db.auth.updateUser({ password });
      if (error) throw new HttpError(400, "เปลี่ยนรหัสผ่านไม่สำเร็จ");
    } else throw new HttpError(404, "ไม่พบรายการ");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
