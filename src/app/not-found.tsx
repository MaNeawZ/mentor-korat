import Link from "next/link";
export default function NotFound() {
  return (
    <main className="public-card">
      <h1>ไม่พบรายการที่ต้องการ</h1>
      <p>รายการอาจไม่มีอยู่ หรือคุณไม่มีสิทธิ์เข้าถึง</p>
      <Link href="/dashboard">กลับหน้าภาพรวม →</Link>
    </main>
  );
}
