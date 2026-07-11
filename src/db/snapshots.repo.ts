import type { Pool, QueryResultRow } from "pg";
import type { ToolDefinition } from "../types.js";
import type { SnapshotRow } from "./rows.js";

function mapRow(row: QueryResultRow): SnapshotRow {
  return {
    id: row.id,
    serverId: row.server_id,
    tools: row.tools_json,
    hash: row.hash,
    capturedAt: row.captured_at,
  };
}

export class SnapshotsRepo {
  constructor(private readonly pool: Pool) {}

  async insert(serverId: number, tools: ToolDefinition[], hash: string): Promise<SnapshotRow> {
    const result = await this.pool.query(
      `INSERT INTO schema_snapshots (server_id, tools_json, hash) VALUES ($1, $2, $3) RETURNING *`,
      [serverId, JSON.stringify(tools), hash]
    );
    const row = result.rows[0];
    if (!row) throw new Error("Insert into schema_snapshots returned no row.");
    return mapRow(row);
  }

  async latest(serverId: number): Promise<SnapshotRow | null> {
    const result = await this.pool.query(
      `SELECT * FROM schema_snapshots WHERE server_id = $1 ORDER BY captured_at DESC LIMIT 1`,
      [serverId]
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async listForServer(serverId: number, limit = 50): Promise<SnapshotRow[]> {
    const result = await this.pool.query(
      `SELECT * FROM schema_snapshots WHERE server_id = $1 ORDER BY captured_at DESC LIMIT $2`,
      [serverId, limit]
    );
    return result.rows.map(mapRow);
  }
}
