import { statusLabels, type Status } from "./domain";
function mentorMention(id: string | null) {
  return id && /^\d{15,22}$/.test(id) ? id : null;
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
  return {
    content: [
      mention ? `<@${mention}>` : null,
      `🔄 เปลี่ยนสถานะใบลา ${leave.document_number}`,
      `สถานะที่เปลี่ยน: ${statusLabels[changedStatus]}`,
      changedStatus !== leave.status
        ? `สถานะล่าสุด: ${statusLabels[leave.status]}`
        : null,
      new URL(`/leaves/${leave.id}`, appUrl).toString(),
    ]
      .filter(Boolean)
      .join("\n"),
    allowed_mentions: { parse: [], users: mention ? [mention] : [] },
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
  },
  appUrl: string,
  uploadUrl?: string,
  eventStatus?: Status,
) {
  const mention = mentorMention(l.discord_user_id);
  return {
    content: mention ? `<@${mention}>` : undefined,
    allowed_mentions: { parse: [], users: mention ? [mention] : [] },
    embeds: [
      {
        title: `📋 ใบลา · ${statusLabels[l.status]}`,
        url: `${appUrl}/leaves/${l.id}`,
        color: l.status === "VERIFIED" ? 0x10b981 : 0x6366f1,
        fields: [
          {
            name: "พนักงาน",
            value: `${l.employee_code} · ${l.employee_name}`.slice(0, 1024),
          },
          { name: "แผนก", value: l.department || "—", inline: true },
          {
            name: "วันที่ / ประเภท",
            value: `${l.leave_date} · ${l.leave_type}`,
            inline: true,
          },
          { name: "เหตุผล", value: l.reason.slice(0, 1024) || "—" },
          { name: "เลขที่ใบลา", value: l.document_number },
          { name: "สถานะ", value: statusLabels[l.status] },
          ...(eventStatus && eventStatus !== l.status
            ? [{ name: "สถานะของเหตุการณ์นี้", value: statusLabels[eventStatus] }]
            : []),
          ...(uploadUrl &&
          ["WAITING_EVIDENCE", "REUPLOAD_REQUIRED"].includes(l.status)
            ? [
                {
                  name: "ลิงก์อัปโหลดหลักฐาน — ส่งต่อให้พนักงาน",
                  value: `${uploadUrl}\nMentor คัดลอกลิงก์นี้ส่งให้พนักงานได้เลย ใช้อัปโหลดได้ครั้งเดียว`,
                },
              ]
            : []),
        ],
        footer: { text: "ตรวจหลักฐานเท่านั้น ไม่ใช่การอนุมัติวันลาในระบบ HR" },
      },
    ],
  };
}
