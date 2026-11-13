import Link from "next/link";
export function SettingsTabs() {
  return (
    <div className="tabs">
      <Link href="/settings">ทั่วไป</Link>
      <Link href="/settings/users">บัญชีผู้ใช้งาน</Link>
      <Link href="/settings/permissions">สิทธิ์รายบัญชี</Link>
      <Link href="/settings/line">LINE</Link>
      <Link href="/settings/discord">Discord</Link>
    </div>
  );
}
