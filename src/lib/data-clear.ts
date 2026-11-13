import { z } from "zod";

export const CLEAR_CONFIRMATION = "ล้างข้อมูลใบลา";
export const AUDIT_CLEAR_CONFIRMATION = "ล้างประวัติการดำเนินการ";
export const clearCountLabels: Record<string, string> = {
  leaves: "ใบลา",
  evidence: "ไฟล์หลักฐาน",
  upload_links: "ลิงก์อัปโหลด",
  reviews: "ประวัติการตรวจใบลา",
  notifications: "แจ้งเตือนในเว็บ",
  discord_links: "ข้อมูลอ้างอิงข้อความ Discord",
  discord_queue: "คิว Discord",
  line_messages: "ข้อความต้นฉบับ LINE",
  parsing_issues: "รายการอ่านข้อความผิด",
  line_events: "รายการรับข้อความ LINE",
};
export type ClearPreview = {
  counts: Record<string, number>;
  snapshot: string;
  storage_pending: number;
  storage_failed: number;
};
export const clearRequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("clear"),
    snapshot: z.string().regex(/^[0-9a-f]{32}$/),
    confirmation: z.literal(CLEAR_CONFIRMATION),
    reason: z.string().trim().min(5, "กรุณาระบุเหตุผลอย่างน้อย 5 ตัวอักษร").max(500),
  }),
  z.object({ action: z.literal("retry_files") }),
  z.object({
    action: z.literal("clear_history"),
    snapshot: z.string().regex(/^[0-9a-f]{32}$/),
    confirmation: z.literal(AUDIT_CLEAR_CONFIRMATION),
    reason: z.string().trim().min(5, "กรุณาระบุเหตุผลอย่างน้อย 5 ตัวอักษร").max(500),
  }),
]);
