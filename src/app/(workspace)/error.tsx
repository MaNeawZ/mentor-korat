"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="empty-state">
      <h2>ไม่สามารถโหลดข้อมูลได้</h2>
      <p>กรุณาตรวจสอบการเชื่อมต่อและการตั้งค่า Supabase แล้วลองอีกครั้ง</p>
      <Button onClick={reset}>ลองใหม่</Button>
    </div>
  );
}
