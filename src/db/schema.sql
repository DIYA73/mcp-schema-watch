-- mcp-schema-watch database schema.
-- Idempotent: safe to run against an already-initialized database.

CREATE TABLE IF NOT EXISTS watched_servers (
  id                SERIAL PRIMARY KEY,
  name              TEXT NOT NULL UNIQUE,
  url               TEXT NOT NULL,
  transport         TEXT NOT NULL CHECK (transport IN ('streamable-http', 'sse')),
  poll_interval_ms  INTEGER NOT NULL DEFAULT 300000 CHECK (poll_interval_ms >= 10000),
  enabled           BOOLEAN NOT NULL DEFAULT true,
  slack_webhook_url TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS schema_snapshots (
  id            SERIAL PRIMARY KEY,
  server_id     INTEGER NOT NULL REFERENCES watched_servers(id) ON DELETE CASCADE,
  tools_json    JSONB NOT NULL,
  hash          TEXT NOT NULL,
  captured_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_schema_snapshots_server_captured
  ON schema_snapshots (server_id, captured_at DESC);

CREATE TABLE IF NOT EXISTS schema_diffs (
  id                SERIAL PRIMARY KEY,
  server_id         INTEGER NOT NULL REFERENCES watched_servers(id) ON DELETE CASCADE,
  from_snapshot_id  INTEGER REFERENCES schema_snapshots(id) ON DELETE SET NULL,
  to_snapshot_id    INTEGER NOT NULL REFERENCES schema_snapshots(id) ON DELETE CASCADE,
  changes_json      JSONB NOT NULL,
  breaking_count    INTEGER NOT NULL,
  info_count        INTEGER NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_schema_diffs_server_created
  ON schema_diffs (server_id, created_at DESC);

CREATE TABLE IF NOT EXISTS poll_failures (
  id            SERIAL PRIMARY KEY,
  server_id     INTEGER NOT NULL REFERENCES watched_servers(id) ON DELETE CASCADE,
  error_message TEXT NOT NULL,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_poll_failures_server_occurred
  ON poll_failures (server_id, occurred_at DESC);
