import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { buildSqlEditorBundle } from "../scripts/sql-editor-bundle.mjs";
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE TABLE public.existing_app(id int PRIMARY KEY, value text);
    INSERT INTO public.existing_app VALUES(1,'preserve me');`);
});
afterAll(async () => {
  await db.close();
});
it("exports current reviewed SQL, applies atomically, and reruns without changing existing app data", async () => {
  const sql = buildSqlEditorBundle();
  expect(readFileSync("supabase/setup-sql-editor.sql", "utf8")).toBe(sql);
  await db.exec(sql);
  await db.exec(sql);
  expect((await db.query("SELECT * FROM public.existing_app")).rows).toEqual([
    { id: 1, value: "preserve me" },
  ]);
  expect(
    (
      await db.query(
        "SELECT count(*)::int n FROM mentor_korat.schema_migrations",
      )
    ).rows,
  ).toEqual([{ n: 5 }]);
  expect(
    (
      await db.query(
        "SELECT has_table_privilege('authenticated','mentor_korat.schema_migrations','SELECT') allowed",
      )
    ).rows,
  ).toEqual([{ allowed: false }]);
});
it("refuses previously applied migrations whose checksums do not match", async () => {
  await db.exec(
    "UPDATE mentor_korat.schema_migrations SET checksum='changed' WHERE version='202611130001_initial.sql'",
  );
  await expect(db.exec(buildSqlEditorBundle())).rejects.toThrow(
    "checksum mismatch",
  );
  await db.exec("ROLLBACK");
});
