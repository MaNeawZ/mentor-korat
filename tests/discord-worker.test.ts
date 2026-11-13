import { beforeEach, afterEach, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  adminClient: () => ({ from: mocks.from, rpc: mocks.rpc }),
}));
vi.mock("@/lib/auth", () => ({ currentUser: vi.fn() }));
import { runWorker } from "../src/lib/worker";
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
      ? { value: filters.key === "leave_types" ? ["ลาป่วย"] : "edit" }
      : table === "leave_requests"
        ? {
            id: "leave-id",
            document_number: "LE-256911001234",
            status: "WAITING_EVIDENCE",
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
  writes.length = 0;
  mocks.from.mockReset();
  mocks.rpc.mockReset();
  mocks.from.mockImplementation(query);
  mocks.rpc.mockImplementation(
    async (name: string, input: { queue: string }) => {
      if (name !== "claim_jobs") throw new Error("Unexpected worker RPC");
      return {
        data:
          input.queue === "line"
            ? []
            : [
                {
                  id: "outbox-id",
                  leave_id: "leave-id",
                  kind: "WAITING_EVIDENCE",
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
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("sends the committed leave to Discord immediately and records delivery without exposing upload tokens", async () => {
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
