"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
export function NotificationControls({ id }: { id?: string }) {
  const [pending, setPending] = useState(false),
    [message, setMessage] = useState("");
  const router = useRouter();
  return (
    <>
      <Button
        variant="outline"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          try {
            const r = await fetch("/api/notifications", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: id || null }),
            });
            if (!r.ok) setMessage("บันทึกไม่สำเร็จ");
            else router.refresh();
          } catch {
            setMessage("เชื่อมต่อไม่สำเร็จ");
          } finally {
            setPending(false);
          }
        }}
      >
        {pending ? "กำลังบันทึก…" : id ? "อ่านแล้ว" : "ทำเครื่องหมายอ่านทั้งหมด"}
      </Button>
      {message && <span role="alert">{message}</span>}
    </>
  );
}
