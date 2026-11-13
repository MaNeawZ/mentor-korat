import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, MessageSquare, History, ImageIcon } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { sessionClient } from "@/lib/supabase/server";
import { check } from "@/lib/api";
import { can, type Leave } from "@/lib/domain";
import { thaiDate } from "@/lib/utils";
import { StatusBadge } from "@/components/status";
import { PageHeader } from "@/components/page-header";
import { ReviewActions } from "@/components/review-actions";
import { EntityForm } from "@/components/entity-form";
export default async function Detail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const user = await requireUser();
  const db = await sessionClient();
  const result = await db
    .from("leave_requests")
    .select("*,employees(code,name,departments(name))")
    .eq("id", id)
    .maybeSingle();
  check(result);
  if (!result.data) notFound();
  const leave = result.data as unknown as Leave;
  const [raw, files, history, audit] = await Promise.all([
    db
      .from("leave_raw_messages")
      .select("message,received_at")
      .eq("leave_id", id)
      .maybeSingle(),
    db
      .from("evidence_files")
      .select("id,created_at,size_bytes")
      .eq("leave_id", id)
      .order("created_at", { ascending: false }),
    db
      .from("leave_status_history")
      .select(
        "id,actor_id,from_status,to_status,reason,rejection_type,created_at",
      )
      .eq("leave_id", id)
      .order("created_at", { ascending: false }),
    db
      .from("audit_logs")
      .select("id,actor_id,action,old_data,new_data,created_at")
      .eq("entity_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  [raw, files, history, audit].forEach(check);
  return (
    <>
      <Link className="text-link" href="/leaves">
        <ArrowLeft size={16} /> กลับรายการใบลา
      </Link>
      <PageHeader
        eyebrow="LEAVE DETAILS"
        title={leave.document_number}
        description={`รับรายการเมื่อ ${thaiDate(leave.created_at)}`}
      >
        <StatusBadge status={leave.status} />
      </PageHeader>
      <div className="detail-grid">
        <div className="detail-main">
          <section className="panel detail-panel">
            <div className="row between">
              <h2>รายละเอียดการลา</h2>
              {can(user, "leaves.edit") &&
                !["VERIFIED", "REJECTED"].includes(leave.status) && (
                  <EntityForm
                    trigger="แก้ไขข้อมูลที่ Bot อ่านผิด"
                    title="แก้ไขข้อมูลใบลา"
                    endpoint={`/api/leaves/${id}/correct`}
                    transform="correction"
                    initial={{
                      version: leave.version,
                      leave_date: leave.leave_date,
                      leave_type: leave.leave_type,
                      period: leave.period,
                      reason: leave.reason,
                    }}
                    fields={[
                      {
                        key: "leave_date",
                        label: "วันที่ลา",
                        type: "date",
                        required: true,
                      },
                      {
                        key: "leave_type",
                        label: "ประเภทการลา",
                        required: true,
                      },
                      {
                        key: "period",
                        label: "ช่วงเวลา",
                        type: "select",
                        options: [
                          { value: "FULL", label: "เต็มวัน" },
                          { value: "AM", label: "ช่วงเช้า" },
                          { value: "PM", label: "ช่วงบ่าย" },
                        ],
                      },
                      {
                        key: "reason",
                        label: "เหตุผลการลา",
                        type: "textarea",
                        required: true,
                      },
                      {
                        key: "correction_reason",
                        label: "เหตุผลที่แก้ไข",
                        type: "textarea",
                        required: true,
                      },
                    ]}
                  />
                )}
            </div>
            <dl className="detail-fields">
              <div>
                <dt>พนักงาน</dt>
                <dd>{leave.employees?.name}</dd>
              </div>
              <div>
                <dt>รหัสพนักงาน / แผนก</dt>
                <dd>
                  {leave.employees?.code} · {leave.employees?.departments?.name}
                </dd>
              </div>
              <div>
                <dt>วันที่ลา</dt>
                <dd>{thaiDate(leave.leave_date)}</dd>
              </div>
              <div>
                <dt>ประเภท / ช่วงเวลา</dt>
                <dd>
                  {leave.leave_type} ·{" "}
                  {leave.period === "FULL"
                    ? "เต็มวัน"
                    : leave.period === "AM"
                      ? "ช่วงเช้า"
                      : "ช่วงบ่าย"}
                </dd>
              </div>
              <div>
                <dt>การมอบหมายงาน</dt>
                <dd>
                  {leave.mentor_id ? "มอบหมาย Mentor แล้ว" : "ยังไม่มี Mentor"}
                  {!leave.mentor_id && can(user, "mentors.assign") && (
                    <Link href="/assignments/unassigned" className="text-link">
                      มอบหมายผู้รับผิดชอบ →
                    </Link>
                  )}
                </dd>
              </div>
              <div className="span-all">
                <dt>เหตุผลการลา</dt>
                <dd className="preserve">{leave.reason}</dd>
              </div>
            </dl>
          </section>
          <section className="panel detail-panel">
            <h2>
              <ImageIcon size={19} /> หลักฐานที่อัปโหลด
            </h2>
            {files.data?.length ? (
              <div className="evidence-grid">
                {files.data.map((f, i) => (
                  <a
                    key={f.id}
                    href={`/api/evidence/${f.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="evidence-card"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/evidence/${f.id}`}
                      loading="lazy"
                      alt={`หลักฐานเวอร์ชัน ${files.data!.length - i}`}
                    />
                    <small>
                      เวอร์ชัน {files.data!.length - i} · {thaiDate(f.created_at)}
                    </small>
                  </a>
                ))}
              </div>
            ) : (
              <div className="empty-state compact">
                <ImageIcon size={30} />
                <p>ยังไม่มีหลักฐานที่อัปโหลด</p>
              </div>
            )}
            <ReviewActions
              id={id}
              version={leave.version}
              status={leave.status}
              user={user}
            />
          </section>
          <section className="panel detail-panel">
            <h2>
              <MessageSquare size={19} /> ข้อความต้นฉบับจาก LINE
            </h2>
            <pre className="raw-message">
              {raw.data?.message || "ไม่พบข้อความต้นฉบับ"}
            </pre>
          </section>
        </div>
        <aside>
          <section className="panel detail-panel">
            <h2>
              <History size={18} /> ประวัติการตรวจสอบ
            </h2>
            <div className="timeline">
              {history.data?.map((h) => (
                <div className="timeline-item" key={h.id}>
                  <StatusBadge status={h.to_status} />
                  <small>
                    {thaiDate(h.created_at)} ·{" "}
                    {h.actor_id
                      ? `ผู้ตรวจ ${h.actor_id.slice(0, 8)}`
                      : "ระบบ / พนักงาน"}
                  </small>
                  {h.reason && <p>{h.reason}</p>}
                  {h.rejection_type && (
                    <small>
                      {h.rejection_type === "EVIDENCE"
                        ? "ปฏิเสธหลักฐาน"
                        : "ไม่ผ่านการตรวจข้อมูลใบลา"}
                    </small>
                  )}
                </div>
              ))}
            </div>
          </section>
          <section className="panel detail-panel">
            <h2>บันทึกการดำเนินการ</h2>
            {audit.data?.map((a) => (
              <details className="audit-entry" key={a.id}>
                <summary>
                  {a.action}
                  <small>
                    {thaiDate(a.created_at)} ·{" "}
                    {a.actor_id?.slice(0, 8) || "ระบบ"}
                  </small>
                </summary>
                <pre>
                  {JSON.stringify(
                    { before: a.old_data, after: a.new_data },
                    null,
                    2,
                  )}
                </pre>
              </details>
            ))}
          </section>
        </aside>
      </div>
    </>
  );
}
