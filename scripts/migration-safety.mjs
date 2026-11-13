import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
export function migrationFiles() {
  return readdirSync(new URL("../supabase/migrations/", import.meta.url))
    .filter((n) => /^\d{12}_.+\.sql$/.test(n))
    .sort();
}
export function checksum(sql) {
  return createHash("sha256").update(sql).digest("hex");
}
export function validateSql(sql) {
  // All files must additionally match a reviewed SHA256. This deliberately fails closed.
  if (
    /\bpublic\s*\.|\b(?:DROP|TRUNCATE|RESET)\b|\bALTER\s+(?:DATABASE|ROLE|SYSTEM|PUBLICATION)\b|\bCOPY\b|\b(?:CREATE|ALTER)\s+SCHEMA\s+(?!IF\s+NOT\s+EXISTS\s+mentor_korat\b|mentor_korat\b)/i.test(
      sql,
    )
  )
    throw new Error("Migration violates schema isolation");
  if (/\bstorage\s*\.|\bauth\s*\.(?!uid\b|users\b)/i.test(sql))
    throw new Error("Migration touches restricted system objects");
  if (!sql.includes("mentor_korat."))
    throw new Error("Migration must explicitly qualify its schema");
}
export function reviewedMigrations() {
  const manifest = JSON.parse(
    readFileSync(
      new URL("../supabase/migration-checksums.json", import.meta.url),
      "utf8",
    ),
  );
  return migrationFiles().map((name) => {
    const sql = readFileSync(
      new URL(`../supabase/migrations/${name}`, import.meta.url),
      "utf8",
    );
    validateSql(sql);
    const hash = checksum(sql);
    if (manifest[name] !== hash)
      throw new Error(
        `Unreviewed migration: ${name}. Review SQL scope, then update migration-checksums.json.`,
      );
    return { name, sql, hash };
  });
}
