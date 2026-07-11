import { Pool } from "pg";
import { runMigrations } from "../../src/db/migrate.js";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://mcp_watch:devpassword@localhost:5432/mcp_schema_watch_test";

export async function createTestPool(): Promise<Pool> {
  const pool = new Pool({ connectionString: TEST_DATABASE_URL });
  await runMigrations(pool);
  return pool;
}

export async function truncateAll(pool: Pool): Promise<void> {
  await pool.query(`TRUNCATE watched_servers, schema_snapshots, schema_diffs, poll_failures RESTART IDENTITY CASCADE`);
}
