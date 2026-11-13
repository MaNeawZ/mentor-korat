import postgres from "postgres";
import { reviewedMigrations } from "./migration-safety.mjs";
const files = reviewedMigrations();
if (process.argv.includes("--check")) {
  console.log(
    `Validated ${files.length} reviewed, schema-isolated migrations.`,
  );
  process.exit(0);
}
if (!process.env.SUPABASE_MIGRATION_DATABASE_URL)
  throw new Error("SUPABASE_MIGRATION_DATABASE_URL is required");
const sql = postgres(process.env.SUPABASE_MIGRATION_DATABASE_URL, {
  max: 1,
  ssl: process.env.MIGRATION_LOCAL === "1" ? false : "require",
  onnotice: () => {},
});
try {
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(680318411)`;
    await tx.unsafe("CREATE SCHEMA IF NOT EXISTS mentor_korat");
    await tx.unsafe(
      "CREATE TABLE IF NOT EXISTS mentor_korat.schema_migrations (version text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    await tx.unsafe(
      "ALTER TABLE mentor_korat.schema_migrations ENABLE ROW LEVEL SECURITY",
    );
    await tx.unsafe(
      "REVOKE ALL ON mentor_korat.schema_migrations FROM PUBLIC,anon,authenticated",
    );
    for (const file of files) {
      const existing =
        await tx`SELECT checksum FROM mentor_korat.schema_migrations WHERE version=${file.name}`;
      if (existing.length) {
        if (existing[0].checksum !== file.hash)
          throw new Error(`Applied migration changed: ${file.name}`);
        continue;
      }
      await tx.unsafe(file.sql);
      await tx`INSERT INTO mentor_korat.schema_migrations(version,checksum) VALUES(${file.name},${file.hash})`;
      console.log(`Applied ${file.name}`);
    }
    await tx.unsafe(
      "REVOKE ALL ON mentor_korat.schema_migrations FROM PUBLIC,anon,authenticated",
    );
  });
} finally {
  await sql.end();
}
