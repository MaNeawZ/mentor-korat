const labels: Record<string, string> = {
  UNKNOWN_EMPLOYEE: "ยังไม่พบรหัสพนักงานนี้ในระบบตอนประมวลผล",
  INVALID_EMPLOYEE: "อ่านรหัสหรือชื่อพนักงานจากข้อความไม่ได้",
  NAME_MISMATCH: "ชื่อในข้อความไม่ตรงกับชื่อของรหัสพนักงานในระบบ",
  DUPLICATE_DOCUMENT: "เลขที่ใบลานี้มีในระบบแล้ว จึงไม่สร้างรายการซ้ำ",
  MISSING_DOCUMENT: "ไม่พบเลขที่ใบลา",
  INVALID_DATE: "วันที่ลาไม่ถูกต้องหรืออ่านไม่ได้",
  UNKNOWN_LEAVE_TYPE: "ไม่พบประเภทการลาที่ระบบรู้จัก",
  MISSING_REASON: "ไม่พบเหตุผลการลา",
};
export function describeParsingIssues(issues: unknown): string {
  if (!Array.isArray(issues)) return "ข้อความต้องตรวจสอบเพิ่มเติม";
  return issues
    .map((code) =>
      typeof code === "string" ? labels[code] || code : "ข้อมูลไม่ถูกต้อง",
    )
    .join(" · ");
}
