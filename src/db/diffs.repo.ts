import type { Pool, QueryResultRow } from "pg";
import type { Change } from "../types.js";
import type { DiffRow } from "./rows.js";

function mapRow(row: QueryResultRow): DiffRow {
  return {
    id: row.id,
    serverId: row.server_id,
    fromSnapshotId: row.from_snapshot_id,
    toSnapshotId: row.to_snapshot_id,
    changes: row.changes_json,
    breakingCount: row.breaking_count,
    infoCount: row.info_count,
    createdAt: row.created_at,
  };
}

export class DiffsRepo {
  constructor(private readonly pool: Pool) {}

  async insert(
    serverId: number,
    fromSnapshotId: number | null,
    toSnapshotId: number,
    changes: Change[]
  ): Promise<DiffRow> {
    const breakingCount = changes.filter((c) => c.severity === "breaking").length;
    const infoCount = changes.length - breakingCount;
    const result = await this.pool.query(
      `INSERT INTO schema_diffs (server_id, from_snapshot_id, to_snapshot_id, changes_json, breaking_count, info_count)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [serverId, fromSnapshotId, toSnapshotId, JSON.stringify(changes), breakingCount, infoCount]
    );
    const row = result.rows[0];
    if (!row) throw new Error("Insert into schema_diffs returned no row.");
    return mapRow(row);
  }

  async listForServer(serverId: number, limit = 50): Promise<DiffRow[]> {
    const result = await this.pool.query(
      `SELECT * FROM schema_diffs WHERE server_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [serverId, limit]
    );
    return result.rows.map(mapRow);
  }

  async listBreakingSince(serverId: number, since: Date): Promise<DiffRow[]> {
    const result = await this.pool.query(
      `SELECT * FROM schema_diffs WHERE server_id = $1 AND breaking_count > 0 AND created_at >= $2 ORDER BY created_at DESC`,
      [serverId, since]
    );
    return result.rows.map(mapRow);
  }
}
