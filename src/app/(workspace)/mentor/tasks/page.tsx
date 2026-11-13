import { LeaveList } from "@/components/leave-list";
import { requireUser } from "@/lib/auth";
import type { Filters } from "@/lib/repository";
export default async function Tasks({
  searchParams,
}: {
  searchParams: Promise<Filters>;
}) {
  const user = await requireUser();
  return (
    <LeaveList
      filters={{ ...(await searchParams), mentor: user.id }}
      path="/mentor/tasks"
      title="งานของฉัน"
      description="รายการใบลาที่คุณรับผิดชอบ ตั้งแต่รอหลักฐานจนถึงส่งต่อ"
    />
  );
}
