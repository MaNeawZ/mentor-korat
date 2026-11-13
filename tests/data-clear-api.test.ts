import { beforeEach, afterEach, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({ user: vi.fn(), rpc: vi.fn(), wake: vi.fn() }));
vi.mock("@/lib/auth", () => ({ currentUser: m.user }));
vi.mock("@/lib/supabase/server", () => ({
  sessionClient: async () => ({ rpc: m.rpc }),
}));
vi.mock("@/lib/worker-wakeup", () => ({ wakeWorker: m.wake }));
import { GET, POST } from "../src/app/api/settings/clear-data/route";
const input = {
  action: "clear",
  snapshot: "a".repeat(32),
  confirmation: "ล้างข้อมูลใบลา",
  reason: "ข้อมูลทดสอบ",
};
const request = (data: unknown = input, origin = "https://example.com") =>
  new Request("https://example.com/api/settings/clear-data", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(data),
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://example.com");
  m.user.mockResolvedValue({
    role: "CENTER_HEAD",
    active: true,
    permissions: ["data.clear"],
  });
  m.rpc.mockResolvedValue({
    data: {
      counts: { leaves: 1 },
      snapshot: input.snapshot,
      cleared: { leaves: 1 },
      storage_pending: 0,
    },
    error: null,
  });
});
afterEach(() => vi.unstubAllEnvs());
it("denies anonymous, non-head and missing permissions before querying data", async () => {
  m.user.mockResolvedValue(null);
  expect((await GET()).status).toBe(401);
  m.user.mockResolvedValue({
    role: "HR",
    active: true,
    permissions: ["data.clear"],
  });
  expect((await POST(request())).status).toBe(403);
  m.user.mockResolvedValue({
    role: "CENTER_HEAD",
    active: true,
    permissions: [],
  });
  expect((await GET()).status).toBe(403);
  expect(m.rpc).not.toHaveBeenCalled();
});
it("checks origin and confirmation before invoking the deletion transaction", async () => {
  expect((await POST(request(input, "https://attacker.invalid"))).status).toBe(
    403,
  );
  expect(
    (await POST(request({ ...input, confirmation: "wrong" }))).status,
  ).toBe(400);
  expect((await POST(request({ ...input, reason: "x" }))).status).toBe(400);
  expect(m.rpc).not.toHaveBeenCalled();
});
it("previews without mutations, disables caching, and forwards the reviewed snapshot to the guarded RPC", async () => {
  const r = await GET();
  expect(r.status).toBe(200);
  expect(r.headers.get("cache-control")).toContain("no-store");
  expect(m.rpc).toHaveBeenCalledWith("preview_leave_data_clear");
  expect(m.wake).not.toHaveBeenCalled();
  expect((await POST(request())).status).toBe(200);
  expect(m.rpc).toHaveBeenLastCalledWith("clear_leave_data", {
    expected_snapshot: input.snapshot,
    confirmation: input.confirmation,
    reason: input.reason,
  });
  expect(m.wake).toHaveBeenCalledOnce();
});
it("reports stale previews, active workers and missing migration without scheduling work", async () => {
  for (const [error, status] of [
    [{ message: "STALE_CLEAR_PREVIEW" }, 409],
    [{ message: "CLEAR_BUSY" }, 409],
    [{ message: "lock unavailable", code: "55P03" }, 409],
    [{ message: "missing", code: "PGRST202" }, 503],
  ] as const) {
    m.rpc.mockResolvedValue({ data: null, error });
    expect((await POST(request())).status).toBe(status);
  }
  expect(m.wake).not.toHaveBeenCalled();
});
it("retries durable file failures through the guarded RPC", async () => {
  expect((await POST(request({ action: "retry_files" }))).status).toBe(200);
  expect(m.rpc).toHaveBeenCalledWith("retry_storage_cleanup");
  expect(m.wake).toHaveBeenCalledOnce();
});
it("explains safeupdate failures and emits only sanitized codes for unknown database errors", async () => {
  m.rpc.mockResolvedValue({
    data: null,
    error: { code: "21000", message: "DELETE requires a WHERE clause" },
  });
  const r = await POST(request());
  expect(r.status).toBe(503);
  expect((await r.json()).error).toContain("CLEAR_SAFEUPDATE");
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    m.rpc.mockResolvedValue({
      data: null,
      error: {
        code: "23514",
        message: "private employee data in provider error",
      },
    });
    const failure = await POST(request());
    expect((await failure.json()).error).toContain("CLEAR_DB_23514");
    expect(JSON.stringify(log.mock.calls)).not.toContain("private employee");
    expect(m.wake).not.toHaveBeenCalled();
  } finally {
    log.mockRestore();
  }
});
