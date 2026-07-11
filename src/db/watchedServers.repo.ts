import type { Pool, QueryResultRow } from "pg";
import type { CreateWatchedServerInput, WatchedServerRow } from "./rows.js";

function mapRow(row: QueryResultRow): WatchedServerRow {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    transport: row.transport,
    pollIntervalMs: row.poll_interval_ms,
    enabled: row.enabled,
    slackWebhookUrl: row.slack_webhook_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class WatchedServersRepo {
  constructor(private readonly pool: Pool) {}

  async create(input: CreateWatchedServerInput): Promise<WatchedServerRow> {
    const result = await this.pool.query(
      `INSERT INTO watched_servers (name, url, transport, poll_interval_ms, slack_webhook_url)
       VALUES ($1, $2, $3, COALESCE($4, 300000), $5)
       RETURNING *`,
      [input.name, input.url, input.transport, input.pollIntervalMs ?? null, input.slackWebhookUrl ?? null]
    );
    const row = result.rows[0];
    if (!row) throw new Error("Insert into watched_servers returned no row.");
    return mapRow(row);
  }

  async list(): Promise<WatchedServerRow[]> {
    const result = await this.pool.query(`SELECT * FROM watched_servers ORDER BY name ASC`);
    return result.rows.map(mapRow);
  }

  async listEnabled(): Promise<WatchedServerRow[]> {
    const result = await this.pool.query(`SELECT * FROM watched_servers WHERE enabled = true ORDER BY name ASC`);
    return result.rows.map(mapRow);
  }

  async findById(id: number): Promise<WatchedServerRow | null> {
    const result = await this.pool.query(`SELECT * FROM watched_servers WHERE id = $1`, [id]);
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async findByName(name: string): Promise<WatchedServerRow | null> {
    const result = await this.pool.query(`SELECT * FROM watched_servers WHERE name = $1`, [name]);
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async setEnabled(id: number, enabled: boolean): Promise<void> {
    await this.pool.query(`UPDATE watched_servers SET enabled = $2, updated_at = now() WHERE id = $1`, [id, enabled]);
  }

  async delete(id: number): Promise<void> {
    await this.pool.query(`DELETE FROM watched_servers WHERE id = $1`, [id]);
  }
}
