import { describe, expect, it } from "vitest";
import { MAX_IMPORT_ROWS, parseEmployeeCsv } from "../src/lib/employee-import";

describe("employee CSV import", () => {
  it("maps resigned employees in the supplied export to inactive", () => {
    expect(
      parseEmployeeCsv(
        "id,first_name,last_name,status\n123,Former,Employee,resigned",
      )[0].active,
    ).toBe(false);
  });
  it("maps the supplied export format without using its numeric ID as a database UUID", () => {
    expect(
      parseEmployeeCsv(
        "\uFEFFid,position_name,first_name,last_name,nick_name,start_date,created_at,updated_at,status\r\n00123,HR,สมหญิง,ใจดี,เอ,2026-01-01,,,active\r\nOLS456,Engineer,สมชาย,ใจดี,บี,,,,inactive\r\n",
      ),
    ).toEqual([
      { code: "00123", name: "สมหญิง ใจดี", active: true },
      { code: "OLS456", name: "สมชาย ใจดี", active: false },
    ]);
  });
  it("handles escaped quotes, multiline names, commas and blank lines", () => {
    expect(
      parseEmployeeCsv(
        'code,name,active\n\nols123,"First, \"\"Nickname\"\"\nLast",false\n',
      ),
    ).toEqual([
      { code: "OLS123", name: 'First, "Nickname"\nLast', active: false },
    ]);
  });
  it.each([
    ["code,name\n123,Good\n123,Other", /ซ้ำในไฟล์/],
    ["code,name\n123,Good\nBAD-123,Bad", /รายการที่ 2/],
    ["code,name,status\n123,Good,unknown", /สถานะ/],
    ['code,name\n123,"Unclosed', /ยังไม่ปิด/],
    ['code,name\n123,"Good"bad', /คำพูด/],
    ["code,name\n123,Good,extra", /จำนวนคอลัมน์/],
    ["code,name,name\n123,A,B", /คอลัมน์.*ซ้ำ/],
    ["first_name,last_name\nA,B", /ต้องมีคอลัมน์/],
    ["code,name\n", /ไม่พบข้อมูล/],
  ])("rejects invalid CSV: %s", (source, error) =>
    expect(() => parseEmployeeCsv(source)).toThrow(error),
  );
  it("bounds import size and row count", () => {
    expect(() => parseEmployeeCsv("a".repeat(2 * 1024 * 1024 + 1))).toThrow(
      /2 MB/,
    );
    expect(() =>
      parseEmployeeCsv(
        "code,name\n" +
          Array.from(
            { length: MAX_IMPORT_ROWS + 1 },
            (_, i) => `${i + 100},Good`,
          ).join("\n"),
      ),
    ).toThrow(/ไม่เกิน/);
  });
});
