import { beforeEach, afterEach, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({ after: vi.fn(), run: vi.fn() }));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@/lib/worker", () => ({ runWorker: mocks.run }));
import { wakeWorker } from "../src/lib/worker-wakeup";
beforeEach(() => {
  mocks.after.mockReset();
  mocks.run.mockReset();
});
afterEach(() => vi.restoreAllMocks());
async function background() {
  expect(mocks.after).toHaveBeenCalledOnce();
  await mocks.after.mock.calls[0][0]();
}
it("defers processing until after the webhook response and drains queued bursts", async () => {
  mocks.run
    .mockResolvedValueOnce({ processed: 15 })
    .mockResolvedValueOnce({ processed: 5 })
    .mockResolvedValueOnce({ processed: 0 });
  wakeWorker();
  expect(mocks.run).not.toHaveBeenCalled();
  await background();
  expect(mocks.run).toHaveBeenCalledTimes(3);
});
it("bounds background work so a busy queue remains recoverable by the external scheduler", async () => {
  mocks.run.mockResolvedValue({ processed: 15 });
  wakeWorker();
  await background();
  expect(mocks.run).toHaveBeenCalledTimes(20);
});
it("stops claiming more batches after the time budget", async () => {
  vi.spyOn(Date, "now")
    .mockReturnValueOnce(0)
    .mockReturnValueOnce(0)
    .mockReturnValueOnce(121_000);
  mocks.run.mockResolvedValue({ processed: 15 });
  wakeWorker();
  await background();
  expect(mocks.run).toHaveBeenCalledOnce();
});
it("keeps durable jobs for scheduler recovery when a wake fails without exposing raw errors", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.run.mockRejectedValue(
    new Error("sensitive input or provider credentials"),
  );
  wakeWorker();
  await expect(background()).resolves.toBeUndefined();
  expect(log).toHaveBeenCalledWith("Background worker deferred to scheduler", {
    code: "WORKER_WAKE_FAILED",
  });
  expect(JSON.stringify(log.mock.calls)).not.toContain("sensitive");
});
