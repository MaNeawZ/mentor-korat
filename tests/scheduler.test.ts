import { describe, it, expect, vi, afterEach } from "vitest";
import { invokeWorker } from "../scripts/invoke-worker.mjs";
import { workerAuth } from "../src/lib/api";
import { readFileSync } from "node:fs";
const config = { baseUrl: "https://example.com", secret: "s".repeat(40) };
afterEach(() => vi.unstubAllEnvs());
describe("external worker scheduler", () => {
  it("removes Vercel cron triggers while retaining deployment control", () => {
    const config = JSON.parse(readFileSync("vercel.json", "utf8"));
    expect(config.crons).toBeUndefined();
    expect(config.git.deploymentEnabled).toBe(false);
  });
  it("authenticates using headers and refuses redirects", async () => {
    const request = vi.fn<typeof fetch>(async () =>
      Response.json({ processed: 5 }),
    );
    expect(await invokeWorker(config, request)).toBe(5);
    expect(String(request.mock.calls[0][0])).toBe(
      "https://example.com/api/cron/process",
    );
    expect(request.mock.calls[0][1]).toMatchObject({
      method: "GET",
      redirect: "error",
      headers: { Authorization: `Bearer ${config.secret}` },
    });
  });
  it("supports optional Vercel deployment protection without putting secrets in URLs", async () => {
    const request = vi.fn<typeof fetch>(async () =>
      Response.json({ processed: 0 }),
    );
    await invokeWorker({ ...config, bypassSecret: "private-bypass" }, request);
    expect(request.mock.calls[0][1]?.headers).toMatchObject({
      "x-vercel-protection-bypass": "private-bypass",
    });
    expect(String(request.mock.calls[0][0])).not.toContain("private-bypass");
  });
  it.each([
    "http://example.com",
    "https://user:pass@example.com",
    "https://example.com/path",
    "https://example.com?secret=bad",
    "not-a-url",
  ])("rejects unsafe scheduler origin %s", async (baseUrl) => {
    const request = vi.fn();
    await expect(
      invokeWorker({ ...config, baseUrl }, request),
    ).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });
  it("rejects missing scheduler authentication before connecting", async () => {
    const request = vi.fn();
    await expect(
      invokeWorker({ ...config, secret: "" }, request),
    ).rejects.toThrow("CRON_SECRET");
    expect(request).not.toHaveBeenCalled();
  });
  it("fails on HTTP errors without logging response bodies", async () => {
    await expect(
      invokeWorker(
        config,
        vi.fn(
          async () =>
            new Response("sensitive provider diagnostic", { status: 401 }),
        ),
      ),
    ).rejects.toThrow("HTTP 401");
  });
  it("rejects an HTML login page or unexpected JSON instead of reporting success", async () => {
    await expect(
      invokeWorker(
        config,
        vi.fn(async () => new Response("<html>login</html>")),
      ),
    ).rejects.toThrow("did not return JSON");
    await expect(
      invokeWorker(
        config,
        vi.fn(async () => Response.json({ ok: true })),
      ),
    ).rejects.toThrow("unexpected response");
  });
  it("sanitizes transport errors that might contain credentials", async () => {
    const request = vi.fn(async () => {
      throw new Error(config.secret);
    });
    await expect(invokeWorker(config, request)).rejects.toThrow(
      "Worker request failed or timed out",
    );
  });
  it("continues to deny missing or wrong bearer tokens at the application boundary", () => {
    vi.stubEnv("CRON_SECRET", config.secret);
    expect(() =>
      workerAuth(new Request("https://example.com/api/cron/process")),
    ).toThrow("Unauthorized");
    expect(() =>
      workerAuth(
        new Request("https://example.com/api/cron/process", {
          headers: { Authorization: "Bearer wrong" },
        }),
      ),
    ).toThrow("Unauthorized");
    expect(() =>
      workerAuth(
        new Request("https://example.com/api/cron/process", {
          headers: { Authorization: `Bearer ${config.secret}` },
        }),
      ),
    ).not.toThrow();
  });
});
