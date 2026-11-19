import { beforeEach, afterEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ user: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/auth", () => ({ currentUser: m.user }));
vi.mock("@/lib/supabase/server", () => ({
  sessionClient: async () => ({ rpc: m.rpc }),
}));
import { POST } from "../src/app/api/manage/employees-import/route";
const department = "66666666-6666-4666-8666-666666666666";
function request(
  body = "id,first_name,last_name,status\n00123,สมหญิง,ใจดี,active",
  origin = "https://example.com",
) {
  return new Request(
    `https://example.com/api/manage/employees-import?department_id=${department}`,
    {
      method: "POST",
      headers: { origin },
      body,
    },
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://example.com");
  m.user.mockResolvedValue({ active: true, permissions: ["employees.manage"] });
  m.rpc.mockResolvedValue({ error: null, data: { added: 1, skipped: 0 } });
});
afterEach(() => vi.unstubAllEnvs());
it("validates CSV on the server and imports through the authenticated RPC", async () => {
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ added: 1, skipped: 0 });
  expect(m.rpc).toHaveBeenCalledWith("import_employees", {
    department_id: department,
    employees: [{ code: "00123", name: "สมหญิง ใจดี", active: true }],
  });
});
it("rejects invalid CSV without writing any rows", async () => {
  expect((await POST(request("code,name\n123,Good\nBAD!,Bad"))).status).toBe(
    400,
  );
  expect(m.rpc).not.toHaveBeenCalled();
});
it("requires employee management permission and a matching origin", async () => {
  expect((await POST(request("", "https://evil.example"))).status).toBe(403);
  m.user.mockResolvedValue({ active: true, permissions: [] });
  expect((await POST(request())).status).toBe(403);
  m.user.mockResolvedValue(null);
  expect((await POST(request())).status).toBe(401);
  expect(m.rpc).not.toHaveBeenCalled();
});
it("bounds bodies even without Content-Length", async () => {
  expect((await POST(request("x".repeat(2 * 1024 * 1024 + 1)))).status).toBe(
    413,
  );
  expect(m.rpc).not.toHaveBeenCalled();
});
