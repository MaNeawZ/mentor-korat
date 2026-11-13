import { LeaveList } from "@/components/leave-list";
import type { Filters } from "@/lib/repository";
export default async function Leaves({
  searchParams,
}: {
  searchParams: Promise<Filters>;
}) {
  return (
    <LeaveList
      filters={await searchParams}
      path="/leaves"
      title="รายการใบลา"
      description="ติดตามและจัดการการตรวจสอบหลักฐานการลาทั้งหมด"
    />
  );
}
