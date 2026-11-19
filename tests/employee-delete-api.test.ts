import { beforeEach, afterEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ user: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/auth", () => ({ currentUser: m.user }));
vi.mock("@/lib/supabase/server", () => ({
  sessionClient: async () => ({ rpc: m.rpc }),
}));
import { POST } from "../src/app/api/manage/employees-delete/route";
const id = "55555555-5555-4555-8555-555555555555";
function request(
  payload: unknown = { employee_ids: [id] },
  origin = "https://example.com",
) {
  return new Request("https://example.com/api/manage/employees-delete", {
    method: "POST",
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://example.com");
  m.user.mockResolvedValue({ active: true, permissions: ["employees.manage"] });
  m.rpc.mockResolvedValue({ error: null, data: { deleted: 1 } });
});
afterEach(() => vi.unstubAllEnvs());
it("deletes an explicit selection through the session RPC, deduplicating IDs", async () => {
  const response = await POST(request({ employee_ids: [id, id] }));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ deleted: 1 });
  expect(m.rpc).toHaveBeenCalledWith("delete_employees", {
    employee_ids: [id],
  });
});
it.each([[], ["bad-id"], Array(201).fill(id)])(
  "rejects invalid selections %s",
  async (ids) => {
    expect((await POST(request({ employee_ids: ids }))).status).toBe(400);
    expect(m.rpc).not.toHaveBeenCalled();
  },
);
it("requires permission, authentication, and the correct origin", async () => {
  expect((await POST(request(undefined, "https://evil.example"))).status).toBe(
    403,
  );
  m.user.mockResolvedValue({ active: true, permissions: ["mentors.assign"] });
  expect((await POST(request())).status).toBe(403);
  m.user.mockResolvedValue(null);
  expect((await POST(request())).status).toBe(401);
  expect(m.rpc).not.toHaveBeenCalled();
});
it("explains leave history conflicts without claiming the batch was deleted", async () => {
  m.rpc.mockResolvedValue({ error: { message: "EMPLOYEE_HAS_LEAVES:68364" } });
  const response = await POST(request());
  expect(response.status).toBe(409);
  expect((await response.json()).error).toContain("ยังไม่ได้ลบพนักงาน");
});
it("rejects oversized request bodies", async () => {
  expect((await POST(request({ extra: "x".repeat(17000) }))).status).toBe(413);
  expect(m.rpc).not.toHaveBeenCalled();
});
it("identifies a missing database migration instead of returning a generic save error", async () => {
  m.rpc.mockResolvedValue({
    error: { code: "PGRST202", message: "Missing function" },
  });
  const response = await POST(request());
  expect(response.status).toBe(503);
  expect((await response.json()).error).toContain(
    "EMPLOYEE_DELETE_NOT_INSTALLED",
  );
});
