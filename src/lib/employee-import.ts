import { employeeSchema } from "./domain";

export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 2000;
export type ImportEmployee = { code: string; name: string; active: boolean };

// RFC 4180 fields, including escaped quotes, embedded commas and newlines.
function csvRows(source: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false,
    closed = false;
  const text = source.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else field += c;
    } else if (c === "," || c === "\n" || c === "\r") {
      row.push(field);
      field = "";
      closed = false;
      if (c !== ",") {
        if (row.some((value) => value.trim())) rows.push(row);
        row = [];
        if (c === "\r" && text[i + 1] === "\n") i++;
        if (rows.length > MAX_IMPORT_ROWS + 1)
          throw new Error(`นำเข้าได้ไม่เกิน ${MAX_IMPORT_ROWS} คนต่อครั้ง`);
      }
    } else if (c === '"' && !field && !closed) quoted = true;
    else {
      if (closed || c === '"')
        throw new Error("รูปแบบเครื่องหมายคำพูดใน CSV ไม่ถูกต้อง");
      field += c;
    }
  }
  if (quoted) throw new Error("CSV มีเครื่องหมายคำพูดที่ยังไม่ปิด");
  row.push(field);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

export function parseEmployeeCsv(source: string): ImportEmployee[] {
  if (new TextEncoder().encode(source).length > MAX_IMPORT_BYTES)
    throw new Error("ไฟล์ CSV ต้องมีขนาดไม่เกิน 2 MB");
  const [header, ...rows] = csvRows(source);
  if (!header || !rows.length) throw new Error("ไม่พบข้อมูลพนักงานในไฟล์ CSV");
  if (rows.length > MAX_IMPORT_ROWS)
    throw new Error(`นำเข้าได้ไม่เกิน ${MAX_IMPORT_ROWS} คนต่อครั้ง`);
  const keys = header.map((key) => key.trim().toLowerCase());
  if (new Set(keys).size !== keys.length) throw new Error("ชื่อคอลัมน์ CSV ซ้ำกัน");
  if (
    (!keys.includes("code") && !keys.includes("id")) ||
    (!keys.includes("name") &&
      !(keys.includes("first_name") && keys.includes("last_name")))
  )
    throw new Error("CSV ต้องมีคอลัมน์ code,name หรือ id,first_name,last_name");
  const seen = new Set<string>();
  return rows.map((values, index) => {
    const fail = (message: string): never => {
      throw new Error(`รายการที่ ${index + 1}: ${message}`);
    };
    if (values.length !== keys.length) fail("จำนวนคอลัมน์ไม่ตรงกับหัวตาราง");
    const get = (key: string) => values[keys.indexOf(key)]?.trim() ?? "";
    const code = get(keys.includes("code") ? "code" : "id").toUpperCase();
    const name = keys.includes("name")
      ? get("name")
      : `${get("first_name")} ${get("last_name")}`.trim();
    const status = get(
      keys.includes("active") ? "active" : "status",
    ).toLowerCase();
    if (
      status &&
      !["active", "inactive", "resigned", "true", "false", "1", "0"].includes(
        status,
      )
    )
      fail("สถานะต้องเป็น active/inactive/resigned หรือ true/false หรือ 1/0");
    const parsed = employeeSchema
      .pick({ code: true, name: true, active: true })
      .safeParse({
        code,
        name,
        active: !["inactive", "resigned", "false", "0"].includes(status),
      });
    if (!parsed.success) fail(parsed.error.issues[0].message);
    if (seen.has(code)) fail(`รหัสพนักงาน ${code} ซ้ำในไฟล์`);
    seen.add(code);
    return parsed.data!;
  });
}
