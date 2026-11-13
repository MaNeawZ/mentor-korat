import { requireUser } from "@/lib/auth";
import { sessionClient } from "@/lib/supabase/server";
import { check } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { SettingsTabs } from "@/components/settings-tabs";
import { DiscordTest } from "@/components/discord-test";
import { EntityForm } from "@/components/entity-form";
export default async function Discord() {
  await requireUser("settings.manage");
  const db = await sessionClient();
  const r = await db
    .from("notification_outbox")
    .select("id,kind,status,attempts,error_code,created_at")
    .order("created_at", { ascending: false })
    .limit(30);
  check(r);
  return (
    <>
      <PageHeader
        title="การเชื่อมต่อ Discord"
        description="แจ้งสถานะไปยังช่องส่วนตัว และส่งลิงก์จริงผ่าน Mentor"
      />
      <SettingsTabs />
      <section className="panel detail-panel">
        <h2>สถานะการตั้งค่า</h2>
        <dl className="detail-fields">
          <div>
            <dt>Webhook</dt>
            <dd>
              {process.env.DISCORD_WEBHOOK_URL ? "ตั้งค่าแล้ว" : "ยังไม่ได้ตั้งค่า"}
            </dd>
          </div>
          <div>
            <dt>Bot DM (เสริม)</dt>
            <dd>
              {process.env.DISCORD_BOT_TOKEN ? "ตั้งค่าแล้ว" : "ไม่ได้เปิดใช้งาน"}
            </dd>
          </div>
        </dl>
        <DiscordTest />
        <h2>สถานะการส่งล่าสุด</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>สถานะ</th>
                <th>ความพยายาม</th>
                <th>เหตุขัดข้อง</th>
                <th>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {r.data?.map((j) => (
                <tr key={j.id}>
                  <td>{j.status}</td>
                  <td>{j.attempts}</td>
                  <td>{j.error_code || "—"}</td>
                  <td>
                    {j.status === "FAILED" && (
                      <EntityForm
                        title="ยืนยันลองส่ง Discord ใหม่"
                        trigger="ลองใหม่"
                        endpoint="/api/queues/retry"
                        fields={[]}
                        initial={{ queue: "discord", job_id: j.id }}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
