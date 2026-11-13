import { beforeEach, afterEach, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  adminClient: () => ({ from: mocks.from, rpc: mocks.rpc }),
}));
vi.mock("@/lib/auth", () => ({ currentUser: vi.fn() }));
import { runWorker } from "../src/lib/worker";
import { newToken, hashToken } from "../src/lib/security";
let leaveStatus = "WAITING_EVIDENCE",
  nonce: string | null = null,
  messageId: string | null = null;
let mode = "edit",
  jobKind = "WAITING_EVIDENCE";
const writes: {
  table: string;
  operation: string;
  value: Record<string, unknown>;
}[] = [];
function query(table: string) {
  const filters: Record<string, unknown> = {};
  const q: Record<string, unknown> = {};
  const data = () =>
    table === "app_settings"
      ? { value: filters.key === "leave_types" ? ["ลาป่วย"] : mode }
      : table === "leave_requests"
        ? {
            id: "leave-id",
            document_number: "LE-256911001234",
            status: leaveStatus,
            leave_date: "2026-11-14",
            leave_type: "ลาป่วย",
            reason: "ข้อมูลทดสอบ",
            mentor_id: null,
            employees: {
              code: "12345",
              name: "พนักงาน ทดสอบ",
              departments: { name: "Development" },
            },
          }
        : table === "evidence_upload_tokens" &&
            nonce &&
            filters.state === "ACTIVE" &&
            filters.leave_id === "leave-id"
          ? { nonce }
          : table === "discord_messages" && messageId
            ? { message_id: messageId }
            : null;
  q.select = () => q;
  q.eq = (key: string, value: unknown) => {
    filters[key] = value;
    return q;
  };
  q.single = async () => ({ data: data(), error: null });
  q.maybeSingle = q.single;
  for (const operation of ["update", "upsert", "insert"])
    q[operation] = (value: Record<string, unknown>) => {
      writes.push({ table, operation, value });
      return q;
    };
  q.then = (
    resolve: (value: { data: null; error: null }) => unknown,
    reject?: (reason: unknown) => unknown,
  ) => Promise.resolve({ data: null, error: null }).then(resolve, reject);
  return q;
}
beforeEach(() => {
  leaveStatus = "WAITING_EVIDENCE";
  nonce = null;
  messageId = null;
  mode = "edit";
  jobKind = "WAITING_EVIDENCE";
  writes.length = 0;
  mocks.from.mockReset();
  mocks.rpc.mockReset();
  mocks.from.mockImplementation(query);
  mocks.rpc.mockImplementation(
    async (name: string, input: { queue: string }) => {
      if (name === "claim_storage_cleanup") return { data: [], error: null };
      if (name !== "claim_jobs") throw new Error("Unexpected worker RPC");
      return {
        data:
          input.queue === "line"
            ? []
            : [
                {
                  id: "outbox-id",
                  leave_id: "leave-id",
                  kind: jobKind,
                  attempts: 1,
                },
              ],
        error: null,
      };
    },
  );
  vi.stubEnv(
    "DISCORD_WEBHOOK_URL",
    "https://discord.com/api/webhooks/1234/test-token",
  );
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://example.com");
  vi.stubEnv("DISCORD_BOT_TOKEN", "");
  vi.stubEnv("UPLOAD_TOKEN_SECRET", "s".repeat(40));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("sends the committed leave to Discord and omits an upload link when none is active", async () => {
  const send = vi.fn(async () => Response.json({ id: "discord-message-id" }));
  vi.stubGlobal("fetch", send);
  expect(await runWorker()).toEqual({ processed: 1 });
  expect(send).toHaveBeenCalledOnce();
  expect(writes).toContainEqual({
    table: "discord_messages",
    operation: "upsert",
    value: { leave_id: "leave-id", message_id: "discord-message-id" },
  });
  expect(writes).toContainEqual({
    table: "notification_outbox",
    operation: "update",
    value: { status: "DONE", locked_until: null, error_code: null },
  });
  expect(JSON.stringify(send.mock.calls)).not.toContain("/upload/");
});
it("retains the outbox for retry when Discord rate limits instead of declaring delivery successful", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ retry_after: 120 }, { status: 429 })),
  );
  const before = Date.now();
  expect(await runWorker()).toEqual({ processed: 0 });
  const retry = writes.find(
    (w) => w.table === "notification_outbox" && w.operation === "update",
  )!;
  expect(retry.value).toMatchObject({
    status: "PENDING",
    error_code: "DISCORD_429",
  });
  expect(
    new Date(String(retry.value.available_at)).getTime(),
  ).toBeGreaterThanOrEqual(before + 120_000);
  expect(writes.some((w) => w.table === "discord_messages")).toBe(false);
});
it("keeps the committed leave and retries only delivery when Discord is unavailable", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("network failure with private provider details");
    }),
  );
  expect(await runWorker()).toEqual({ processed: 0 });
  expect(
    writes.find((w) => w.table === "notification_outbox")?.value,
  ).toMatchObject({ status: "PENDING", error_code: "DELIVERY_FAILED" });
  expect(writes.some((w) => w.table === "leave_requests")).toBe(false);
});
it.each(["WAITING_EVIDENCE", "REUPLOAD_REQUIRED"])(
  "includes the existing single-use upload link in the channel for %s without requiring a bot token",
  async (status) => {
    leaveStatus = status;
    const token = newToken("s".repeat(40));
    nonce = token.nonce;
    const send = vi.fn<
      (url: string, options: RequestInit) => Promise<Response>
    >(async () => Response.json({ id: "discord-message-id" }));
    vi.stubGlobal("fetch", send);
    expect(await runWorker()).toEqual({ processed: 1 });
    expect(send).toHaveBeenCalledOnce();
    const payload = JSON.parse(send.mock.calls[0][1].body as string);
    const field = payload.embeds[0].fields.find((f: { name: string }) =>
      f.name.includes("ลิงก์อัปโหลด"),
    );
    expect(field.value).toContain(`https://example.com/upload/${token.token}`);
    expect(field.value).toContain("ส่งให้พนักงาน");
    const url = field.value.split("\n")[0];
    expect(hashToken(new URL(url).pathname.split("/").pop()!)).toBe(token.hash);
    expect(JSON.stringify(payload)).not.toContain(token.nonce);
    expect(payload.allowed_mentions).toEqual({ parse: [], users: [] });
    expect(mocks.rpc.mock.calls.some(([name]) => name === "rotate_token")).toBe(
      false,
    );
  },
);
it("edits the existing Discord message without an upload link after evidence has been submitted", async () => {
  leaveStatus = "WAITING_MENTOR_REVIEW";
  messageId = "existing-message";
  nonce = "a".repeat(64);
  const send = vi.fn<(url: string, options: RequestInit) => Promise<Response>>(
    async () => Response.json({ id: "existing-message" }),
  );
  vi.stubGlobal("fetch", send);
  await runWorker();
  expect(send.mock.calls[0][0]).toContain("/messages/existing-message");
  expect(send.mock.calls[0][1].method).toBe("PATCH");
  expect(send.mock.calls[0][1].body).not.toContain("/upload/");
});
it("does not attach a live link to an old waiting event when the current leave is verified", async () => {
  leaveStatus = "VERIFIED";
  mode = "events";
  jobKind = "WAITING_EVIDENCE";
  nonce = "a".repeat(64);
  const send = vi.fn<(url: string, options: RequestInit) => Promise<Response>>(
    async () => Response.json({ id: "event-message" }),
  );
  vi.stubGlobal("fetch", send);
  await runWorker();
  expect(send.mock.calls[0][1].body).not.toContain("/upload/");
});
it("reuses the same active link on delivery retry", async () => {
  const token = newToken("s".repeat(40));
  nonce = token.nonce;
  const send = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ retry_after: 1 }, { status: 429 }))
    .mockResolvedValueOnce(Response.json({ id: "retried-message" }));
  vi.stubGlobal("fetch", send);
  expect(await runWorker()).toEqual({ processed: 0 });
  expect(await runWorker()).toEqual({ processed: 1 });
  for (const [, options] of send.mock.calls)
    expect(options.body).toContain(`/upload/${token.token}`);
  expect(
    writes.filter((w) => w.table === "evidence_upload_tokens"),
  ).toHaveLength(0);
});
