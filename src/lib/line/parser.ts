const months = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];
export function parseThaiDate(text: string): string | null {
  const full = text.match(
    /(\d{1,2})\s+(มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม)\s+(\d{4})/,
  );
  const numeric = text.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})\b/);
  if (!full && !numeric) return null;
  const day = Number((full || numeric)![1]);
  const month = full ? months.indexOf(full[2]) + 1 : Number(numeric![2]);
  let year = Number((full || numeric)![3]);
  if (year > 2400) year -= 543;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    year < 2000 ||
    year > 2200 ||
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() + 1 !== month ||
    d.getUTCDate() !== day
  )
    return null;
  return d.toISOString().slice(0, 10);
}
export function parseLeave(
  text: string,
  types = ["ลาป่วย", "ลากิจ", "ลาพักร้อน", "ลาอื่น ๆ"],
) {
  const employee = text.match(/^\s*(\d{3,12})\s+([^\n\r]+)/m);
  const document = text
    .match(/(?:เลขที่ใบลา\s*[:：]?\s*)?(LE-\d{8,20})/i)?.[1]
    ?.toUpperCase();
  if (!/ขออนุญาตลา|เลขที่ใบลา|LE-|ลาป่วย|ลากิจ|ลาพักร้อน/.test(text)) return null;
  const date = parseThaiDate(text);
  const type = types.find((t) => text.includes(t));
  const reason = text
    .match(/(?:เนื่องจาก|เหตุผล\s*[:：]?)\s*([\s\S]*?)(?=เลขที่ใบลา|LE-\d|$)/)?.[1]
    ?.trim();
  const issues: string[] = [];
  if (!document) issues.push("MISSING_DOCUMENT");
  if (!employee) issues.push("INVALID_EMPLOYEE");
  if (!date) issues.push("INVALID_DATE");
  if (!type) issues.push("UNKNOWN_LEAVE_TYPE");
  if (!reason) issues.push("MISSING_REASON");
  return {
    employee_code: employee?.[1] || null,
    employee_name: employee?.[2]?.trim() || null,
    document_number: document || null,
    leave_date: date,
    leave_type: type || null,
    period: text.includes("ช่วงบ่าย")
      ? "PM"
      : text.includes("ช่วงเช้า")
        ? "AM"
        : "FULL",
    reason: reason || null,
    issues,
  };
}
