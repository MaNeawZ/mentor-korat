"use client";
import { useState } from "react";
import { Button } from "./ui/button";
export function DiscordTest() {
  const [message, setMessage] = useState(""),
    [pending, setPending] = useState(false);
  return (
    <div>
      <Button
        disabled={pending}
        onClick={async () => {
          setPending(true);
          try {
            const r = await fetch("/api/integrations/discord/test", {
              method: "POST",
            });
            const data = await r.json();
            setMessage(r.ok ? "ส่งข้อความทดสอบสำเร็จ" : data.error);
          } catch {
            setMessage("ไม่สามารถเชื่อมต่อได้");
          } finally {
            setPending(false);
          }
        }}
      >
        {pending ? "กำลังทดสอบ…" : "ส่งข้อความทดสอบ"}
      </Button>
      {message && <p role="status">{message}</p>}
    </div>
  );
}
