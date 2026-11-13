import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { parseLeave, parseThaiDate } from "../src/lib/line/parser";
import {
  verifyLineSignature,
  newToken,
  hashToken,
  deriveToken,
  imageType,
} from "../src/lib/security";
import {
  assertTransition,
  defaultPermissions,
  reviewSchema,
  type Profile,
} from "../src/lib/domain";
import { discordPayload } from "../src/lib/discord";
const mentor: Profile = {
  id: "mentor",
  name: "Mentor",
  role: "MENTOR",
  active: true,
  discord_user_id: null,
  permissions: [...defaultPermissions.MENTOR],
};
describe("deterministic LINE parser", () => {
  it.each([
    ["13 พฤศจิกายน 2568", "2025-11-13"],
    ["29 กุมภาพันธ์ 2567", "2024-02-29"],
    ["1/1/2026", "2026-01-01"],
    ["31/02/2568", null],
    ["29 กุมภาพันธ์ 2568", null],
    ["1/13/2568", null],
  ])("parses %s", (s, out) => expect(parseThaiDate(s)).toBe(out));
  it("extracts the required example without changing its inconsistent document year", () => {
    const r = parseLeave(
      "68364 จักรพรรดิ์ อนุไพร\nขออนุญาตลาป่วยช่วงบ่าย\n13 พฤศจิกายน 2568\nเนื่องจากมีอาการเส้นตึงที่คอและปวดจึงลาไปพบแพทย์\nเลขที่ใบลา : LE-256911003477",
    );
    expect(r).toMatchObject({
      employee_code: "68364",
      employee_name: "จักรพรรดิ์ อนุไพร",
      leave_date: "2025-11-13",
      document_number: "LE-256911003477",
      period: "PM",
      issues: [],
    });
  });
  it("records missing fields instead of inventing values", () =>
    expect(parseLeave("ขออนุญาตลาป่วย")).toMatchObject({
      issues: expect.arrayContaining([
        "MISSING_DOCUMENT",
        "INVALID_EMPLOYEE",
        "INVALID_DATE",
        "MISSING_REASON",
      ]),
    }));
  it("ignores unrelated text", () => expect(parseLeave("สวัสดีครับ")).toBeNull());
  it("accepts configured leave types", () =>
    expect(
      parseLeave(
        "12345 ทดสอบ ระบบ\nลาอบรม\n1/1/2569\nเหตุผล: อบรม\nLE-256900001",
        ["ลาอบรม"],
      )?.leave_type,
    ).toBe("ลาอบรม"));
});
describe("security primitives", () => {
  it("verifies raw-body HMAC and rejects changed bodies and invalid lengths", () => {
    const raw = '{"events":[]}';
    const sig = createHmac("sha256", "secret").update(raw).digest("base64");
    expect(verifyLineSignature(raw, sig, "secret")).toBe(true);
    expect(verifyLineSignature(raw + " ", sig, "secret")).toBe(false);
    expect(verifyLineSignature(raw, "bad", "secret")).toBe(false);
  });
  it("issues independent high-entropy tokens with a deterministic server-only recovery", () => {
    const secret = "x".repeat(40),
      a = newToken(secret),
      b = newToken(secret);
    expect(a.token).toHaveLength(43);
    expect(a.token).not.toBe(b.token);
    expect(hashToken(a.token)).toBe(a.hash);
    expect(deriveToken(a.nonce, secret)).toBe(a.token);
    expect(deriveToken(a.nonce, "y".repeat(40))).not.toBe(a.token);
  });
  it("requires a strong upload secret", () =>
    expect(() => newToken("weak")).toThrow());
  it("rejects spoofed file contents", () => {
    expect(imageType(Buffer.from("<script>alert(1)</script>"))).toBeNull();
    expect(imageType(new Uint8Array([255, 216, 255]))).toBe("image/jpeg");
  });
});
describe("review policy", () => {
  it("allows assigned mentor precheck but forbids final decision even with permission override", () => {
    expect(() =>
      assertTransition("WAITING_MENTOR_REVIEW", "precheck", mentor),
    ).not.toThrow();
    expect(() =>
      assertTransition("WAITING_FINAL_REVIEW", "verify", {
        ...mentor,
        permissions: [...mentor.permissions, "evidence.final_review"],
      }),
    ).toThrow();
  });
  it("blocks disabled users", () =>
    expect(() =>
      assertTransition("WAITING_MENTOR_REVIEW", "precheck", {
        ...mentor,
        active: false,
      }),
    ).toThrow());
  it("requires final-review permission for HR", () => {
    const hr = {
      ...mentor,
      role: "HR" as const,
      permissions: [...defaultPermissions.HR],
    };
    expect(() =>
      assertTransition("WAITING_FINAL_REVIEW", "verify", hr),
    ).not.toThrow();
    expect(() =>
      assertTransition("WAITING_MENTOR_REVIEW", "verify", hr),
    ).toThrow();
    expect(() =>
      assertTransition("WAITING_FINAL_REVIEW", "verify", {
        ...hr,
        permissions: [],
      }),
    ).toThrow();
  });
  it("rejects incomplete reupload and rejection reasons", () => {
    expect(
      reviewSchema.safeParse({ action: "reupload", version: 1 }).success,
    ).toBe(false);
    expect(
      reviewSchema.safeParse({ action: "reject", version: 1, reason: "ไม่ชัด" })
        .success,
    ).toBe(false);
  });
  it("does not allow mentions injected through LINE content or expose upload token", () => {
    const p = discordPayload(
      {
        id: "x",
        document_number: "LE-12345678",
        reason: "@everyone <@123456789012345678>",
        status: "WAITING_EVIDENCE",
        leave_date: "2026-11-13",
        leave_type: "ลาป่วย",
        employee_code: "12345",
        employee_name: "ทดสอบ",
        department: "Dev",
        discord_user_id: "234567890123456789",
      },
      "https://example.com",
    );
    expect(p.allowed_mentions).toEqual({
      parse: [],
      users: ["234567890123456789"],
    });
    expect(JSON.stringify(p)).not.toContain("/upload/");
    expect(JSON.stringify(p)).not.toContain("image");
  });
});
