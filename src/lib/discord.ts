import { statusLabels, type Status } from "./domain";
function mentorMention(id: string | null) {
  return id && /^\d{15,22}$/.test(id) ? id : null;
}
const statusStyle: Record<
  Status,
  { icon: string; color: number; hint: string }
> = {
  WAITING_EVIDENCE: {
    icon: "📎",
    color: 0xe6a23c,
    hint: "ส่งลิงก์ให้พนักงานแนบหลักฐาน เพื่อเริ่มตรวจสอบ",
  },
  WAITING_MENTOR_REVIEW: {
    icon: "🔎",
    color: 0x7565df,
    hint: "ได้รับหลักฐานแล้ว รอ Mentor ตรวจสอบขั้นต้น",
  },
  WAITING_FINAL_REVIEW: {
    icon: "📋",
    color: 0x4c8cda,
    hint: "Mentor ตรวจขั้นต้นแล้ว รอหัวหน้าตรวจสอบขั้นสุดท้าย",
  },
  VERIFIED: { icon: "✅", color: 0x27a981, hint: "ตรวจสอบหลักฐานเรียบร้อยแล้ว" },
  REUPLOAD_REQUIRED: {
    icon: "🔁",
    color: 0xe99a38,
    hint: "กรุณาส่งลิงก์ล่าสุดให้พนักงานแนบหลักฐานใหม่",
  },
  REJECTED: {
    icon: "⛔",
    color: 0xda6470,
    hint: "กรุณาเปิดรายการเพื่อดูเหตุผลการปฏิเสธ",
  },
};
const author = { name: "KORAT  ·  ระบบติดตามใบลา" };
function escapeText(value: string) {
  return value.replace(/([\\*_~`|>])/g, "\\$1");
}
export function discordLineNotification(
  leave: {
    id: string;
    document_number: string;
    discord_user_id: string | null;
  },
  kind: "LINE_UNSENT" | "LINE_CORRECTED",
  appUrl: string,
) {
  const mention = mentorMention(leave.discord_user_id);
  const unsent = kind === "LINE_UNSENT";
  const link = new URL(`/leaves/${leave.id}`, appUrl).toString();
  return {
    content: mention ? `<@${mention}>` : "",
    allowed_mentions: { parse: [], users: mention ? [mention] : [] },
    embeds: [
      {
        author,
        title: unsent ? "⚠️ ยกเลิกข้อความ LINE ต้นทาง" : "✏️ อัปเดตข้อมูลใบลาแล้ว",
        url: link,
        color: unsent ? 0xe6a23c : 0x4c8cda,
        description: unsent
          ? "พนักงานยกเลิกข้อความเดิม กรุณาตรวจข้อมูลล่าสุดก่อนดำเนินการต่อ"
          : "ข้อมูลต้นทางได้รับการแก้ไขแล้ว กรุณาใช้รายละเอียดและลิงก์อัปโหลดล่าสุด",
        fields: [
          { name: "เลขที่ใบลา", value: leave.document_number, inline: true },
          {
            name: "ดำเนินการต่อ",
            value: `[เปิดใบลาและตรวจรายละเอียด →](${link})`,
            inline: true,
          },
        ],
        footer: { text: "แจ้งให้ Mentor ที่รับผิดชอบทราบ" },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}
export function discordStatusNotification(
  leave: {
    id: string;
    document_number: string;
    status: Status;
    discord_user_id: string | null;
  },
  changedStatus: Status,
  appUrl: string,
) {
  const mention = mentorMention(leave.discord_user_id);
  const style = statusStyle[changedStatus],
    link = new URL(`/leaves/${leave.id}`, appUrl).toString();
  return {
    content: mention ? `<@${mention}>` : "",
    allowed_mentions: { parse: [], users: mention ? [mention] : [] },
    embeds: [
      {
        author,
        title: `${style.icon} ${statusLabels[changedStatus]}`,
        url: link,
        color: style.color,
        description: style.hint,
        fields: [
          { name: "เลขที่ใบลา", value: leave.document_number, inline: true },
          {
            name: "สถานะล่าสุด",
            value: statusLabels[leave.status],
            inline: true,
          },
          { name: "ดำเนินการต่อ", value: `[เปิดรายละเอียดใบลา →](${link})` },
        ],
        footer: { text: "อัปเดตความคืบหน้า · ตรวจหลักฐานเท่านั้น" },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}
export function discordPayload(
  l: {
    id: string;
    document_number: string;
    reason: string;
    status: Status;
    leave_date: string;
    leave_type: string;
    employee_name: string;
    employee_code: string;
    department: string;
    discord_user_id: string | null;
    line_retracted?: boolean;
  },
  appUrl: string,
  uploadUrl?: string,
  eventStatus?: Status,
) {
  const mention = mentorMention(l.discord_user_id);
  const style = statusStyle[l.status],
    link = new URL(`/leaves/${l.id}`, appUrl).toString();
  return {
    content: mention ? `<@${mention}>` : "",
    allowed_mentions: { parse: [], users: mention ? [mention] : [] },
    embeds: [
      {
        author,
        title: l.line_retracted
          ? "⚠️ ข้อความ LINE ถูกยกเลิก — รอแก้ไข/ตรวจสอบ"
          : `${style.icon} ${statusLabels[l.status]}`,
        description: l.line_retracted
          ? "กรุณารอข้อความแก้ไขหรือให้หัวหน้าตรวจสอบก่อนดำเนินการต่อ"
          : style.hint,
        url: link,
        color: l.line_retracted ? 0xe6a23c : style.color,
        fields: [
          {
            name: "พนักงาน",
            value:
              `**${escapeText(l.employee_name)}**\nรหัสพนักงาน \`${l.employee_code}\``.slice(
                0,
                1024,
              ),
          },
          {
            name: "แผนก",
            value: escapeText(l.department) || "—",
            inline: true,
          },
          {
            name: "วันที่ / ประเภท",
            value: `${l.leave_date} · ${l.leave_type}`,
            inline: true,
          },
          {
            name: "เหตุผล",
            value: l.line_retracted
              ? "ข้อความต้นทางถูกยกเลิก กรุณาตรวจข้อมูลใหม่"
              : escapeText(l.reason).slice(0, 1024) || "—",
          },
          { name: "เลขที่ใบลา", value: l.document_number, inline: true },
          { name: "สถานะ", value: statusLabels[l.status], inline: true },
          ...(eventStatus && eventStatus !== l.status
            ? [{ name: "สถานะของเหตุการณ์นี้", value: statusLabels[eventStatus] }]
            : []),
          ...(uploadUrl &&
          !l.line_retracted &&
          ["WAITING_EVIDENCE", "REUPLOAD_REQUIRED"].includes(l.status)
            ? [
                {
                  name: "ลิงก์อัปโหลดหลักฐาน — ส่งต่อให้พนักงาน",
                  value: `คัดลอกลิงก์ด้านล่างส่งให้พนักงาน · อัปโหลดได้ครั้งเดียว\n${uploadUrl}`,
                },
              ]
            : []),
          { name: "ดูรายละเอียด", value: `[เปิดใบลาในระบบ →](${link})` },
        ],
        footer: { text: "KORAT · ตรวจหลักฐานเท่านั้น ไม่ใช่การอนุมัติวันลาในระบบ HR" },
      },
    ],
  };
}
