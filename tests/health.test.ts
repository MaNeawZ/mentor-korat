import { beforeEach, afterEach, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn(), configured: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  configured: mocks.configured,
  adminClient: () => ({
    from: () => ({ select: () => ({ limit: mocks.query }) }),
  }),
}));
import { GET } from "../src/app/api/health/route";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.configured.mockReturnValue(true);
  mocks.query.mockResolvedValue({ error: null });
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "server-test-key");
  vi.stubEnv("UPLOAD_TOKEN_SECRET", "u".repeat(40));
  vi.stubEnv("CRON_SECRET", "c".repeat(40));
  vi.stubEnv("LINE_CHANNEL_SECRET", "channel-test-secret");
  vi.stubEnv("DISCORD_WEBHOOK_URL", "https://discord.com/api/webhooks/test");
  vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "abc1234567890");
});
afterEach(() => vi.unstubAllEnvs());
it("identifies the deployed immediate-worker build without exposing secrets", async () => {
  const response = await GET();
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body).toEqual({
    status: "ok",
    build: "abc1234",
    workerMode: "after-response",
  });
  expect(JSON.stringify(body)).not.toContain("server-test-key");
  expect(response.headers.get("cache-control")).toBe("no-store");
});
it("keeps reporting unavailable configuration rather than declaring the worker healthy", async () => {
  vi.stubEnv("UPLOAD_TOKEN_SECRET", "");
  const response = await GET();
  expect(response.status).toBe(503);
  expect(mocks.query).not.toHaveBeenCalled();
});
