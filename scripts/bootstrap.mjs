import { createClient } from "@supabase/supabase-js";
if (!/^[0-9a-f-]{36}$/.test(process.env.BOOTSTRAP_USER_ID || ""))
  throw new Error("Set BOOTSTRAP_USER_ID to an existing Auth user UUID");
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { db: { schema: "mentor_korat" }, auth: { persistSession: false } },
);
const { data, error } = await db
  .from("app_users")
  .select("id", { count: "exact" })
  .limit(1);
if (error) {
  const guidance = {
    PGRST106: 'Supabase Data API ยังไม่เปิด schema mentor_korat: เพิ่ม mentor_korat ใน Exposed schemas โดยคง public และค่าเดิมทั้งหมดไว้ แล้วลอง bootstrap อีกครั้ง',
    PGRST205: 'ไม่พบตาราง mentor_korat.app_users ใน API: ตรวจว่ารัน supabase/setup-sql-editor.sql ครบทั้งไฟล์แล้ว',
    '42P01': 'ไม่พบตาราง mentor_korat.app_users: รัน supabase/setup-sql-editor.sql ครบทั้งไฟล์ก่อน',
    '42501': 'ไม่มีสิทธิ์อ่าน mentor_korat.app_users: ตรวจ service role key และ grants จาก migration',
  };
  throw new Error(guidance[error.code] || 'Cannot inspect app users: ตรวจการเชื่อมต่อและการตั้งค่า Supabase');
}
if (data.length)
  throw new Error(
    "Bootstrap only works on an empty app. Use the users screen.",
  );
const r = await db
  .from("app_users")
  .insert({
    id: process.env.BOOTSTRAP_USER_ID,
    name: process.env.BOOTSTRAP_USER_NAME || "หัวหน้าศูนย์",
    role: "CENTER_HEAD",
  });
if (r.error)
  throw new Error(
    "Cannot bootstrap user. Confirm Auth UUID and migration setup.",
  );
console.log("First center head created. Remove BOOTSTRAP variables.");
