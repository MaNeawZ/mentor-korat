import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import sharp from "sharp";
const m = vi.hoisted(() => ({
  rpc: vi.fn(),
  send: vi.fn(),
  remove: vi.fn(),
  context: vi.fn(),
  storage: vi.fn(),
  cleanup: vi.fn(),
  wake: vi.fn(),
}));
vi.mock("@/lib/worker-wakeup", () => ({ wakeWorker: m.wake }));
vi.mock("@/lib/discord-evidence", () => ({
  sendDiscordEvidence: m.send,
  deleteDiscordEvidence: m.remove,
}));
vi.mock("@/lib/supabase/server", () => ({
  adminClient: () => ({
    rpc: m.rpc,
    storage: { from: m.storage },
    from: () => ({ upsert: m.cleanup }),
  }),
}));
vi.mock("@/lib/auth", () => ({ currentUser: vi.fn() }));
vi.mock("@/lib/evidence", () => ({ uploadContext: m.context }));
import { POST } from "../src/app/api/upload/[token]/route";
import { HttpError } from "../src/lib/api";
const token = "a".repeat(43),
  lid = "11111111-1111-4111-8111-111111111111";
const ref = {
  discord_webhook_id: "123456789012345678",
  discord_message_id: "234567890123456789",
  discord_attachment_id: "345678901234567890",
};
async function image() {
  return sharp({
    create: { width: 2, height: 2, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
}
async function request(bytes: Uint8Array, type = "image/png") {
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
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://example.com");
  m.rpc.mockResolvedValue({ data: true, error: null });
  m.send.mockResolvedValue(ref);
  m.remove.mockResolvedValue(undefined);
  m.context.mockResolvedValue({ id: lid, document_number: "LE-256911001234" });
  m.cleanup.mockResolvedValue({ error: null });
});
afterEach(() => vi.unstubAllEnvs());
describe("Discord evidence upload pipeline", () => {
  it("normalizes to WebP, attaches to Discord then atomically consumes the token without writing Supabase Storage", async () => {
    expect((await request(await image())).status).toBe(200);
    const [bytes, filename, document] = m.send.mock.calls[0];
    expect((await sharp(bytes).metadata()).format).toBe("webp");
    expect(filename).toMatch(/^[0-9a-f-]{36}\.webp$/);
    expect(document).toBe("LE-256911001234");
    expect(m.rpc).toHaveBeenLastCalledWith(
      "complete_discord_upload",
      expect.objectContaining({
        file_path: `${lid}/${filename}`,
        webhook_id: ref.discord_webhook_id,
        message_id: ref.discord_message_id,
        attachment_id: ref.discord_attachment_id,
      }),
    );
    const completeIndex = m.rpc.mock.calls.findIndex(
      (c) => c[0] === "complete_discord_upload",
    );
    expect(m.send.mock.invocationCallOrder[0]).toBeLessThan(
      m.rpc.mock.invocationCallOrder[completeIndex],
    );
    expect(m.storage).not.toHaveBeenCalled();
    expect(m.wake).toHaveBeenCalledOnce();
  });
  it("rejects spoofed MIME before sending any file", async () => {
    expect((await request(Buffer.from("<script>bad</script>"))).status).toBe(
      400,
    );
    expect(m.send).not.toHaveBeenCalled();
    expect(m.rpc.mock.calls.map((c) => c[0])).not.toContain(
      "complete_discord_upload",
    );
  });
  it("rejects oversized content before sending", async () => {
    expect((await request(new Uint8Array(8 * 1024 * 1024 + 1))).status).toBe(
      400,
    );
    expect(m.send).not.toHaveBeenCalled();
  });
  it("preserves the token if Discord is unavailable", async () => {
    m.send.mockRejectedValue(new HttpError(503, "Discord ไม่พร้อม"));
    expect((await request(await image())).status).toBe(503);
    expect(m.rpc.mock.calls.map((c) => c[0])).not.toContain(
      "complete_discord_upload",
    );
    expect(m.storage).not.toHaveBeenCalled();
  });
  it("checks migration readiness before posting images", async () => {
    m.rpc.mockResolvedValue({
      error: { code: "PGRST202", message: "missing" },
    });
    expect((await request(await image())).status).toBe(503);
    expect(m.send).not.toHaveBeenCalled();
  });
  it("deletes the losing attachment after a definitive token rejection", async () => {
    m.rpc.mockImplementation(async (name) =>
      name === "complete_discord_upload"
        ? { error: { message: "INVALID_TOKEN", code: "P0001" } }
        : { data: true, error: null },
    );
    expect((await request(await image())).status).toBe(400);
    expect(m.remove).toHaveBeenCalledWith(ref);
    expect(m.wake).not.toHaveBeenCalled();
  });
  it("queues failed attachment cleanup without masking the original upload rejection", async () => {
    m.rpc.mockImplementation(async (name) =>
      name === "complete_discord_upload"
        ? { error: { message: "INVALID_TOKEN", code: "P0001" } }
        : { data: true, error: null },
    );
    m.remove.mockRejectedValue(new Error("offline"));
    expect((await request(await image())).status).toBe(400);
    expect(m.cleanup).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "discord",
        discord_message_id: ref.discord_message_id,
      }),
    );
  });
  it("keeps potentially committed evidence after an ambiguous DB transport failure", async () => {
    m.rpc.mockImplementation(async (name) => {
      if (name === "complete_discord_upload") throw new Error("interrupted");
      return { data: true, error: null };
    });
    expect((await request(await image())).status).toBe(500);
    expect(m.remove).not.toHaveBeenCalled();
    expect(m.storage).not.toHaveBeenCalled();
  });
  it("also retains evidence when a transport failure is returned as a Supabase error result", async () => {
    m.rpc.mockImplementation(async (name) =>
      name === "complete_discord_upload"
        ? { error: { code: "", message: "fetch failed" } }
        : { data: true, error: null },
    );
    expect((await request(await image())).status).toBe(503);
    expect(m.remove).not.toHaveBeenCalled();
  });
});
