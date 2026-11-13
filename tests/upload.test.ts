import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import sharp from "sharp";
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  context: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  adminClient: () => ({
    rpc: mocks.rpc,
    storage: { from: () => ({ upload: mocks.upload, remove: mocks.remove }) },
  }),
}));
vi.mock("@/lib/auth", () => ({ currentUser: vi.fn() }));
vi.mock("@/lib/evidence", () => ({ uploadContext: mocks.context }));
import { POST } from "../src/app/api/upload/[token]/route";
const token = "a".repeat(43),
  lid = "11111111-1111-4111-8111-111111111111";
async function request(bytes: Uint8Array, type: string) {
  const form = new FormData();
  form.append("file", new File([bytes as BlobPart], "image", { type }));
  return POST(
    new Request(`https://example.com/api/upload/${token}`, {
      method: "POST",
      headers: { origin: "https://example.com" },
      body: form,
    }),
    { params: Promise.resolve({ token }) },
  );
}
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://example.com");
  mocks.rpc.mockReset();
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  mocks.upload.mockReset();
  mocks.upload.mockResolvedValue({ error: null });
  mocks.remove.mockReset();
  mocks.remove.mockResolvedValue({ error: null });
  mocks.context.mockReset();
  mocks.context.mockResolvedValue({ id: lid });
});
afterEach(() => vi.unstubAllEnvs());
describe("evidence upload pipeline", () => {
  it("decodes genuine image data, normalizes to WebP and completes token only after storage", async () => {
    const image = await sharp({
      create: { width: 2, height: 2, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    const r = await request(image, "image/png");
    expect(r.status).toBe(200);
    expect(mocks.upload).toHaveBeenCalledOnce();
    const call = mocks.upload.mock.calls[0];
    expect(call[0]).toMatch(new RegExp(`^${lid}/.*\\.webp$`));
    expect((await sharp(call[1]).metadata()).format).toBe("webp");
    expect(mocks.rpc).toHaveBeenLastCalledWith(
      "complete_upload",
      expect.objectContaining({ file_path: call[0] }),
    );
  });
  it("rejects a spoofed MIME type before storage or token consumption", async () => {
    const r = await request(Buffer.from("<script>bad</script>"), "image/png");
    expect(r.status).toBe(400);
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.rpc.mock.calls.map((c) => c[0])).not.toContain(
      "complete_upload",
    );
  });
  it("rejects oversized file content before storage", async () => {
    const r = await request(new Uint8Array(8 * 1024 * 1024 + 1), "image/png");
    expect(r.status).toBe(400);
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("preserves token when storage fails", async () => {
    mocks.upload.mockResolvedValue({
      error: { message: "storage unavailable" },
    });
    const image = await sharp({
      create: { width: 1, height: 1, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    expect((await request(image, "image/png")).status).toBe(503);
    expect(mocks.rpc.mock.calls.map((c) => c[0])).not.toContain(
      "complete_upload",
    );
  });
  it("cleans up losing concurrent upload after definitive token rejection", async () => {
    mocks.rpc.mockImplementation(async (name) =>
      name === "complete_upload"
        ? { error: { message: "INVALID_TOKEN" } }
        : { data: true, error: null },
    );
    const image = await sharp({
      create: { width: 1, height: 1, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    expect((await request(image, "image/png")).status).toBe(400);
    expect(mocks.remove).toHaveBeenCalledOnce();
  });
  it("does not delete potentially committed evidence after an ambiguous transport failure", async () => {
    mocks.rpc.mockImplementation(async (name) => {
      if (name === "complete_upload") throw new Error("connection interrupted");
      return { data: true, error: null };
    });
    const image = await sharp({
      create: { width: 1, height: 1, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    expect((await request(image, "image/png")).status).toBe(500);
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});
