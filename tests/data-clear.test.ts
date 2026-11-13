import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { beforeAll, afterAll, it, expect } from "vitest";
let db: PGlite;
const head = "11111111-1111-4111-8111-111111111111",
  mentor = "22222222-2222-4222-8222-222222222222",
  hr = "33333333-3333-4333-8333-333333333333";
const employee = "44444444-4444-4444-8444-444444444444",
  department = "55555555-5555-4555-8555-555555555555";
const lid = "66666666-6666-4666-8666-666666666666";
async function actor(id: string) {
  await db.exec(
    `RESET ROLE;SET ROLE authenticated;SELECT set_config('request.jwt.claim.sub','${id}',false)`,
  );
}
async function preview() {
  return (
    await db.query<{
      p: {
        snapshot: string;
        counts: Record<string, number>;
        storage_pending: number;
      };
    }>("SELECT mentor_korat.preview_leave_data_clear() p")
  ).rows[0].p;
}
async function clear(
  snapshot: string,
  phrase = "ล้างข้อมูลใบลา",
  reason = "เคลียร์ข้อมูลทดสอบ",
) {
  return db.query<{
    r: { cleared: Record<string, number>; storage_pending: number };
  }>("SELECT mentor_korat.clear_leave_data($1,$2,$3) r", [
    snapshot,
    phrase,
    reason,
  ]);
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated,service_role;GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,service_role;CREATE TABLE public.existing_system(value text);INSERT INTO public.existing_system VALUES('untouched');`,
  );
  for (const f of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync(`supabase/migrations/${f}`, "utf8"));
  await db.exec(`INSERT INTO auth.users VALUES('${head}'),('${mentor}'),('${hr}');INSERT INTO mentor_korat.app_users(id,name,role) VALUES('${head}','Head','CENTER_HEAD'),('${mentor}','Mentor','MENTOR'),('${hr}','HR','HR');INSERT INTO mentor_korat.departments VALUES('${department}','Development');INSERT INTO mentor_korat.employees(id,code,name,department_id,mentor_id) VALUES('${employee}','12345','Test employee','${department}','${mentor}');INSERT INTO mentor_korat.line_groups VALUES('Caaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','Group',true);
 INSERT INTO mentor_korat.integration_events(id,payload) VALUES('old-event','{}'),('bad-event','{}');
 INSERT INTO mentor_korat.leave_requests(id,document_number,employee_id,mentor_id,assignment_status,leave_type,leave_date,period,reason) VALUES('${lid}','LE-256911001234','${employee}','${mentor}','ASSIGNED','ลาป่วย','2026-11-14','FULL','test');
 INSERT INTO mentor_korat.evidence_files(leave_id,path,mime,size_bytes) VALUES('${lid}','${lid}/test.webp','image/webp',100);
 INSERT INTO mentor_korat.evidence_upload_tokens(leave_id,token_hash,nonce) VALUES('${lid}',repeat('a',64),repeat('b',64));
 INSERT INTO mentor_korat.leave_status_history(leave_id,to_status) VALUES('${lid}','WAITING_EVIDENCE');
 INSERT INTO mentor_korat.leave_raw_messages(leave_id,event_id,group_id,message) VALUES('${lid}','old-event','group','original');
 INSERT INTO mentor_korat.leave_parsing_issues(event_id,issues) VALUES('bad-event','["INVALID"]');
 INSERT INTO mentor_korat.notifications(user_id,leave_id,title) VALUES('${mentor}','${lid}','notice');
 INSERT INTO mentor_korat.discord_messages VALUES('${lid}','discord-id');
 INSERT INTO mentor_korat.notification_outbox(leave_id,kind) VALUES('${lid}','WAITING_EVIDENCE');
 SELECT mentor_korat.audit(NULL,NULL,'BEFORE_CLEAR');`);
}, 30000);
afterAll(async () => {
  await db?.close();
});
async function historyPreview() {
  return (
    await db.query<{ p: { count: number; snapshot: string } }>(
      "SELECT mentor_korat.preview_audit_clear() p",
    )
  ).rows[0].p;
}
async function clearHistory(
  snapshot: string,
  phrase = "ล้างประวัติการดำเนินการ",
  reason = "เคลียร์ประวัติทดสอบ",
) {
  return db.query<{ r: { cleared: number; retained: number } }>(
    "SELECT mentor_korat.clear_audit_history($1,$2,$3) r",
    [snapshot, phrase, reason],
  );
}
it("keeps explicit predicates on every effective deletion for safeupdate API sessions", async () => {
  await db.exec("RESET ROLE");
  const { rows } = await db.query<{ definition: string }>(
    "SELECT pg_get_functiondef('mentor_korat.clear_leave_data(text,text,text)'::regprocedure) definition",
  );
  const deletes = rows[0].definition.match(/DELETE FROM[^;]+;/gi) || [];
  expect(deletes).toHaveLength(10);
  for (const statement of deletes)
    expect(statement).toMatch(/WHERE (?:id|leave_id) IS NOT NULL;/i);
});
it("requires an active center head even with an explicit permission override", async () => {
  await db.exec(
    `INSERT INTO mentor_korat.user_permission_overrides VALUES('${mentor}','data.clear',true),('${hr}','data.clear',true);SET ROLE anon;`,
  );
  await expect(preview()).rejects.toThrow(/permission denied/);
  for (const id of [mentor, hr]) {
    await actor(id);
    await expect(preview()).rejects.toThrow("FORBIDDEN");
    await expect(clear("x")).rejects.toThrow("FORBIDDEN");
    await expect(
      db.query("SELECT mentor_korat.retry_storage_cleanup()"),
    ).rejects.toThrow("FORBIDDEN");
  }
  await db.exec(
    `RESET ROLE;UPDATE mentor_korat.app_users SET active=false WHERE id='${head}'`,
  );
  await actor(head);
  await expect(preview()).rejects.toThrow("FORBIDDEN");
  await db.exec(
    `RESET ROLE;UPDATE mentor_korat.app_users SET active=true WHERE id='${head}'`,
  );
});
it("requires the exact phrase, reason and a current snapshot; refuses active workers", async () => {
  await actor(head);
  const p = await preview();
  expect(p.counts.leaves).toBe(1);
  expect(p.counts.evidence).toBe(1);
  await expect(clear(p.snapshot, "wrong")).rejects.toThrow(
    "INVALID_CLEAR_CONFIRMATION",
  );
  await expect(clear(p.snapshot, "ล้างข้อมูลใบลา", "x")).rejects.toThrow(
    "INVALID_CLEAR_CONFIRMATION",
  );
  await db.exec(
    `RESET ROLE;INSERT INTO mentor_korat.integration_events(id,payload) VALUES('new-before-confirm','{}')`,
  );
  await actor(head);
  await expect(clear(p.snapshot)).rejects.toThrow("STALE_CLEAR_PREVIEW");
  await db.exec(
    `RESET ROLE;UPDATE mentor_korat.notification_outbox SET status='PROCESSING',locked_until=now()+interval '5 minutes'`,
  );
  await actor(head);
  await expect(clear((await preview()).snapshot)).rejects.toThrow("CLEAR_BUSY");
  await db.exec(
    `RESET ROLE;UPDATE mentor_korat.notification_outbox SET status='PENDING',locked_until=NULL`,
  );
});
it("clears the reviewed scope atomically, preserves master data/public/auth/audits and queues exact evidence paths", async () => {
  await actor(head);
  const p = await preview();
  const result = (await clear(p.snapshot)).rows[0].r;
  expect(result.cleared).toEqual(p.counts);
  expect(result.storage_pending).toBe(1);
  expect(Object.values((await preview()).counts).every((n) => n === 0)).toBe(
    true,
  );
  await db.exec("RESET ROLE");
  for (const [table, count] of [
    ["employees", 1],
    ["departments", 1],
    ["app_users", 3],
    ["line_groups", 1],
    ["app_settings", 3],
  ] as const) {
    expect(
      (await db.query(`SELECT count(*)::int n FROM mentor_korat.${table}`))
        .rows,
    ).toEqual([{ n: count }]);
  }
  expect((await db.query("SELECT * FROM public.existing_system")).rows).toEqual(
    [{ value: "untouched" }],
  );
  expect(
    (await db.query("SELECT count(*)::int n FROM auth.users")).rows,
  ).toEqual([{ n: 3 }]);
  expect(
    (
      await db.query(
        "SELECT action FROM mentor_korat.audit_logs WHERE action='BEFORE_CLEAR'",
      )
    ).rows,
  ).toHaveLength(1);
  const audit = (
    await db.query<{ new_data: { reason: string; deleted: unknown } }>(
      "SELECT new_data FROM mentor_korat.audit_logs WHERE action='DATA_CLEAR_LEAVES'",
    )
  ).rows[0];
  expect(audit.new_data.reason).toBe("เคลียร์ข้อมูลทดสอบ");
  expect(audit.new_data.deleted).toEqual(p.counts);
  expect(
    (
      await db.query(
        "SELECT path,status FROM mentor_korat.storage_cleanup_jobs",
      )
    ).rows,
  ).toEqual([{ path: `${lid}/test.webp`, status: "PENDING" }]);
  await expect(
    db.query(
      "INSERT INTO mentor_korat.storage_cleanup_jobs(path) VALUES('../other-app/file.webp')",
    ),
  ).rejects.toThrow(/check constraint/);
});
it("ignores redelivered cleared events, never ingests a missing event and accepts new messages", async () => {
  await db.exec(
    `RESET ROLE;INSERT INTO mentor_korat.integration_events(id,payload) VALUES('old-event','{}') ON CONFLICT DO NOTHING;SELECT mentor_korat.ingest_leave('old-event','{}','hash','nonce');`,
  );
  expect(
    (await db.query("SELECT * FROM mentor_korat.leave_requests")).rows,
  ).toHaveLength(0);
  expect(
    (await db.query("SELECT * FROM mentor_korat.integration_events")).rows,
  ).toHaveLength(0);
  await db.exec(
    `INSERT INTO mentor_korat.integration_events(id,payload) VALUES('fresh-event','{}')`,
  );
  expect(
    (await db.query("SELECT id FROM mentor_korat.integration_events")).rows,
  ).toEqual([{ id: "fresh-event" }]);
});
it("restricts cleanup claims to service role, leases once, and lets the head retry failures", async () => {
  await actor(head);
  await expect(
    db.query("SELECT mentor_korat.claim_storage_cleanup()"),
  ).rejects.toThrow(/permission denied/);
  await db.exec("RESET ROLE;SET ROLE service_role");
  expect(
    (await db.query("SELECT mentor_korat.claim_storage_cleanup()")).rows,
  ).toHaveLength(1);
  expect(
    (await db.query("SELECT mentor_korat.claim_storage_cleanup()")).rows,
  ).toHaveLength(0);
  await db.exec(
    "UPDATE mentor_korat.storage_cleanup_jobs SET status='FAILED',attempts=8",
  );
  await actor(head);
  await db.query("SELECT mentor_korat.retry_storage_cleanup()");
  await db.exec("RESET ROLE;SET ROLE service_role");
  expect(
    (
      await db.query(
        "SELECT status,attempts FROM mentor_korat.storage_cleanup_jobs",
      )
    ).rows,
  ).toEqual([{ status: "PENDING", attempts: 0 }]);
});
it("limits history preview and deletion to an active permitted center head", async () => {
  await db.exec("RESET ROLE;SET ROLE anon");
  await expect(historyPreview()).rejects.toThrow(/permission denied/);
  await expect(clearHistory("x")).rejects.toThrow(/permission denied/);
  for (const id of [mentor, hr]) {
    await actor(id);
    await expect(historyPreview()).rejects.toThrow("FORBIDDEN");
    await expect(clearHistory("x")).rejects.toThrow("FORBIDDEN");
  }
  await db.exec(
    `RESET ROLE;UPDATE mentor_korat.app_users SET active=false WHERE id='${head}'`,
  );
  await actor(head);
  await expect(historyPreview()).rejects.toThrow("FORBIDDEN");
  await expect(clearHistory("x")).rejects.toThrow("FORBIDDEN");
  await db.exec(
    `RESET ROLE;UPDATE mentor_korat.app_users SET active=true WHERE id='${head}';INSERT INTO mentor_korat.user_permission_overrides VALUES('${head}','data.clear',false)`,
  );
  await actor(head);
  await expect(clearHistory("x")).rejects.toThrow("FORBIDDEN");
  await db.exec(
    `RESET ROLE;DELETE FROM mentor_korat.user_permission_overrides WHERE user_id='${head}'`,
  );
});
it("clears all old history atomically with confirmation, reason and stale-preview protection, retaining one clear record", async () => {
  await db.exec("RESET ROLE");
  await db.exec(
    `SELECT mentor_korat.audit('${head}','${employee}','MANAGE_employee');SELECT mentor_korat.audit('${head}',NULL,'MANAGE_setting');INSERT INTO mentor_korat.leave_requests(id,document_number,employee_id,mentor_id,assignment_status,leave_type,leave_date,period,reason) VALUES('${lid}','LE-256911009999','${employee}','${mentor}','ASSIGNED','ลาป่วย','2026-11-14','FULL','test')`,
  );
  await actor(head);
  const initial = await historyPreview();
  expect(initial.count).toBeGreaterThan(1);
  await expect(clearHistory(initial.snapshot, "wrong")).rejects.toThrow(
    "INVALID_CLEAR_CONFIRMATION",
  );
  await expect(
    clearHistory(initial.snapshot, "ล้างประวัติการดำเนินการ", "x"),
  ).rejects.toThrow("INVALID_CLEAR_CONFIRMATION");
  await db.exec(
    `RESET ROLE;SELECT mentor_korat.audit('${head}',NULL,'NEW_ACTION')`,
  );
  await actor(head);
  await expect(clearHistory(initial.snapshot)).rejects.toThrow(
    "STALE_CLEAR_PREVIEW",
  );
  const current = await historyPreview();
  expect(current.count).toBe(initial.count + 1);
  const result = (await clearHistory(current.snapshot)).rows[0].r;
  expect(result).toEqual({ cleared: current.count, retained: 1 });
  expect((await historyPreview()).count).toBe(1);
  await db.exec("RESET ROLE");
  const rows = (
    await db.query<{
      action: string;
      actor_id: string;
      new_data: { deleted_count: number; reason: string };
    }>("SELECT action,actor_id,new_data FROM mentor_korat.audit_logs")
  ).rows;
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    action: "DATA_CLEAR_AUDIT_HISTORY",
    actor_id: head,
    new_data: { deleted_count: current.count, reason: "เคลียร์ประวัติทดสอบ" },
  });
  for (const [table, n] of [
    ["employees", 1],
    ["departments", 1],
    ["app_users", 3],
    ["app_settings", 3],
    ["leave_requests", 1],
    ["storage_cleanup_jobs", 1],
  ] as const)
    expect(
      (await db.query(`SELECT count(*)::int n FROM mentor_korat.${table}`))
        .rows,
    ).toEqual([{ n }]);
  expect((await db.query("SELECT * FROM public.existing_system")).rows).toEqual(
    [{ value: "untouched" }],
  );
  expect(
    (await db.query("SELECT count(*)::int n FROM auth.users")).rows,
  ).toEqual([{ n: 3 }]);
  const def = (
    await db.query<{ definition: string }>(
      "SELECT pg_get_functiondef('mentor_korat.clear_audit_history(text,text,text)'::regprocedure) definition",
    )
  ).rows[0].definition;
  expect(def).toMatch(
    /DELETE FROM mentor_korat.audit_logs WHERE id IS NOT NULL;/,
  );
});
it("commits Discord metadata with token consumption, status, audit and outbox; denies clients and rolls back invalid uploads", async () => {
  const path = `${lid}/77777777-7777-4777-8777-777777777777.webp`;
  const args = [
    "c".repeat(64),
    path,
    100,
    "123456789012345678",
    "234567890123456789",
    "345678901234567890",
  ];
  await actor(head);
  await expect(
    db.query(
      "SELECT mentor_korat.complete_discord_upload($1,$2,$3,$4,$5,$6)",
      args,
    ),
  ).rejects.toThrow(/permission denied/);
  await db.exec(
    `RESET ROLE;INSERT INTO mentor_korat.evidence_upload_tokens(leave_id,token_hash,nonce) VALUES('${lid}',repeat('c',64),repeat('d',64));SET ROLE service_role`,
  );
  await expect(
    db.query("SELECT mentor_korat.complete_discord_upload($1,$2,$3,$4,$5,$6)", [
      ...args.slice(0, 3),
      "invalid",
      ...args.slice(4),
    ]),
  ).rejects.toThrow("INVALID_DISCORD_REFERENCE");
  await expect(
    db.query("SELECT mentor_korat.complete_discord_upload($1,$2,$3,$4,$5,$6)", [
      args[0],
      args[1],
      0,
      ...args.slice(3),
    ]),
  ).rejects.toThrow(/check constraint/);
  expect(
    (
      await db.query(
        "SELECT state FROM mentor_korat.evidence_upload_tokens WHERE token_hash=repeat('c',64)",
      )
    ).rows,
  ).toEqual([{ state: "ACTIVE" }]);
  await db.query(
    "SELECT mentor_korat.complete_discord_upload($1,$2,$3,$4,$5,$6)",
    args,
  );
  expect(
    (
      await db.query(
        "SELECT provider,discord_message_id,discord_attachment_id FROM mentor_korat.evidence_files WHERE path=$1",
        [path],
      )
    ).rows,
  ).toEqual([
    {
      provider: "discord",
      discord_message_id: args[4],
      discord_attachment_id: args[5],
    },
  ]);
  expect(
    (
      await db.query(
        "SELECT status FROM mentor_korat.leave_requests WHERE id=$1",
        [lid],
      )
    ).rows,
  ).toEqual([{ status: "WAITING_MENTOR_REVIEW" }]);
  expect(
    (
      await db.query(
        "SELECT state FROM mentor_korat.evidence_upload_tokens WHERE token_hash=repeat('c',64)",
      )
    ).rows,
  ).toEqual([{ state: "USED" }]);
  expect(
    (
      await db.query(
        "SELECT kind FROM mentor_korat.notification_outbox WHERE leave_id=$1",
        [lid],
      )
    ).rows,
  ).toEqual([{ kind: "WAITING_MENTOR_REVIEW" }]);
  await expect(
    db.query(
      "SELECT mentor_korat.complete_discord_upload($1,$2,$3,$4,$5,$6)",
      args,
    ),
  ).rejects.toThrow("INVALID_TOKEN");
  await actor(head);
  await clear((await preview()).snapshot);
  await db.exec("RESET ROLE");
  const jobs = (
    await db.query<{
      provider: string;
      discord_message_id: string | null;
      path: string;
    }>(
      "SELECT provider,discord_message_id,path FROM mentor_korat.storage_cleanup_jobs ORDER BY provider",
    )
  ).rows;
  expect(jobs).toHaveLength(2);
  expect(jobs[0]).toEqual({
    provider: "discord",
    discord_message_id: args[4],
    path,
  });
  expect(jobs[1].provider).toBe("supabase");
});
