import { requireUser } from "@/lib/auth";
import { sessionClient } from "@/lib/supabase/server";
import { check } from "@/lib/api";
import { thaiDate } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/leave-table";
import { ClearHistoryPanel } from "@/components/clear-history-panel";
import { can } from "@/lib/domain";
export default async function Audit({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await requireUser("audit.view");
  const filters = await searchParams,
    page = Math.max(1, Number(filters.page) || 1),
    db = await sessionClient();
  const r = await db
    .from("audit_logs")
    .select("id,actor_id,entity_id,action,old_data,new_data,created_at", {
      count: "exact",
    })
    .order("created_at", { ascending: false })
    .range((page - 1) * 20, page * 20 - 1);
  check(r);
  return (
    <>
      <PageHeader
        eyebrow="ACCOUNTABILITY"
        title="ประวัติการดำเนินการ"
        description="ตรวจสอบผู้ดำเนินการและข้อมูลก่อน–หลังแก้ไข"
      />
      <section className="panel detail-panel">
        {r.data?.map((a) => (
          <details key={a.id} className="audit-entry">
            <summary>
              <strong>{a.action}</strong>
              <small>
                {thaiDate(a.created_at)} · ผู้ดำเนินการ{" "}
                {a.actor_id || "ระบบ / พนักงาน"}
              </small>
            </summary>
            <pre>
              {JSON.stringify(
                { entity: a.entity_id, before: a.old_data, after: a.new_data },
                null,
                2,
              )}
            </pre>
          </details>
        ))}
        {!r.data?.length && (
          <div className="empty-state">ยังไม่มีประวัติการดำเนินการ</div>
        )}
        <Pagination page={page} count={r.count || 0} path="/audit-logs" />
      </section>
      {user.role === "CENTER_HEAD" && (
        <ClearHistoryPanel enabled={can(user, "data.clear")} />
      )}
    </>
  );
}
