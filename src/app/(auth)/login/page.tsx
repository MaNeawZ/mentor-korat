import { AuthForm } from "@/components/auth-form";
import { configured } from "@/lib/supabase/server";
export default function Login() {
  return (
    <>
      <h1>เข้าสู่ระบบ</h1>
      <AuthForm mode="login" configured={configured()} />
    </>
  );
}
