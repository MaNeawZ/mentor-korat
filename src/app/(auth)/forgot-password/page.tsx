import { AuthForm } from "@/components/auth-form";
import { configured } from "@/lib/supabase/server";
export default function Forgot() {
  return (
    <>
      <span className="eyebrow">ACCOUNT RECOVERY</span>
      <h1>ลืมรหัสผ่าน</h1>
      <p className="auth-description">เราจะส่งลิงก์เปลี่ยนรหัสผ่านไปยังอีเมลของคุณ</p>
      <AuthForm mode="forgot" configured={configured()} />
    </>
  );
}
