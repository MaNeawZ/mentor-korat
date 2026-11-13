import { requireUser } from "@/lib/auth";
import { sessionClient } from "@/lib/supabase/server";
import { check } from "@/lib/api";
import { permissions } from "@/lib/domain";
import { PageHeader } from "@/components/page-header";
import { EntityForm } from "@/components/entity-form";
import { SettingsTabs } from "@/components/settings-tabs";
export default async function Permissions() {
  await requireUser("permissions.manage");
  const db = await sessionClient();
  const [users, overrides] = await Promise.all([
    db.from("app_users").select("id,name,role"),
    db.from("user_permission_overrides").select("user_id,permission,allowed"),
  ]);
  check(users);
  check(overrides);
  return (
    <>
      <PageHeader
        title="สิทธิ์รายบัญชี"
        description="สิทธิ์ที่กำหนดหน้านี้จะมีผลแทนค่าเริ่มต้นของบทบาท"
      >
        <EntityForm
          title="กำหนดสิทธิ์"
          endpoint="/api/manage/permission"
          fields={[
            {
              key: "user_id",
              label: "ผู้ใช้งาน",
              type: "select",
              required: true,
              options: users.data!.map((u) => ({
                value: u.id,
                label: `${u.name} (${u.role})`,
              })),
            },
            {
              key: "permission",
              label: "สิทธิ์",
              type: "select",
              options: permissions.map((p) => ({ value: p, label: p })),
            },
            {
              key: "allowed",
              label: "อนุญาต (ปิดเพื่อปฏิเสธสิทธิ์)",
              type: "checkbox",
            },
          ]}
          initial={{
            allowed: true,
            user_id: users.data?.[0]?.id,
            permission: permissions[0],
          }}
        />
      </PageHeader>
      <SettingsTabs />
      <section className="panel">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>บัญชี</th>
                <th>สิทธิ์</th>
                <th>ผลบังคับใช้</th>
              </tr>
            </thead>
            <tbody>
              {overrides.data?.map((o) => (
                <tr key={`${o.user_id}-${o.permission}`}>
                  <td>
                    {users.data?.find((u) => u.id === o.user_id)?.name ||
                      o.user_id}
                  </td>
                  <td className="mono">{o.permission}</td>
                  <td>{o.allowed ? "อนุญาต" : "ปฏิเสธ"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!overrides.data?.length && (
            <div className="empty-state">
              ยังไม่มีสิทธิ์เพิ่มเติม ระบบใช้ค่าเริ่มต้นตามบทบาท
            </div>
          )}
        </div>
      </section>
    </>
  );
}
