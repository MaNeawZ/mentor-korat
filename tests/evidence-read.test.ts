import { beforeEach, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({
  user: vi.fn(),
  row: vi.fn(),
  read: vi.fn(),
  download: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ currentUser: m.user }));
vi.mock("@/lib/supabase/server", () => ({
  sessionClient: async () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: m.row }) }) }),
  }),
  adminClient: () => ({ storage: { from: () => ({ download: m.download }) } }),
}));
vi.mock("@/lib/discord-evidence", () => ({ readDiscordEvidence: m.read }));
import { GET } from "../src/app/api/evidence/[id]/route";
const id = "11111111-1111-4111-8111-111111111111";
const get = () =>
  GET(new Request(`https://example.com/api/evidence/${id}`), {
    params: Promise.resolve({ id }),
  });
beforeEach(() => {
  vi.clearAllMocks();
  m.user.mockResolvedValue({ id: "user", active: true, permissions: [] });
  m.read.mockResolvedValue(new Uint8Array([1, 2]));
  m.row.mockResolvedValue({
    data: { provider: "discord", discord_message_id: "234567890123456789" },
    error: null,
  });
  m.download.mockResolvedValue({ data: new Blob(["legacy"]), error: null });
});
it("checks identity and RLS before retrieving Discord attachments", async () => {
  m.user.mockResolvedValue(null);
  expect((await get()).status).toBe(401);
  expect(m.read).not.toHaveBeenCalled();
  m.user.mockResolvedValue({ id: "user" });
  m.row.mockResolvedValue({ data: null, error: null });
  expect((await get()).status).toBe(404);
  expect(m.read).not.toHaveBeenCalled();
});
it("proxies Discord bytes after authorization without exposing webhook credentials or CDN URLs", async () => {
  const r = await get();
  expect(r.status).toBe(200);
  expect(r.headers.get("cache-control")).toBe("private, no-store");
  expect(r.headers.get("content-type")).toBe("image/webp");
  expect(r.headers.get("location")).toBeNull();
  expect(m.read).toHaveBeenCalledOnce();
  expect(m.download).not.toHaveBeenCalled();
});
it("continues reading legacy Supabase images", async () => {
  m.row.mockResolvedValue({
    data: { provider: "supabase", path: `${id}/old.webp` },
    error: null,
  });
  expect((await get()).status).toBe(200);
  expect(m.download).toHaveBeenCalledWith(`${id}/old.webp`);
  expect(m.read).not.toHaveBeenCalled();
});
