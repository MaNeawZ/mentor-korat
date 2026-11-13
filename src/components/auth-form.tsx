"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, ArrowRight, LockKeyhole, Mail } from "lucide-react";
import { Button } from "./ui/button";
const schema = z.object({ email: z.string(), password: z.string() });
export function AuthForm({
  mode,
  configured = true,
}: {
  mode: "login" | "forgot" | "reset";
  configured?: boolean;
}) {
  const [visible, setVisible] = useState(false),
    [message, setMessage] = useState(""),
    [success, setSuccess] = useState(false);
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });
  return (
    <form
      className="form-stack"
      onSubmit={handleSubmit(async (values) => {
        setMessage("");
        const r = await fetch(`/api/auth/${mode}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        }).catch(() => null);
        if (!r) {
          setMessage("ไม่สามารถเชื่อมต่อระบบได้");
          return;
        }
        const data = await r.json();
        if (!r.ok) {
          setMessage(data.error);
          return;
        }
        if (mode === "login") {
          router.push("/dashboard");
          router.refresh();
        } else {
          setSuccess(true);
          setMessage(
            mode === "forgot"
              ? "หากอีเมลอยู่ในระบบ คุณจะได้รับลิงก์เปลี่ยนรหัสผ่าน"
              : "เปลี่ยนรหัสผ่านเรียบร้อยแล้ว",
          );
        }
      })}
    >
      {!configured && (
        <div className="alert">
          ยังไม่ได้ตั้งค่า Supabase กรุณาดู README.md สำหรับการติดตั้ง
        </div>
      )}
      {mode !== "reset" && (
        <label>
          อีเมล
          <div className="input-icon">
            <Mail size={18} />
            <input
              type="email"
              required
              autoComplete="email"
              placeholder="you@company.com"
              {...register("email")}
            />
          </div>
        </label>
      )}
      {mode !== "forgot" && (
        <label>
          รหัสผ่าน
          <div className="input-icon">
            <LockKeyhole size={18} />
            <input
              type={visible ? "text" : "password"}
              required
              minLength={mode === "reset" ? 12 : 1}
              autoComplete={
                mode === "reset" ? "new-password" : "current-password"
              }
              placeholder={
                mode === "reset" ? "อย่างน้อย 12 ตัวอักษร" : "กรอกรหัสผ่านของคุณ"
              }
              {...register("password")}
            />
            <button
              type="button"
              className="icon-btn"
              aria-label={visible ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
              onClick={() => setVisible(!visible)}
            >
              {visible ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </label>
      )}
      {mode === "login" && (
        <Link href="/forgot-password" className="forgot-link">
          ลืมรหัสผ่าน?
        </Link>
      )}
      {message && (
        <p role="status" className={success ? "success-box" : "error-box"}>
          {message}
        </p>
      )}
      <Button disabled={isSubmitting || !configured}>
        {isSubmitting
          ? "กำลังดำเนินการ…"
          : mode === "login"
            ? "เข้าสู่ระบบ"
            : mode === "forgot"
              ? "ส่งลิงก์เปลี่ยนรหัสผ่าน"
              : "บันทึกรหัสผ่านใหม่"}
        <ArrowRight size={17} />
      </Button>
      {mode !== "login" && (
        <Link className="text-link" href="/login">
          ← กลับเข้าสู่ระบบ
        </Link>
      )}
    </form>
  );
}
