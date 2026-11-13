import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { sessionClient } from "@/lib/supabase/server";
import { check } from "@/lib/api";
import { thaiDate } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/leave-table";
import { NotificationControls } from "@/components/notification-controls";
export default async function Notifications({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireUser();
  const filters = await searchParams,
    page = Math.max(1, Number(filters.page) || 1),
    db = await sessionClient();
  const r = await db
    .from("notifications")
    .select("id,title,leave_id,read_at,created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * 20, page * 20 - 1);
  check(r);
  return (
    <>
      <PageHeader
        eyebrow="STAY IN THE LOOP"
        title="การแจ้งเตือน"
        description="ข่าวสารและรายการที่เกี่ยวข้องกับงานในความดูแล"
      >
        <NotificationControls />
      </PageHeader>
      <section className="panel notices-list">
        {r.data?.map((n) => (
          <div className={`notice ${n.read_at ? "" : "unread"}`} key={n.id}>
            <div>
              <Link
                href={n.leave_id ? `/leaves/${n.leave_id}` : "/settings/line"}
              >
                <strong>{n.title}</strong>
              </Link>
              <small>{thaiDate(n.created_at)}</small>
            </div>
            {!n.read_at && <NotificationControls id={n.id} />}
          </div>
        ))}
        {!r.data?.length && (
          <div className="empty-state">
            <h3>ยังไม่มีการแจ้งเตือน</h3>
            <p>รายการที่เกี่ยวข้องกับคุณจะแสดงที่นี่</p>
          </div>
        )}
        <Pagination page={page} count={r.count || 0} path="/notifications" />
      </section>
    </>
  );
}
