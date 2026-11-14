import { requireUser } from "@/lib/auth";
import { sessionClient } from "@/lib/supabase/server";
import { check } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { NotificationControls } from "@/components/notification-controls";
import { NotificationInbox } from "@/components/notification-inbox";
import { notificationSelect, type NotificationItem } from "@/lib/notifications";
export default async function Notifications({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; filter?: string }>;
}) {
  await requireUser();
  const filters = await searchParams,
    page = Math.max(1, Number(filters.page) || 1),
    unreadOnly = filters.filter === "unread",
    db = await sessionClient();
  let query = db
    .from("notifications")
    .select(notificationSelect, { count: "exact" });
  if (unreadOnly) query = query.is("read_at", null);
  const [rows, total, unread] = await Promise.all([
    query
      .order("created_at", { ascending: false })
      .range((page - 1) * 20, page * 20 - 1),
    db.from("notifications").select("id", { count: "exact", head: true }),
    db
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .is("read_at", null),
  ]);
  [rows, total, unread].forEach(check);
  return (
    <>
      <PageHeader
        eyebrow="YOUR UPDATES"
        title="การแจ้งเตือน"
        description="ติดตามใบลา หลักฐาน และความคืบหน้าของงานในความดูแล"
      >
        <NotificationControls disabled={!unread.count} />
      </PageHeader>
      <NotificationInbox
        items={(rows.data as unknown as NotificationItem[]) || []}
        total={total.count || 0}
        unread={unread.count || 0}
        count={rows.count || 0}
        unreadOnly={unreadOnly}
        page={page}
      />
    </>
  );
}
