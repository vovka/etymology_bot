import { readFileSync } from "node:fs";
import path from "node:path";
import type { NeonQueryFunction } from "@neondatabase/serverless";

const SCHEMA_PATH = path.join(process.cwd(), "db", "schema.sql");

/** Runs db/schema.sql one statement at a time (the HTTP driver takes one per query); every statement is idempotent. */
export async function applySchema(sql: NeonQueryFunction<false, false>): Promise<void> {
  const statements = readFileSync(SCHEMA_PATH, "utf8").split(/;\s*$/m).map((s) => s.trim()).filter(Boolean);
  for (const statement of statements) await sql.query(statement);
}
