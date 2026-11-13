import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { ingestLineJob, ingestIncomingLineJobs } from "../src/lib/line/ingest";
type ResultError = { message: string } | null;
function result(data: unknown, error: ResultError = null) {
  const promise = Promise.resolve({ data, error });
  return Object.assign(promise, { abortSignal: vi.fn(() => promise) });
}
function database(types: unknown = ["ลาป่วย", "ลากิจ"]) {
  const settingsResult = result({ value: types });
  const single = () => settingsResult;
  const settings = {
    single,
    abortSignal: vi.fn<(signal: AbortSignal) => { single: typeof single }>(
      () => ({ single }),
    ),
  };
  const update = vi.fn();
  const neq = vi.fn(() => result(null));
  update.mockReturnValue({ eq: () => ({ neq }) });
  const rpc = vi.fn<
    (name: string, input: unknown) => ReturnType<typeof result>
  >(() => result(null));
  const db = {
    from: (table: string) =>
      table === "app_settings"
        ? { select: () => ({ eq: () => settings }) }
        : { update },
    rpc,
  };
  return {
    db: db as unknown as Parameters<typeof ingestLineJob>[0],
    rpc,
    update,
    neq,
    settings,
  };
}
const job = (id: string) => ({
  id,
  payload: {
    source: { groupId: "group" },
    message: {
      text: "12345 พนักงาน ทดสอบ\nขออนุญาตลาป่วยช่วงเช้า\n14 พฤศจิกายน 2569\nเนื่องจากทดสอบระบบ\nเลขที่ใบลา: LE-256911001234",
    },
  },
});
beforeEach(() => {
  vi.stubEnv("UPLOAD_TOKEN_SECRET", "s".repeat(40));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
it("ingests newly received leave events directly without waiting for a scheduled claim", async () => {
  const { db, rpc, settings } = database();
  await ingestIncomingLineJobs(db, [job("a"), job("b")]);
  expect(rpc).toHaveBeenCalledTimes(2);
  expect(rpc).toHaveBeenCalledWith(
    "ingest_leave",
    expect.objectContaining({
      event_id: "a",
      parsed: expect.objectContaining({
        employee_code: "12345",
        leave_date: "2026-11-14",
      }),
      hash: expect.stringMatching(/^[0-9a-f]{64}$/),
    }),
  );
  expect(settings.abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
});
it("limits the inline burst so remaining durable jobs can continue after the response", async () => {
  const { db, rpc } = database();
  await ingestIncomingLineJobs(
    db,
    Array.from({ length: 8 }, (_, i) => job(String(i))),
  );
  expect(rpc).toHaveBeenCalledTimes(5);
});
it("continues with other messages when one immediate ingestion fails, without resetting committed event state", async () => {
  const { db, rpc, update } = database();
  rpc.mockImplementationOnce(() =>
    result(null, { message: "private provider diagnostic" }),
  );
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  await expect(
    ingestIncomingLineJobs(db, [job("a"), job("b")]),
  ).resolves.toBeUndefined();
  expect(rpc).toHaveBeenCalledTimes(2);
  expect(update).not.toHaveBeenCalled();
  expect(JSON.stringify(log.mock.calls)).not.toContain(
    "private provider diagnostic",
  );
});
it("leaves events in their durable queue if configuration cannot be read", async () => {
  const { db, rpc } = database("not-an-array");
  vi.spyOn(console, "error").mockImplementation(() => {});
  await expect(ingestIncomingLineJobs(db, [job("a")])).resolves.toBeUndefined();
  expect(rpc).not.toHaveBeenCalled();
});
it("discards unrelated chat text without creating a leave and without overwriting a completed event", async () => {
  const { db, rpc, update, neq } = database();
  await ingestLineJob(
    db,
    { id: "hello", payload: { message: { text: "สวัสดี" } } },
    ["ลาป่วย"],
  );
  expect(rpc).not.toHaveBeenCalled();
  expect(update).toHaveBeenCalledWith(
    expect.objectContaining({
      status: "DONE",
      payload: { message: { text: "[non-leave message discarded]" } },
    }),
  );
  expect(neq).toHaveBeenCalledWith("status", "DONE");
});
it("does not contact the database when the webhook has no accepted messages", async () => {
  const { db, rpc, settings } = database();
  await ingestIncomingLineJobs(db, []);
  expect(rpc).not.toHaveBeenCalled();
  expect(settings.abortSignal).not.toHaveBeenCalled();
});
it("leaves processing to the after-response worker when enqueueing already used the response budget", async () => {
  const { db, rpc, settings } = database();
  await ingestIncomingLineJobs(db, [job("a")], 0);
  expect(rpc).not.toHaveBeenCalled();
  expect(settings.abortSignal).not.toHaveBeenCalled();
});
