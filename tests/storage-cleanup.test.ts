import { beforeEach, it, expect, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ currentUser: vi.fn() }));
import { processEvidenceCleanup } from "../src/lib/storage-cleanup";
const path = "66666666-6666-4666-8666-666666666666/test.webp";
const remove = vi.fn(),
  bucket = vi.fn(),
  rpc = vi.fn();
const writes: Record<string, unknown>[] = [];
const db = {
  rpc,
  storage: { from: bucket },
  from: (table: string) => {
    expect(table).toBe("storage_cleanup_jobs");
    return {
      update: (value: Record<string, unknown>) => {
        writes.push(value);
        return {
          in: async () => ({ error: null }),
          eq: async () => ({ error: null }),
        };
      },
    };
  },
};
beforeEach(() => {
  writes.length = 0;
  vi.clearAllMocks();
  bucket.mockReturnValue({ remove });
  remove.mockResolvedValue({ error: null });
  rpc.mockResolvedValue({
    data: [{ id: "job", path, attempts: 1 }],
    error: null,
  });
});
it("removes only claimed objects from this application bucket and acknowledges after deletion", async () => {
  expect(await processEvidenceCleanup(db as never)).toBe(1);
  expect(bucket).toHaveBeenCalledWith("mentor-korat-evidence");
  expect(remove).toHaveBeenCalledWith([path]);
  expect(writes[0].status).toBe("DONE");
});
it("rejects unexpected paths without calling storage", async () => {
  rpc.mockResolvedValue({
    data: [{ id: "invalid", path: "../other/file.webp", attempts: 1 }],
    error: null,
  });
  await processEvidenceCleanup(db as never);
  expect(remove).not.toHaveBeenCalled();
  expect(writes[0]).toMatchObject({
    status: "FAILED",
    error_code: "INVALID_EVIDENCE_PATH",
  });
});
it("keeps failed deletion durable with backoff, then exposes exhausted failures for manual retry", async () => {
  remove.mockResolvedValue({ error: { message: "provider failure" } });
  await processEvidenceCleanup(db as never);
  expect(writes[0]).toMatchObject({
    status: "PENDING",
    error_code: "STORAGE_CLEANUP_FAILED",
    locked_until: null,
  });
  expect(Date.parse(writes[0].available_at as string)).toBeGreaterThan(
    Date.now(),
  );
  rpc.mockResolvedValue({
    data: [{ id: "job", path, attempts: 8 }],
    error: null,
  });
  await processEvidenceCleanup(db as never);
  expect(writes[1].status).toBe("FAILED");
});
it("keeps workers compatible until the optional migration is applied", async () => {
  rpc.mockResolvedValue({ data: null, error: { code: "PGRST202" } });
  expect(await processEvidenceCleanup(db as never)).toBe(0);
  expect(remove).not.toHaveBeenCalled();
});
