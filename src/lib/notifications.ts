import { statusLabels, type Status } from "./domain";
export type NotificationItem = {
  id: string;
  title: string;
  leave_id: string | null;
  read_at: string | null;
  created_at: string;
  leave_requests?: {
    document_number: string;
    status: Status;
    employees?: { name: string; code: string } | null;
  } | null;
};
export const notificationSelect =
  "id,title,leave_id,read_at,created_at,leave_requests(document_number,status,employees(name,code))";
export function notificationKind(title: string) {
  if (/ต้องตรวจสอบ|ไม่สำเร็จ/.test(title))
    return { kind: "attention" as const, label: "ต้องตรวจสอบ" };
  if (/^พนักงานยกเลิก|^ข้อความ.*ถูกยกเลิก/.test(title))
    return { kind: "attention" as const, label: "ต้องตรวจสอบ" };
  if (/แก้ไข/.test(title))
    return { kind: "updated" as const, label: "ข้อมูลอัปเดต" };
  if (/ยกเลิก/.test(title))
    return { kind: "attention" as const, label: "ต้องตรวจสอบ" };
  if (/หลักฐานใหม่/.test(title))
    return { kind: "evidence" as const, label: "หลักฐานใหม่" };
  if (/มอบหมาย|ใบลาใหม่/.test(title))
    return { kind: "assigned" as const, label: "งานใหม่" };
  return { kind: "status" as const, label: "อัปเดตสถานะ" };
}
export function notificationContext(item: NotificationItem) {
  const leave = item.leave_requests;
  return {
    document: leave?.document_number,
    employee: leave?.employees
      ? `${leave.employees.name} · ${leave.employees.code}`
      : null,
    status: leave?.status ? statusLabels[leave.status] : null,
  };
}
export function notificationTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  }).format(date);
}
