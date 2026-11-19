import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { newToken } from "../src/lib/security";
let db: PGlite;
const head = "11111111-1111-4111-8111-111111111111",
  mentor = "22222222-2222-4222-8222-222222222222",
  other = "33333333-3333-4333-8333-333333333333",
  hr = "44444444-4444-4444-8444-444444444444",
  employee = "55555555-5555-4555-8555-555555555555",
  department = "66666666-6666-4666-8666-666666666666";
const secret = "s".repeat(40);
let lid: string;
let token: ReturnType<typeof newToken>;
async function actor(id: string) {
  await db.exec(
    `RESET ROLE; SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${id}',false);`,
  );
}
async function admin() {
  await db.exec("RESET ROLE");
}
async function scalar(sql: string) {
  return (await db.query<Record<string, unknown>>(sql)).rows[0];
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;GRANT USAGE ON SCHEMA auth TO authenticated,service_role;GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,service_role;CREATE TABLE public.existing_system(id int PRIMARY KEY, value text);INSERT INTO public.existing_system VALUES(1,'untouched');`,
  );
  for (const f of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync(`supabase/migrations/${f}`, "utf8"));
  await db.exec(
    `INSERT INTO auth.users VALUES('${head}'),('${mentor}'),('${other}'),('${hr}');INSERT INTO mentor_korat.app_users(id,name,role) VALUES('${head}','Head','CENTER_HEAD'),('${mentor}','Mentor','MENTOR'),('${other}','Other','MENTOR'),('${hr}','HR','HR');INSERT INTO mentor_korat.departments VALUES('${department}','Development');INSERT INTO mentor_korat.employees(id,code,name,department_id,mentor_id) VALUES('${employee}','68364','จักรพรรดิ์ อนุไพร','${department}','${mentor}');INSERT INTO mentor_korat.integration_events(id,payload) VALUES('event-1','{"source":{"groupId":"group"},"message":{"text":"original"}}');`,
  );
  token = newToken(secret);
  await db.query("SELECT mentor_korat.ingest_leave($1,$2::jsonb,$3,$4)", [
    "event-1",
    JSON.stringify({
      employee_code: "68364",
      employee_name: "จักรพรรดิ์ อนุไพร",
      document_number: "LE-256911003477",
      leave_date: "2025-11-13",
      leave_type: "ลาป่วย",
      period: "PM",
      reason: "พบแพทย์",
      issues: [],
    }),
    token.hash,
    token.nonce,
  ]);
  lid = String(
    (await scalar("SELECT id FROM mentor_korat.leave_requests"))?.id,
  );
});
afterAll(async () => {
  await db?.close();
});
it("registers an alphanumeric employee through the management RPC and ingests their LINE leave without affecting numeric codes", async () => {
  await admin();
  await db.exec("BEGIN");
  try {
    await actor(head);
    await db.query("SELECT mentor_korat.manage_entity('employee',$1::jsonb)", [
      JSON.stringify({
        code: "OLS768563",
        name: "พนักงาน OLS",
        department_id: department,
        mentor_id: mentor,
        active: true,
      }),
    ]);
    await admin();
    const t = newToken(secret);
    await db.exec(
      `INSERT INTO mentor_korat.integration_events(id,payload) VALUES('ols-event','{"source":{"groupId":"group"},"message":{"id":"ols-message","text":"original"}}')`,
    );
    await db.query("SELECT mentor_korat.ingest_leave($1,$2::jsonb,$3,$4)", [
      "ols-event",
      JSON.stringify({
        employee_code: "OLS768563",
        employee_name: "พนักงาน OLS",
        document_number: "LE-256911009900",
        leave_date: "2026-11-16",
        leave_type: "ลาป่วย",
        period: "AM",
        reason: "พบแพทย์",
        issues: [],
      }),
      t.hash,
      t.nonce,
    ]);
    expect(
      (
        await db.query(
          "SELECT e.code,l.status FROM mentor_korat.leave_requests l JOIN mentor_korat.employees e ON e.id=l.employee_id WHERE l.document_number='LE-256911009900'",
        )
      ).rows,
    ).toEqual([{ code: "OLS768563", status: "WAITING_EVIDENCE" }]);
    expect(
      (
        await db.query(
          "SELECT code FROM mentor_korat.employees WHERE code='68364'",
        )
      ).rows,
    ).toEqual([{ code: "68364" }]);
    await expect(
      db.query(
        "INSERT INTO mentor_korat.employees(code,name,department_id) VALUES($1,$2,$3)",
        ["OLS-123", "Invalid employee", department],
      ),
    ).rejects.toThrow(/employee_code_format/);
  } finally {
    await db.exec("ROLLBACK");
    await admin();
  }
});
it("imports atomically, preserves existing employees and checks database permissions", async () => {
  await actor(head);
  const rows = [
    { code: "CSV123", name: "CSV employee", active: true },
    { code: "68364", name: "Must not overwrite", active: false },
  ];
  const before = (
    await db.query(
      "SELECT name,mentor_id,active FROM mentor_korat.employees WHERE code='68364'",
    )
  ).rows;
  const result = await db.query<{ result: { added: number; skipped: number } }>(
    "SELECT mentor_korat.import_employees($1,$2::jsonb) result",
    [department, JSON.stringify(rows)],
  );
  expect(result.rows[0].result).toEqual({ added: 1, skipped: 1 });
  expect(
    (
      await db.query(
        "SELECT name,mentor_id,active FROM mentor_korat.employees WHERE code='68364'",
      )
    ).rows,
  ).toEqual(before);
  expect(
    (
      await db.query(
        "SELECT mentor_id FROM mentor_korat.employees WHERE code='CSV123'",
      )
    ).rows,
  ).toEqual([{ mentor_id: null }]);
  expect(
    (
      await db.query(
        "SELECT action FROM mentor_korat.audit_logs WHERE new_data->>'code'='CSV123'",
      )
    ).rows,
  ).toEqual([{ action: "MANAGE_employee" }]);
  await expect(
    db.query("SELECT mentor_korat.import_employees($1,$2::jsonb)", [
      department,
      JSON.stringify([
        { code: "CSV999", name: "Rollback", active: true },
        { code: "BAD!", name: "Bad", active: true },
      ]),
    ]),
  ).rejects.toThrow(/INVALID_EMPLOYEE/);
  expect(
    (
      await db.query(
        "SELECT id FROM mentor_korat.employees WHERE code='CSV999'",
      )
    ).rows,
  ).toEqual([]);
  await actor(mentor);
  await expect(
    db.query("SELECT mentor_korat.import_employees($1,$2::jsonb)", [
      department,
      JSON.stringify(rows),
    ]),
  ).rejects.toThrow(/FORBIDDEN/);
  await admin();
  await db.exec(
    "DELETE FROM mentor_korat.audit_logs WHERE new_data->>'code'='CSV123'; DELETE FROM mentor_korat.employees WHERE code='CSV123'",
  );
});
describe("real PostgreSQL transaction and RLS integration (isolated PGlite)", () => {
  it("does not change existing public data", async () => {
    await admin();
    expect(await scalar("SELECT * FROM public.existing_system")).toEqual({
      id: 1,
      value: "untouched",
    });
  });
  it("has RLS on every app table and exposes no anonymous tables or privileged functions", async () => {
    await admin();
    const r = await db.query<{ relrowsecurity: boolean }>(
      "SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='mentor_korat' AND c.relkind='r'",
    );
    expect(r.rows.every((x) => x.relrowsecurity)).toBe(true);
    expect(
      await scalar(
        "SELECT has_table_privilege('anon','mentor_korat.leave_requests','SELECT') allowed",
      ),
    ).toEqual({ allowed: false });
    expect(
      await scalar(
        "SELECT has_function_privilege('authenticated','mentor_korat.complete_upload(text,text,integer)','EXECUTE') allowed",
      ),
    ).toEqual({ allowed: false });
  });
  it("isolates mentor assignments via RLS", async () => {
    await actor(other);
    expect(
      (await db.query("SELECT * FROM mentor_korat.leave_requests")).rows,
    ).toHaveLength(0);
    await actor(mentor);
    expect(
      (await db.query("SELECT * FROM mentor_korat.leave_requests")).rows,
    ).toHaveLength(1);
    expect(
      (await db.query("SELECT * FROM mentor_korat.evidence_upload_tokens"))
        .rows,
    ).toHaveLength(0);
  });
  it("rejects anonymous direct access", async () => {
    await admin();
    await db.exec("SET ROLE anon");
    await expect(
      db.query("SELECT * FROM mentor_korat.employees"),
    ).rejects.toThrow();
  });
  it("is idempotent for repeated LINE events and document numbers", async () => {
    await admin();
    await db.query("SELECT mentor_korat.ingest_leave($1,$2::jsonb,$3,$4)", [
      "event-1",
      "{}",
      token.hash,
      token.nonce,
    ]);
    expect(
      await scalar("SELECT count(*)::int n FROM mentor_korat.leave_requests"),
    ).toEqual({ n: 1 });
  });
  it("rolls back invalid uploads without consuming token, then consumes it atomically", async () => {
    await admin();
    await expect(
      db.query("SELECT mentor_korat.complete_upload($1,$2,$3)", [
        token.hash,
        `${lid}/test.webp`,
        -1,
      ]),
    ).rejects.toThrow();
    expect(
      await scalar(
        `SELECT state FROM mentor_korat.evidence_upload_tokens WHERE token_hash='${token.hash}'`,
      ),
    ).toEqual({ state: "ACTIVE" });
    await db.query("SELECT mentor_korat.complete_upload($1,$2,$3)", [
      token.hash,
      `${lid}/test.webp`,
      100,
    ]);
  });
  it("blocks duplicate and invalid upload tokens", async () => {
    await admin();
    await expect(
      db.query("SELECT mentor_korat.complete_upload($1,$2,$3)", [
        token.hash,
        "second",
        10,
      ]),
    ).rejects.toThrow("INVALID_TOKEN");
    await expect(
      db.query("SELECT mentor_korat.complete_upload($1,$2,$3)", [
        "invalid",
        "third",
        10,
      ]),
    ).rejects.toThrow("INVALID_TOKEN");
    expect(
      await scalar(
        `SELECT status,version FROM mentor_korat.leave_requests WHERE id='${lid}'`,
      ),
    ).toEqual({ status: "WAITING_MENTOR_REVIEW", version: 2 });
  });
  it("rejects mentor final-review escalation and stale writes", async () => {
    await actor(mentor);
    await expect(
      db.query(
        "SELECT mentor_korat.review_leave($1,2,'verify','',NULL,NULL,NULL)",
        [lid],
      ),
    ).rejects.toThrow("FORBIDDEN");
    await expect(
      db.query(
        "SELECT mentor_korat.review_leave($1,1,'precheck','',NULL,NULL,NULL)",
        [lid],
      ),
    ).rejects.toThrow("VERSION_CONFLICT");
    await expect(
      db.query(
        "SELECT mentor_korat.review_leave($1,NULL,'precheck','',NULL,NULL,NULL)",
        [lid],
      ),
    ).rejects.toThrow("VERSION_CONFLICT");
    await expect(
      db.query(
        "SELECT mentor_korat.review_leave($1,2,'reupload',NULL,NULL,NULL,NULL)",
        [lid],
      ),
    ).rejects.toThrow("REASON_REQUIRED");
  });
  it("reuploads invalidate old token and preserve evidence versions", async () => {
    await actor(mentor);
    const t = newToken(secret);
    await db.query(
      "SELECT mentor_korat.review_leave($1,2,'reupload','ไม่ชัด',NULL,$2,$3)",
      [lid, t.hash, t.nonce],
    );
    await admin();
    await expect(
      db.query("SELECT mentor_korat.complete_upload($1,$2,$3)", [
        token.hash,
        `${lid}/old.webp`,
        10,
      ]),
    ).rejects.toThrow();
    await db.query("SELECT mentor_korat.complete_upload($1,$2,$3)", [
      t.hash,
      `${lid}/version-2.webp`,
      10,
    ]);
    expect(
      await scalar(
        `SELECT count(*)::int n FROM mentor_korat.evidence_files WHERE leave_id='${lid}'`,
      ),
    ).toEqual({ n: 2 });
  });
  it("prechecks then allows HR final review, with atomic audit and notification outbox", async () => {
    await actor(mentor);
    await db.query(
      "SELECT mentor_korat.review_leave($1,4,'precheck','ผ่าน',NULL,NULL,NULL)",
      [lid],
    );
    await actor(hr);
    await db.query(
      "SELECT mentor_korat.review_leave($1,5,'verify','ตรวจแล้ว',NULL,NULL,NULL)",
      [lid],
    );
    await admin();
    expect(
      await scalar(
        `SELECT status,version FROM mentor_korat.leave_requests WHERE id='${lid}'`,
      ),
    ).toEqual({ status: "VERIFIED", version: 6 });
    expect(
      Number(
        (await scalar("SELECT count(*) n FROM mentor_korat.audit_logs"))?.n,
      ),
    ).toBeGreaterThan(4);
    expect(
      Number(
        (
          await scalar(
            "SELECT count(*) n FROM mentor_korat.notification_outbox",
          )
        )?.n,
      ),
    ).toBeGreaterThan(4);
    const queued = await db.query<{ kind: string }>(
      "SELECT DISTINCT kind FROM mentor_korat.notification_outbox WHERE leave_id=$1",
      [lid],
    );
    expect(queued.rows.map((row) => row.kind)).toEqual(
      expect.arrayContaining([
        "WAITING_EVIDENCE",
        "WAITING_MENTOR_REVIEW",
        "REUPLOAD_REQUIRED",
        "WAITING_FINAL_REVIEW",
        "VERIFIED",
      ]),
    );
  });
  it("honors HR permission overrides and disabled accounts immediately", async () => {
    await admin();
    await db.exec(
      `INSERT INTO mentor_korat.user_permission_overrides VALUES('${hr}','evidence.final_review',false);UPDATE mentor_korat.app_users SET active=false WHERE id='${other}';`,
    );
    await actor(hr);
    expect(
      await scalar(
        "SELECT mentor_korat.has_permission('evidence.final_review') allowed",
      ),
    ).toEqual({ allowed: false });
    await actor(other);
    expect(await scalar("SELECT mentor_korat.my_profile() p")).toEqual({
      p: null,
    });
    expect(
      (await db.query("SELECT * FROM mentor_korat.leave_requests")).rows,
    ).toHaveLength(0);
  });
  it("permits center head assignment and preserves terminal leave ownership", async () => {
    await actor(head);
    await db.query(
      "SELECT mentor_korat.manage_entity('assignment',$1::jsonb)",
      [JSON.stringify({ employee_ids: [employee], mentor_id: null })],
    );
    expect(
      await scalar(
        `SELECT mentor_id FROM mentor_korat.employees WHERE id='${employee}'`,
      ),
    ).toEqual({ mentor_id: null });
    expect(
      await scalar(
        `SELECT mentor_id FROM mentor_korat.leave_requests WHERE id='${lid}'`,
      ),
    ).toEqual({ mentor_id: mentor });
  });
  it("rate limits across invocations", async () => {
    await admin();
    expect(
      await scalar("SELECT mentor_korat.rate_limit('test',1,60) allowed"),
    ).toEqual({ allowed: true });
    expect(
      await scalar("SELECT mentor_korat.rate_limit('test',1,60) allowed"),
    ).toEqual({ allowed: false });
  });
  it("records unassigned leaves separately and alerts the center head", async () => {
    await admin();
    const t = newToken(secret);
    await db.exec(
      `INSERT INTO mentor_korat.integration_events(id,payload) VALUES('unassigned','{"source":{"groupId":"group"},"message":{"text":"original"}}')`,
    );
    await db.query("SELECT mentor_korat.ingest_leave($1,$2::jsonb,$3,$4)", [
      "unassigned",
      JSON.stringify({
        employee_code: "68364",
        employee_name: "จักรพรรดิ์ อนุไพร",
        document_number: "LE-256911003478",
        leave_date: "2025-11-13",
        leave_type: "ลาป่วย",
        period: "FULL",
        reason: "พบแพทย์",
        issues: [],
      }),
      t.hash,
      t.nonce,
    ]);
    expect(
      await scalar(
        "SELECT assignment_status,status FROM mentor_korat.leave_requests WHERE document_number='LE-256911003478'",
      ),
    ).toEqual({ assignment_status: "UNASSIGNED", status: "WAITING_EVIDENCE" });
    expect(
      Number(
        (
          await scalar(
            `SELECT count(*) n FROM mentor_korat.notifications n JOIN mentor_korat.leave_requests l ON l.id=n.leave_id WHERE l.document_number='LE-256911003478' AND n.user_id='${head}'`,
          )
        )?.n,
      ),
    ).toBeGreaterThan(0);
  });
  it("permits only one concurrent completion and makes revoked links unusable", async () => {
    await admin();
    const row = await scalar(
      "SELECT id FROM mentor_korat.leave_requests WHERE document_number='LE-256911003478'",
    );
    const id = String(row?.id);
    const oldToken = newToken(secret),
      fresh = newToken(secret);
    await db.query("SELECT mentor_korat.rotate_token($1,$2,$3)", [
      id,
      oldToken.hash,
      oldToken.nonce,
    ]);
    await db.query("SELECT mentor_korat.rotate_token($1,$2,$3)", [
      id,
      fresh.hash,
      fresh.nonce,
    ]);
    await expect(
      db.query("SELECT mentor_korat.complete_upload($1,$2,$3)", [
        oldToken.hash,
        `${id}/revoked.webp`,
        10,
      ]),
    ).rejects.toThrow("INVALID_TOKEN");
    const results = await Promise.allSettled([
      db.query("SELECT mentor_korat.complete_upload($1,$2,$3)", [
        fresh.hash,
        `${id}/a.webp`,
        10,
      ]),
      db.query("SELECT mentor_korat.complete_upload($1,$2,$3)", [
        fresh.hash,
        `${id}/b.webp`,
        10,
      ]),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      await scalar(
        `SELECT count(*)::int n FROM mentor_korat.evidence_files WHERE leave_id='${id}'`,
      ),
    ).toEqual({ n: 1 });
  });
  it("keeps raw LINE messages and other mentors evidence inaccessible to mutation", async () => {
    await actor(mentor);
    await expect(
      db.query("UPDATE mentor_korat.leave_raw_messages SET message='tampered'"),
    ).rejects.toThrow();
    await actor(other);
    expect(
      (await db.query("SELECT * FROM mentor_korat.evidence_files")).rows,
    ).toHaveLength(0);
  });
  it("logs invalid employee codes without fabricating a leave", async () => {
    await admin();
    const t = newToken(secret);
    await db.exec(
      `INSERT INTO mentor_korat.integration_events(id,payload) VALUES('bad-employee','{}')`,
    );
    await db.query("SELECT mentor_korat.ingest_leave($1,$2::jsonb,$3,$4)", [
      "bad-employee",
      JSON.stringify({
        employee_code: "99999",
        document_number: "LE-256911999999",
        issues: [],
      }),
      t.hash,
      t.nonce,
    ]);
    expect(
      await scalar(
        "SELECT count(*)::int n FROM mentor_korat.leave_requests WHERE document_number='LE-256911999999'",
      ),
    ).toEqual({ n: 0 });
    expect(
      await scalar(
        "SELECT issues FROM mentor_korat.leave_parsing_issues WHERE event_id='bad-employee'",
      ),
    ).toEqual({ issues: ["UNKNOWN_EMPLOYEE"] });
  });
  it("creates distinct leaves for multiple registered employees in one processing burst", async () => {
    await admin();
    const second = "77777777-7777-4777-8777-777777777777";
    await db.query(
      "INSERT INTO mentor_korat.employees(id,code,name,department_id,mentor_id) VALUES($1,$2,$3,$4,$5)",
      [second, "68365", "พนักงาน ทดสอบ", department, mentor],
    );
    const messages = [
      {
        event: "multi-1",
        code: "68364",
        name: "จักรพรรดิ์ อนุไพร",
        doc: "LE-256911003480",
      },
      {
        event: "multi-2",
        code: "68365",
        name: "พนักงาน ทดสอบ",
        doc: "LE-256911003481",
      },
    ];
    for (const message of messages) {
      await db.query(
        "INSERT INTO mentor_korat.integration_events(id,payload) VALUES($1,$2::jsonb)",
        [
          message.event,
          JSON.stringify({
            source: { groupId: "group" },
            message: { text: "original" },
          }),
        ],
      );
      const t = newToken(secret);
      await db.query("SELECT mentor_korat.ingest_leave($1,$2::jsonb,$3,$4)", [
        message.event,
        JSON.stringify({
          employee_code: message.code,
          employee_name: message.name,
          document_number: message.doc,
          leave_date: "2026-11-13",
          leave_type: "ลากิจ",
          period: "FULL",
          reason: "ทดสอบระบบ",
          issues: [],
        }),
        t.hash,
        t.nonce,
      ]);
    }
    expect(
      await scalar(
        "SELECT count(*)::int n FROM mentor_korat.leave_requests WHERE document_number IN ('LE-256911003480','LE-256911003481')",
      ),
    ).toEqual({ n: 2 });
  });
  it("shows mismatched names and reused document numbers as separate issues instead of silently losing messages", async () => {
    await admin();
    const cases = [
      {
        event: "wrong-name",
        doc: "LE-256911003482",
        name: "ชื่อ ไม่ตรง",
        expected: ["NAME_MISMATCH"],
      },
      {
        event: "same-document",
        doc: "LE-256911003480",
        name: "พนักงาน ทดสอบ",
        expected: ["DUPLICATE_DOCUMENT"],
      },
    ];
    for (const message of cases) {
      await db.query(
        "INSERT INTO mentor_korat.integration_events(id,payload) VALUES($1,$2::jsonb)",
        [message.event, "{}"],
      );
      const t = newToken(secret);
      await db.query("SELECT mentor_korat.ingest_leave($1,$2::jsonb,$3,$4)", [
        message.event,
        JSON.stringify({
          employee_code: "68365",
          employee_name: message.name,
          document_number: message.doc,
          leave_date: "2026-11-13",
          leave_type: "ลากิจ",
          period: "FULL",
          reason: "ทดสอบระบบ",
          issues: [],
        }),
        t.hash,
        t.nonce,
      ]);
      const r = await db.query(
        "SELECT issues FROM mentor_korat.leave_parsing_issues WHERE event_id=$1",
        [message.event],
      );
      expect(r.rows).toEqual([{ issues: message.expected }]);
    }
  });
});
