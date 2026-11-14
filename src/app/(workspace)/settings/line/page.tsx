import { requireUser } from "@/lib/auth";
import { sessionClient } from "@/lib/supabase/server";
import { check } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { EntityForm } from "@/components/entity-form";
import { SettingsTabs } from "@/components/settings-tabs";
import Link from "next/link";
import { describeParsingIssues } from "@/lib/line/issues";
export default async function Line() {
  await requireUser("settings.manage");
  const db = await sessionClient();
  const [groups, issues, events] = await Promise.all([
    db.from("line_groups").select("id,name,active"),
    db
      .from("leave_parsing_issues")
      .select("id,event_id,issues,parsed,resolved,created_at")
      .eq("resolved", false)
      .order("created_at", { ascending: false })
      .limit(30),
    db
      .from("integration_events")
      .select("id,status,attempts,error_code")
      .neq("status", "DONE")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  [groups, issues, events].forEach(check);
  const fields = [
    { key: "id", label: "LINE Group ID", required: true },
    { key: "name", label: "ชื่อกลุ่ม", required: true },
    { key: "active", label: "อนุญาตกลุ่มนี้", type: "checkbox" as const },
  ];
  return (
    <>
      <PageHeader
        title="การเชื่อมต่อ LINE"
        description="รับเฉพาะข้อความจากกลุ่มที่ได้รับอนุญาตและผ่านการตรวจ signature"
      >
        <EntityForm
          title="เพิ่มกลุ่ม LINE"
          endpoint="/api/manage/line_group"
          fields={fields}
          initial={{ active: true }}
        />
      </PageHeader>
      <SettingsTabs />
      <section className="panel detail-panel">
        <h2>
          การเชื่อมต่อ{" "}
          {process.env.LINE_CHANNEL_SECRET
            ? "· ตั้งค่า secret แล้ว"
            : "· ยังไม่ได้ตั้งค่า"}
        </h2>
        <p className="muted">
          Webhook: {process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/line
        </p>
        {groups.data?.map((g) => (
          <div className="setting-row" key={g.id}>
            <div>
              <strong>{g.name}</strong>
              <small>
                {g.id} · {g.active ? "อนุญาต" : "ปิดใช้งาน"}
              </small>
            </div>
            <EntityForm
              title="แก้ไขกลุ่ม LINE"
              trigger="แก้ไข"
              endpoint="/api/manage/line_group"
              fields={fields.filter((f) => f.key !== "id")}
              initial={g}
            />
          </div>
        ))}
        <h2>ข้อความที่ต้องตรวจสอบ</h2>
        {issues.data?.map((i) => (
          <details key={i.id} className="audit-entry">
            <summary>
              {describeParsingIssues(i.issues)}
              <small>
                รับผลตรวจเมื่อ{" "}
                {new Intl.DateTimeFormat("th-TH", {
                  dateStyle: "short",
                  timeStyle: "short",
                  timeZone: "Asia/Bangkok",
                }).format(new Date(i.created_at))}
              </small>
            </summary>
            <pre>{JSON.stringify(i.parsed, null, 2)}</pre>
            <p>
              ตรวจรหัส/ชื่อกับข้อมูลพนักงาน แล้วส่งข้อความที่ถูกต้องใน LINE อีกครั้ง
              รายการเลขใบลาซ้ำให้เปิดใบลาเดิมเพื่อตรวจสอบ หากข้อความเดิมถูกยกเลิกแล้ว
              ระบบจะแก้ให้อัตโนมัติเฉพาะร่างที่ยังไม่มีหลักฐาน/ประวัติตรวจและยืนยันผู้ส่ง พนักงาน
              กลุ่มเดิมได้ ส่วนที่ต้องตรวจสอบให้หัวหน้าเปิดใบลาเดิมและแก้ข้อมูลพร้อมเหตุผล
            </p>
            <div className="row wrap">
              <Link className="text-link" href="/employees">
                ตรวจข้อมูลพนักงาน →
              </Link>
              <Link
                className="text-link"
                href={
                  typeof i.parsed?.document_number === "string"
                    ? `/leaves?q=${encodeURIComponent(i.parsed.document_number)}`
                    : "/leaves"
                }
              >
                ค้นหาใบลาเดิม →
              </Link>
            </div>
          </details>
        ))}
        {!issues.data?.length && <p className="muted">ไม่มีรายการที่ต้องตรวจสอบ</p>}
        <h2>คิวรับข้อความ</h2>
        {events.data?.map((e) => (
          <div key={e.id} className="setting-row">
            <p className="mono">
              {e.id} · {e.status} · {e.attempts} ครั้ง · {e.error_code}
            </p>
            {e.status === "FAILED" && (
              <EntityForm
                title="ยืนยันลองประมวลผล LINE ใหม่"
                trigger="ลองใหม่"
                endpoint="/api/queues/retry"
                fields={[]}
                initial={{ queue: "line", job_id: e.id }}
              />
            )}
          </div>
        ))}
      </section>
    </>
  );
}
