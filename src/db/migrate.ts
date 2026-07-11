import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Pool } from "pg";

const here = dirname(fileURLToPath(import.meta.url));

export async function runMigrations(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Transaction-scoped advisory lock: auto-released on COMMIT/ROLLBACK,
    // so there's no separate unlock call to forget. This serializes
    // concurrent migration attempts against the same database.
    // CREATE TABLE IF NOT EXISTS is not safe under concurrent execution —
    // two connections can both see "doesn't exist yet" and race to
    // create it, which Postgres reports as a duplicate-key error on its
    // own catalog tables (pg_type/pg_class), not a normal application
    // error. Matters both for parallel test files sharing one database
    // and for multiple app instances that might boot at once in prod.
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1)::bigint)", ["mcp-schema-watch-migrations"]);
    const sql = readFileSync(join(here, "schema.sql"), "utf8");
    await client.query(sql);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function main() {
  const { createPool } = await import("./pool.js");
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set.");
    process.exitCode = 1;
    return;
  }
  const pool = createPool(connectionString);
  try {
    await runMigrations(pool);
    console.log("Migrations applied.");
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
