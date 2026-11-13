import { writeFileSync } from "node:fs";
import { buildSqlEditorBundle } from "./sql-editor-bundle.mjs";
const output = new URL("../supabase/setup-sql-editor.sql", import.meta.url);
writeFileSync(output, buildSqlEditorBundle(), "utf8");
console.log(
  "Created supabase/setup-sql-editor.sql. No database connection was made.",
);
