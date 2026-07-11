import type { Pool, QueryResultRow } from "pg";
import type { PollFailureRow } from "./rows.js";

function mapRow(row: QueryResultRow): PollFailureRow {
  return {
    id: row.id,
    serverId: row.server_id,
    errorMessage: row.error_message,
    occurredAt: row.occurred_at,
  };
}

export class PollFailuresRepo {
  constructor(private readonly pool: Pool) {}

  async insert(serverId: number, errorMessage: string): Promise<PollFailureRow> {
    const result = await this.pool.query(
      `INSERT INTO poll_failures (server_id, error_message) VALUES ($1, $2) RETURNING *`,
      [serverId, errorMessage]
    );
    const row = result.rows[0];
    if (!row) throw new Error("Insert into poll_failures returned no row.");
    return mapRow(row);
  }

  async listForServer(serverId: number, limit = 20): Promise<PollFailureRow[]> {
    const result = await this.pool.query(
      `SELECT * FROM poll_failures WHERE server_id = $1 ORDER BY occurred_at DESC LIMIT $2`,
      [serverId, limit]
    );
    return result.rows.map(mapRow);
  }
}
