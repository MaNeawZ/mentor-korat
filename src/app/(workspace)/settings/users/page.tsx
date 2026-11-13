import { requireUser } from "@/lib/auth";
import { sessionClient } from "@/lib/supabase/server";
import { check } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { EntityForm, type Field } from "@/components/entity-form";
import { SettingsTabs } from "@/components/settings-tabs";
const fields: Field[] = [
  {
    key: "id",
    label: "Supabase Auth User ID (UUID)",
    required: true,
    help: "สร้างบัญชีผ่าน Supabase Auth ก่อน แล้วคัดลอก User ID มาที่นี่",
  },
  { key: "name", label: "ชื่อ–นามสกุล", required: true },
  {
    key: "role",
    label: "บทบาท",
    type: "select",
    options: [
      { value: "MENTOR", label: "Mentor" },
      { value: "HR", label: "HR" },
      { value: "CENTER_HEAD", label: "หัวหน้าศูนย์" },
    ],
  },
  { key: "discord_user_id", label: "Discord User ID (ไม่จำเป็น)" },
  { key: "active", label: "เปิดใช้งานบัญชี", type: "checkbox" },
];
export default async function Users() {
  const user = await requireUser("users.manage");
  const db = await sessionClient();
  const r = await db
    .from("app_users")
    .select("id,name,role,active,discord_user_id")
    .order("name");
  check(r);
  return (
    <>
      <PageHeader
        title="บัญชีผู้ใช้งาน"
        description="เพิ่มสิทธิ์ให้บัญชีที่สร้างไว้ใน Supabase Auth โดยไม่เปิดสมัครจากภายนอก"
      >
        <EntityForm
          title="เพิ่มผู้ใช้งาน"
          endpoint="/api/manage/user"
          fields={fields}
          initial={{ role: "MENTOR", active: true }}
        />
      </PageHeader>
      <SettingsTabs />
      <section className="panel">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>ชื่อ</th>
                <th>บทบาท</th>
                <th>Discord ID</th>
                <th>สถานะ</th>
                <th>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {r.data?.map((u) => (
                <tr key={u.id}>
                  <td>
                    <strong>{u.name}</strong>
                    <small>{u.id}</small>
                  </td>
                  <td>{u.role}</td>
                  <td>{u.discord_user_id || "—"}</td>
                  <td>{u.active ? "ใช้งาน" : "ปิดใช้งาน"}</td>
                  <td>
                    {u.id !== user.id ? (
                      <EntityForm
                        key={JSON.stringify(u)}
                        title="แก้ไขบัญชีผู้ใช้งาน"
                        trigger="แก้ไข"
                        endpoint="/api/manage/user"
                        fields={fields.filter((f) => f.key !== "id")}
                        initial={u}
                      />
                    ) : (
                      <span className="muted">บัญชีของคุณ</span>
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
