import { requireUser } from "@/lib/auth";
import { sessionClient } from "@/lib/supabase/server";
import { check } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { EntityForm } from "@/components/entity-form";
import { SettingsTabs } from "@/components/settings-tabs";
import { ClearDataPanel } from "@/components/clear-data-panel";
import { ClearHistoryPanel } from "@/components/clear-history-panel";
import { can } from "@/lib/domain";
export default async function Settings() {
  const user = await requireUser("settings.manage");
  const db = await sessionClient();
  const r = await db.from("app_settings").select("key,value");
  check(r);
  const names: Record<string, string> = {
    leave_types: "ประเภทการลา",
    retention_days: "ระยะเวลาเก็บข้อมูล (วัน)",
    discord_mode: "รูปแบบข้อความ Discord",
  };
  return (
    <>
      <PageHeader
        title="ตั้งค่าระบบ"
        description="ปรับแต่งการทำงานและการเชื่อมต่อบริการภายนอก"
      />
      <SettingsTabs />
      <section className="panel detail-panel">
        {r.data?.map((s) => (
          <div key={s.key} className="setting-row">
            <div>
              <strong>{names[s.key] || s.key}</strong>
              <pre>{JSON.stringify(s.value, null, 2)}</pre>
            </div>
            <EntityForm
              title={`แก้ไข${names[s.key]}`}
              trigger="แก้ไข"
              endpoint="/api/manage/setting"
              transform="setting"
              initial={{ key: s.key, value: JSON.stringify(s.value) }}
              fields={[
                {
                  key: "value",
                  label: "ค่า JSON",
                  type: "textarea",
                  required: true,
                  help:
                    s.key === "retention_days"
                      ? "บันทึกนโยบายสำหรับทบทวนข้อมูล ยังไม่ลบข้อมูลอัตโนมัติ"
                      : s.key === "discord_mode"
                        ? '"edit" เพื่อแก้ไขข้อความเดิม หรือ "events" เพื่อส่งข้อความใหม่'
                        : 'เช่น ["ลาป่วย", "ลากิจ", "ลาพักร้อน"]',
                },
              ]}
            />
          </div>
        ))}
      </section>
      {user.role === "CENTER_HEAD" && (
        <ClearDataPanel enabled={can(user, "data.clear")} />
      )}
      {user.role === "CENTER_HEAD" && (
        <ClearHistoryPanel enabled={can(user, "data.clear")} />
      )}
    </>
  );
}
