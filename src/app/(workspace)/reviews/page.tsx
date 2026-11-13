import { LeaveList } from "@/components/leave-list";
import { requireUser } from "@/lib/auth";
import type { Filters } from "@/lib/repository";
export default async function Reviews({
  searchParams,
}: {
  searchParams: Promise<Filters>;
}) {
  await requireUser("evidence.final_review");
  return (
    <LeaveList
      filters={await searchParams}
      fixed="WAITING_FINAL_REVIEW"
      path="/reviews"
      title="ตรวจสอบขั้นสุดท้าย"
      description="ตรวจสอบหลักฐานที่ผ่าน Mentor แล้ว โดยหัวหน้าศูนย์หรือ HR"
    />
  );
}
