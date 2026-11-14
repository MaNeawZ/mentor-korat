import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
import { newToken } from "../src/lib/security";
let db: PGlite,
  sequence = 0;
const head = "11111111-1111-4111-8111-111111111111",
  mentor = "22222222-2222-4222-8222-222222222222",
  employee = "33333333-3333-4333-8333-333333333333",
  otherEmployee = "44444444-4444-4444-8444-444444444444";
const group = "C" + "a".repeat(32),
  user = "U" + "a".repeat(32),
  secret = "s".repeat(40);
const doc = () => `LE-256911${String(++sequence).padStart(6, "0")}`;
type Options = {
  doc: string;
  mid: string;
  timestamp?: number;
  uid?: string | null;
  gid?: string;
  code?: string;
  reason?: string;
};
async function send(o: Options) {
  const id = `event-${o.mid}`,
    token = newToken(secret);
  const payload = {
    type: "message",
    timestamp: o.timestamp ?? 100,
    source: {
      type: "group",
      groupId: o.gid ?? group,
      ...(o.uid === null ? {} : { userId: o.uid ?? user }),
    },
    message: { id: o.mid, type: "text", text: o.reason ?? "old message" },
  };
  const parsed = {
    document_number: o.doc,
    employee_code: o.code ?? "12345",
    employee_name: o.code === "54321" ? "Other employee" : "Test employee",
    leave_date: "2026-11-15",
    leave_type: "ลาป่วย",
    period: "AM",
    reason: o.reason ?? "old reason",
    issues: [],
  };
  await db.query(
    "INSERT INTO mentor_korat.integration_events(id,payload) VALUES($1,$2::jsonb) ON CONFLICT DO NOTHING",
    [id, JSON.stringify(payload)],
  );
  await db.query("SELECT mentor_korat.ingest_leave($1,$2::jsonb,$3,$4)", [
    id,
    JSON.stringify(parsed),
    token.hash,
    token.nonce,
  ]);
  return { id, token, parsed, payload };
}
async function unsend(mid: string, gid = group) {
  const id = `unsend-${mid}-${++sequence}`,
    token = newToken(secret);
  await db.query(
    "INSERT INTO mentor_korat.integration_events(id,payload) VALUES($1,$2::jsonb)",
    [
      id,
      JSON.stringify({
        type: "unsend",
        source: { type: "group", groupId: gid, userId: user },
        unsend: { messageId: mid },
      }),
    ],
  );
  await db.query("SELECT mentor_korat.process_line_unsend($1,$2,$3)", [
    id,
    token.hash,
    token.nonce,
  ]);
  return id;
}
async function leave(document: string) {
  return (
    await db.query<{
      id: string;
      status: string;
      reason: string;
      line_retracted: boolean;
      version: number;
    }>(
      "SELECT id,status,reason,line_retracted,version FROM mentor_korat.leave_requests WHERE document_number=$1",
      [document],
    )
  ).rows[0];
}
async function actor(id: string) {
  await db.exec(
    `SET ROLE authenticated;SELECT set_config('request.jwt.claim.sub','${id}',false)`,
  );
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated,service_role;GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,service_role;`,
  );
  for (const f of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync(`supabase/migrations/${f}`, "utf8"));
  await db.exec(
    `INSERT INTO auth.users VALUES('${head}'),('${mentor}');INSERT INTO mentor_korat.app_users(id,name,role) VALUES('${head}','Head','CENTER_HEAD'),('${mentor}','Mentor','MENTOR');INSERT INTO mentor_korat.departments(id,name) VALUES('55555555-5555-4555-8555-555555555555','Department');INSERT INTO mentor_korat.employees(id,code,name,department_id,mentor_id) VALUES('${employee}','12345','Test employee','55555555-5555-4555-8555-555555555555','${mentor}'),('${otherEmployee}','54321','Other employee','55555555-5555-4555-8555-555555555555','${mentor}')`,
  );
}, 30000);
beforeEach(async () => {
  await db.exec("RESET ROLE");
});
afterAll(async () => {
  await db?.close();
});
it("retracts the old message, revokes its link, then corrects the same leave and notifies Mentor with a fresh link", async () => {
  const document = doc(),
    mid = `old-${document}`,
    first = await send({ doc: document, mid });
  const original = await leave(document);
  await unsend(mid);
  expect((await leave(document)).line_retracted).toBe(true);
  expect(
    (
      await db.query(
        "SELECT state FROM mentor_korat.evidence_upload_tokens WHERE token_hash=$1",
        [first.token.hash],
      )
    ).rows,
  ).toEqual([{ state: "REVOKED" }]);
  expect(
    (
      await db.query(
        "SELECT message FROM mentor_korat.leave_raw_messages WHERE leave_id=$1",
        [original.id],
      )
    ).rows,
  ).toEqual([{ message: "[unsent message removed]" }]);
  expect(
    (
      await db.query(
        "SELECT payload->'message'->>'text' text FROM mentor_korat.integration_events WHERE id=$1",
        [first.id],
      )
    ).rows,
  ).toEqual([{ text: "[unsent message removed]" }]);
  const second = await send({
    doc: document,
    mid: `new-${document}`,
    timestamp: 200,
    reason: "corrected reason",
  });
  expect(await leave(document)).toMatchObject({
    id: original.id,
    reason: "corrected reason",
    line_retracted: false,
    status: "WAITING_EVIDENCE",
    version: 3,
  });
  expect(
    (
      await db.query(
        "SELECT count(*)::int n FROM mentor_korat.leave_requests WHERE document_number=$1",
        [document],
      )
    ).rows,
  ).toEqual([{ n: 1 }]);
  expect(
    (
      await db.query(
        "SELECT state FROM mentor_korat.evidence_upload_tokens WHERE token_hash=$1",
        [second.token.hash],
      )
    ).rows,
  ).toEqual([{ state: "ACTIVE" }]);
  expect(
    (
      await db.query<{ kind: string }>(
        "SELECT kind FROM mentor_korat.notification_outbox WHERE leave_id=$1 ORDER BY created_at",
        [original.id],
      )
    ).rows.map((r) => r.kind),
  ).toEqual(["WAITING_EVIDENCE", "LINE_UNSENT", "LINE_CORRECTED"]);
  await unsend(mid);
  expect((await leave(document)).line_retracted).toBe(false);
  await send({ doc: document, mid: `new-${document}`, timestamp: 200 });
  expect((await leave(document)).version).toBe(3);
});
it("still rejects a duplicate if the original was not unsent", async () => {
  const document = doc();
  await send({ doc: document, mid: `a-${document}` });
  await send({
    doc: document,
    mid: `b-${document}`,
    timestamp: 200,
    reason: "different",
  });
  expect((await leave(document)).reason).toBe("old reason");
  expect(
    (
      await db.query(
        "SELECT issues FROM mentor_korat.leave_parsing_issues WHERE event_id=$1",
        [`event-b-${document}`],
      )
    ).rows,
  ).toEqual([{ issues: ["DUPLICATE_DOCUMENT"] }]);
});
it.each([
  "other user",
  "other group",
  "other employee",
  "older timestamp",
  "missing original user",
])("requires manual review for %s", async (variant) => {
  const document = doc(),
    mid = `original-${document}`;
  await send({
    doc: document,
    mid,
    uid: variant === "missing original user" ? null : user,
  });
  await unsend(mid);
  const correction = await send({
    doc: document,
    mid: `correction-${document}`,
    timestamp: variant === "older timestamp" ? 50 : 200,
    uid: variant === "other user" ? "U" + "b".repeat(32) : user,
    gid: variant === "other group" ? "C" + "b".repeat(32) : group,
    code: variant === "other employee" ? "54321" : "12345",
    reason: "should not overwrite",
  });
  expect(await leave(document)).toMatchObject({
    reason: "old reason",
    line_retracted: true,
  });
  expect(
    (
      await db.query(
        "SELECT issues FROM mentor_korat.leave_parsing_issues WHERE event_id=$1",
        [correction.id],
      )
    ).rows[0],
  ).toEqual({ issues: ["LINE_CORRECTION_REVIEW_REQUIRED"] });
});
it("suppresses an unsent original even if the unsend arrives before the original message", async () => {
  const document = doc(),
    mid = `late-${document}`;
  await unsend(mid);
  await send({ doc: document, mid });
  expect(await leave(document)).toBeUndefined();
  await send({
    doc: document,
    mid: `replacement-${document}`,
    timestamp: 200,
    reason: "new",
  });
  expect(await leave(document)).toMatchObject({
    reason: "new",
    line_retracted: false,
  });
});
it("reconciles a correction processed before the delayed unsend webhook without another resend", async () => {
  const document = doc(),
    mid = `delayed-${document}`;
  await send({ doc: document, mid });
  const original = await leave(document);
  const correction = await send({
    doc: document,
    mid: `corrected-${document}`,
    timestamp: 200,
    reason: "fixed after delivery reorder",
  });
  expect((await leave(document)).reason).toBe("old reason");
  await unsend(mid);
  expect(await leave(document)).toMatchObject({
    id: original.id,
    reason: "fixed after delivery reorder",
    line_retracted: false,
  });
  expect(
    (
      await db.query(
        "SELECT resolved FROM mentor_korat.leave_parsing_issues WHERE event_id=$1",
        [correction.id],
      )
    ).rows,
  ).toEqual([{ resolved: true }]);
});
it("preserves evidence and review state, blocks further review, and lets only the head acknowledge a manual correction", async () => {
  const document = doc(),
    mid = `proof-${document}`,
    initial = await send({ doc: document, mid });
  const l = await leave(document);
  await db.query(
    "SELECT mentor_korat.complete_discord_upload($1,$2,100,$3,$4,$5)",
    [
      initial.token.hash,
      `${l.id}/77777777-7777-4777-8777-777777777777.webp`,
      "123456789012345678",
      "234567890123456789",
      "345678901234567890",
    ],
  );
  await unsend(mid);
  await send({
    doc: document,
    mid: `proof-corrected-${document}`,
    timestamp: 200,
    reason: "requires head",
  });
  const current = await leave(document);
  expect(current).toMatchObject({
    status: "WAITING_MENTOR_REVIEW",
    reason: "old reason",
    line_retracted: true,
  });
  expect(
    (
      await db.query(
        "SELECT count(*)::int n FROM mentor_korat.evidence_files WHERE leave_id=$1",
        [l.id],
      )
    ).rows,
  ).toEqual([{ n: 1 }]);
  await actor(mentor);
  await expect(
    db.query(
      "SELECT mentor_korat.review_leave($1,$2,'precheck','ok',NULL,NULL,NULL)",
      [l.id, current.version],
    ),
  ).rejects.toThrow("LINE_MESSAGE_RETRACTED");
  const payload = {
    version: current.version,
    leave_date: "2026-11-15",
    leave_type: "ลาป่วย",
    period: "AM",
    reason: "head confirmed correction",
    correction_reason: "checked the corrected message",
  };
  await expect(
    db.query("SELECT mentor_korat.correct_leave($1,$2::jsonb)", [
      l.id,
      JSON.stringify(payload),
    ]),
  ).rejects.toThrow("FORBIDDEN");
  await db.exec("RESET ROLE");
  await actor(head);
  await db.query("SELECT mentor_korat.correct_leave($1,$2::jsonb)", [
    l.id,
    JSON.stringify(payload),
  ]);
  expect(await leave(document)).toMatchObject({
    line_retracted: false,
    reason: "head confirmed correction",
    status: "WAITING_MENTOR_REVIEW",
  });
});
it("protects privileged unsend processing from direct authenticated callers", async () => {
  await actor(head);
  await expect(
    db.query("SELECT mentor_korat.process_line_unsend('fake',NULL,NULL)"),
  ).rejects.toThrow(/permission denied/);
});
it("lets the head restore a legacy retracted draft with a new link and does not put token material in audit logs", async () => {
  const document = doc(),
    mid = `legacy-${document}`;
  await send({ doc: document, mid, uid: null });
  await unsend(mid);
  const current = await leave(document);
  const t = newToken(secret);
  await actor(head);
  await db.query("SELECT mentor_korat.correct_leave($1,$2::jsonb)", [
    current.id,
    JSON.stringify({
      version: current.version,
      leave_date: "2026-11-15",
      leave_type: "ลาป่วย",
      period: "AM",
      reason: "head verified legacy correction",
      correction_reason: "checked source with employee",
      new_token_hash: t.hash,
      new_token_nonce: t.nonce,
    }),
  ]);
  expect((await leave(document)).line_retracted).toBe(false);
  await db.exec("RESET ROLE");
  expect(
    (
      await db.query(
        "SELECT state FROM mentor_korat.evidence_upload_tokens WHERE token_hash=$1",
        [t.hash],
      )
    ).rows,
  ).toEqual([{ state: "ACTIVE" }]);
  const audit = (
    await db.query(
      "SELECT new_data FROM mentor_korat.audit_logs WHERE entity_id=$1",
      [current.id],
    )
  ).rows;
  expect(JSON.stringify(audit)).not.toContain(t.nonce);
  expect(JSON.stringify(audit)).not.toContain(t.hash);
});
it("preserves final review results and evidence when an already verified message is unsent", async () => {
  const document = doc(),
    mid = `closed-${document}`,
    first = await send({ doc: document, mid });
  const l = await leave(document);
  await db.query(
    "SELECT mentor_korat.complete_discord_upload($1,$2,100,$3,$4,$5)",
    [
      first.token.hash,
      `${l.id}/77777777-7777-4777-8777-777777777777.webp`,
      "123456789012345678",
      "234567890123456789",
      "345678901234567890",
    ],
  );
  let current = await leave(document);
  await actor(mentor);
  await db.query(
    "SELECT mentor_korat.review_leave($1,$2,'precheck','checked',NULL,NULL,NULL)",
    [l.id, current.version],
  );
  await db.exec("RESET ROLE");
  current = await leave(document);
  await actor(head);
  await db.query(
    "SELECT mentor_korat.review_leave($1,$2,'verify','verified',NULL,NULL,NULL)",
    [l.id, current.version],
  );
  await db.exec("RESET ROLE");
  await unsend(mid);
  await send({
    doc: document,
    mid: `closed-correction-${document}`,
    timestamp: 200,
    reason: "must not change a verified record",
  });
  expect(await leave(document)).toMatchObject({
    status: "VERIFIED",
    line_retracted: true,
    reason: "old reason",
  });
  expect(
    (
      await db.query(
        "SELECT count(*)::int n FROM mentor_korat.evidence_files WHERE leave_id=$1",
        [l.id],
      )
    ).rows,
  ).toEqual([{ n: 1 }]);
});
