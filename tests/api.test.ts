import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { createHmac } from "node:crypto";
import { z } from "zod";
const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  user: vi.fn(),
  session: vi.fn(),
  wake: vi.fn(),
  ingest: vi.fn(),
}));
vi.mock("@/lib/line/ingest", () => ({ ingestIncomingLineJobs: mocks.ingest }));
vi.mock("@/lib/worker-wakeup", () => ({ wakeWorker: mocks.wake }));
vi.mock("@/lib/supabase/server", () => ({
  adminClient: () => ({ from: mocks.from, rpc: mocks.rpc }),
  sessionClient: mocks.session,
}));
vi.mock("@/lib/auth", () => ({ currentUser: mocks.user }));
import { POST as webhook } from "../src/app/api/webhooks/line/route";
import { GET as evidence } from "../src/app/api/evidence/[id]/route";
import { POST as review } from "../src/app/api/leaves/[id]/[action]/route";
import { limitedBody } from "../src/lib/body";
import { checkOrigin, apiUser } from "../src/lib/api";
import {
  validateSql,
  reviewedMigrations,
} from "../scripts/migration-safety.mjs";
const group = "C" + "a".repeat(32);
function lineRequest(events: unknown[], valid = true) {
  const raw = JSON.stringify({ events });
  const signature = createHmac("sha256", "test-secret")
    .update(raw)
    .digest("base64");
  return new Request("https://example.com/api/webhooks/line", {
    method: "POST",
    headers: { "x-line-signature": valid ? signature : "bad" },
    body: raw,
  });
}
const event = {
  webhookEventId: "evt-1",
  type: "message",
  source: { type: "group", groupId: group },
  message: { id: "m-1", type: "text", text: "ลาป่วย" },
};
beforeEach(() => {
  vi.stubEnv("LINE_CHANNEL_SECRET", "test-secret");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://example.com");
  mocks.user.mockResolvedValue(null);
  mocks.from.mockReset();
  mocks.rpc.mockReset();
  mocks.wake.mockReset();
  mocks.ingest.mockReset();
  mocks.ingest.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());
describe("HTTP trust boundaries", () => {
  it("rejects invalid LINE signature before database access", async () => {
    const r = await webhook(lineRequest([event], false));
    expect(r.status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.wake).not.toHaveBeenCalled();
    expect(mocks.ingest).not.toHaveBeenCalled();
  });
  it("accepts LINE verify requests with no events", async () => {
    mocks.from.mockReturnValue({
      select: () => ({ eq: async () => ({ data: [], error: null }) }),
    });
    expect((await webhook(lineRequest([]))).status).toBe(200);
  });
  it("discovers unconfirmed group IDs without enqueueing unauthorized message data", async () => {
    const upsert = vi.fn(async () => ({ error: null }));
    mocks.from.mockImplementation((table) => {
      expect(table).toBe("line_groups");
      return {
        upsert,
        select: () => ({ eq: async () => ({ data: [], error: null }) }),
      };
    });
    expect((await webhook(lineRequest([event]))).status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      [{ id: group, name: "กลุ่มที่รอยืนยัน", active: false }],
      { onConflict: "id", ignoreDuplicates: true },
    );
    expect(mocks.wake).not.toHaveBeenCalled();
  });
  it("enqueues authorized events idempotently", async () => {
    const insert = vi.fn(async () => ({ error: null }));
    mocks.from.mockImplementation((table) =>
      table === "line_groups"
        ? {
            upsert: async () => ({ error: null }),
            select: () => ({
              eq: async () => ({ data: [{ id: group }], error: null }),
            }),
          }
        : { upsert: insert },
    );
    expect((await webhook(lineRequest([event]))).status).toBe(200);
    expect(insert).toHaveBeenCalledWith([{ id: "evt-1", payload: event }], {
      onConflict: "id",
      ignoreDuplicates: true,
    });
    expect(mocks.wake).toHaveBeenCalledOnce();
    expect(mocks.ingest).toHaveBeenCalledWith(
      expect.anything(),
      [{ id: "evt-1", payload: event }],
      expect.any(Number),
    );
    expect(insert.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.ingest.mock.invocationCallOrder[0],
    );
  });
  it("accepts signed unsend events only from active groups and retains sender IDs for safe replacements", async () => {
    const upsert = vi.fn(async () => ({ error: null }));
    mocks.from.mockImplementation((table) =>
      table === "line_groups"
        ? {
            upsert: async () => ({ error: null }),
            select: () => ({
              eq: async () => ({ data: [{ id: group }], error: null }),
            }),
          }
        : { upsert },
    );
    const unsend = {
      webhookEventId: "unsend-event",
      type: "unsend",
      source: { type: "group", groupId: group, userId: "U" + "a".repeat(32) },
      unsend: { messageId: "m-1" },
    };
    expect((await webhook(lineRequest([unsend]))).status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      [{ id: "unsend-event", payload: unsend }],
      expect.anything(),
    );
    expect(mocks.ingest).toHaveBeenCalled();
    upsert.mockClear();
    await webhook(
      lineRequest([
        {
          ...unsend,
          source: { ...unsend.source, groupId: "C" + "b".repeat(32) },
        },
      ]),
    );
    expect(upsert).not.toHaveBeenCalled();
  });
  it("prepares a replacement upload link only server-side when the head corrects a retracted leave", async () => {
    vi.stubEnv("UPLOAD_TOKEN_SECRET", "s".repeat(40));
    mocks.user.mockResolvedValue({
      id: "head",
      role: "CENTER_HEAD",
      active: true,
      permissions: ["leaves.edit"],
    });
    mocks.session.mockResolvedValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: "11111111-1111-4111-8111-111111111111",
                line_retracted: true,
              },
              error: null,
            }),
          }),
        }),
      }),
      rpc: mocks.rpc,
    });
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    const id = "11111111-1111-4111-8111-111111111111";
    const response = await review(
      new Request(`https://example.com/api/leaves/${id}/correct`, {
        method: "POST",
        headers: { origin: "https://example.com" },
        body: JSON.stringify({
          version: 2,
          leave_date: "2026-11-15",
          leave_type: "ลาป่วย",
          period: "AM",
          reason: "แก้ไขแล้ว",
          correction_reason: "ตรวจข้อความใหม่แล้ว",
        }),
      }),
      { params: Promise.resolve({ id, action: "correct" }) },
    );
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "correct_leave",
      expect.objectContaining({
        payload: expect.objectContaining({
          new_token_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
          new_token_nonce: expect.stringMatching(/^[0-9a-f]{64}$/),
        }),
      }),
    );
    expect(JSON.stringify(await response.json())).not.toContain("new_token");
  });
  it("does not report success or wake a worker when durable enqueue fails", async () => {
    mocks.from.mockImplementation((table) =>
      table === "line_groups"
        ? {
            upsert: async () => ({ error: null }),
            select: () => ({
              eq: async () => ({ data: [{ id: group }], error: null }),
            }),
          }
        : {
            upsert: async () => ({
              error: { message: "database unavailable" },
            }),
          },
    );
    expect((await webhook(lineRequest([event]))).status).toBe(503);
    expect(mocks.wake).not.toHaveBeenCalled();
  });
  it("waits for immediate ingestion to finish before acknowledging an accepted leave", async () => {
    mocks.from.mockImplementation((table) =>
      table === "line_groups"
        ? {
            upsert: async () => ({ error: null }),
            select: () => ({
              eq: async () => ({ data: [{ id: group }], error: null }),
            }),
          }
        : { upsert: async () => ({ error: null }) },
    );
    let release!: () => void;
    mocks.ingest.mockReturnValue(
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );
    let acknowledged = false;
    const response = webhook(lineRequest([event])).then((value) => {
      acknowledged = true;
      return value;
    });
    await vi.waitFor(() => expect(mocks.ingest).toHaveBeenCalledOnce());
    expect(acknowledged).toBe(false);
    release();
    expect((await response).status).toBe(200);
  });
  it("blocks anonymous evidence and review access", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(
      (
        await evidence(new Request("https://example.com/api/evidence/" + id), {
          params: Promise.resolve({ id }),
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await review(
          new Request("https://example.com/api/leaves/" + id + "/review", {
            method: "POST",
            headers: { origin: "https://example.com" },
            body: "{}",
          }),
          { params: Promise.resolve({ id, action: "review" }) },
        )
      ).status,
    ).toBe(401);
  });
  it("blocks cross-origin and missing-origin browser mutations", () => {
    expect(() =>
      checkOrigin(
        new Request("https://example.com/api/manage/user", {
          method: "POST",
          headers: { origin: "https://evil.example" },
        }),
      ),
    ).toThrow();
    expect(() =>
      checkOrigin(
        new Request("https://example.com/api/manage/user", { method: "POST" }),
      ),
    ).toThrow();
  });
  it("checks account permission before privileged APIs", async () => {
    mocks.user.mockResolvedValue({
      id: "mentor",
      role: "MENTOR",
      active: true,
      permissions: ["leaves.view_assigned"],
    });
    await expect(apiUser("settings.manage")).rejects.toThrow("ไม่มีสิทธิ์");
  });
  it("bounds streaming bodies without trusting content-length", async () => {
    const request = new Request("https://example.com", {
      method: "POST",
      body: "123456789",
    });
    await expect(limitedBody(request, 8)).rejects.toThrow();
  });
});
describe("migration guard", () => {
  it("checks all reviewed checksums", () =>
    expect(reviewedMigrations()).toHaveLength(11));
  it.each([
    "ALTER TABLE public.live ADD COLUMN bad text;",
    "DROP SCHEMA public CASCADE;",
    "TRUNCATE public.live;",
    "ALTER SYSTEM SET x=1;",
    "CREATE SCHEMA evil;",
    "UPDATE storage.objects SET name='x';",
    "ALTER TABLE mentor_korat.employees DROP CONSTRAINT employee_code_format;",
    "ALTER TABLE mentor_korat.employees DROP CONSTRAINT employee_name_length;",
  ])("rejects prohibited SQL %s", (sql) =>
    expect(() => validateSql(sql)).toThrow(),
  );
  it("allows only the complete reviewed employee-code constraint replacement", () => {
    const statement =
      "ALTER TABLE mentor_korat.employees DROP CONSTRAINT employee_code_format, ADD CONSTRAINT employee_code_format CHECK(code ~ '^[A-Z0-9]{3,12}$');";
    expect(() => validateSql(statement)).not.toThrow();
    expect(() =>
      validateSql(statement + " DROP TABLE mentor_korat.employees;"),
    ).toThrow();
  });
  it("validates identifiers used by route validation", () =>
    expect(z.uuid().safeParse("bad").success).toBe(false));
});
