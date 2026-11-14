"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
import { CheckCheck, LoaderCircle } from "lucide-react";
export function NotificationControls({
  id,
  disabled = false,
}: {
  id?: string;
  disabled?: boolean;
}) {
  const [pending, setPending] = useState(false),
    [message, setMessage] = useState("");
  const router = useRouter();
  return (
    <>
      <Button
        variant={id ? "ghost" : "outline"}
        className={id ? "notification-read-one" : undefined}
        aria-label={id ? "ทำเครื่องหมายว่าอ่านแล้ว" : undefined}
        title={id ? "ทำเครื่องหมายว่าอ่านแล้ว" : undefined}
        disabled={pending || disabled}
        onClick={async () => {
          setPending(true);
          setMessage("");
          try {
            const r = await fetch("/api/notifications", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: id || null }),
            });
            if (!r.ok) setMessage("บันทึกไม่สำเร็จ");
            else {
              window.dispatchEvent(new Event("notifications-changed"));
              router.refresh();
            }
          } catch {
            setMessage("เชื่อมต่อไม่สำเร็จ");
          } finally {
            setPending(false);
          }
        }}
      >
        {pending ? (
          <LoaderCircle size={16} className="notification-spinner" />
        ) : (
          <CheckCheck size={16} />
        )}
        {!id && (pending ? "กำลังบันทึก…" : "อ่านทั้งหมด")}
      </Button>
      {message && <span role="alert">{message}</span>}
    </>
  );
}
