import { AuthForm } from "@/components/auth-form";
import { configured } from "@/lib/supabase/server";
export default function Reset() {
  return (
    <>
      <h1>ตั้งรหัสผ่านใหม่</h1>
      <p className="auth-description">ใช้รหัสผ่านที่คาดเดายากอย่างน้อย 12 ตัวอักษร</p>
      <AuthForm mode="reset" configured={configured()} />
    </>
  );
}
