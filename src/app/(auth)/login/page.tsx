import { AuthForm } from "@/components/auth-form";
import { configured } from "@/lib/supabase/server";
export default function Login() {
  return (
    <>
      <span className="eyebrow">WELCOME TO YOUR WORKSPACE</span>
      <h1>ยินดีต้อนรับกลับมา</h1>
      <p className="auth-description">เข้าสู่ระบบเพื่อเริ่มดูแลทีมของคุณ</p>
      <AuthForm mode="login" configured={configured()} />
    </>
  );
}
