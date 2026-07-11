# mcp-schema-watch

Polls the MCP servers you depend on and tells you when a tool's schema
changed in a way that will actually break your code — not just "something
changed," but *is this breaking or safe*, with a reason.

## Status: complete, running service

- Diff engine (`src/diff/diffTools.ts`) — pure function, decides breaking
  vs. info for every kind of schema change (see the table below)
- Order-independent snapshot hashing so tool reordering doesn't look like
  a schema change
- A live poller (`src/mcp/pollServer.ts`) built and verified against the
  actual published `@modelcontextprotocol/sdk@1.29.0` — including a real
  end-to-end check against two live MCP servers over the wire, not just
  mocks
- Postgres persistence: `watched_servers`, `schema_snapshots`,
  `schema_diffs`, `poll_failures`
- A BullMQ repeatable job per watched server that polls on its own
  interval, skips writing a new snapshot when nothing changed, and only
  runs the diff (and the alert) when the hash actually moves
- A REST API to add, disable, delete, and manually re-poll watched
  servers, and to pull diff history
- Slack webhook alerts, fired only for `severity: "breaking"` changes —
  a new optional field or a relaxed requirement doesn't page anyone
- 41 tests total: the diff engine and hashing (pure), the repository
  layer (real integration tests against a real local Postgres), and the
  polling orchestration logic (unit tests with in-memory fakes)

**Not built yet:** a CLI (same shape as `skillcheck`'s) and a dashboard UI
— the REST API is there for either to sit on top of later.

## Why v1 of the SDK, not v2

`@modelcontextprotocol/sdk` v1.x is what this is built against. The SDK's
own `main` branch has already moved to a v2 beta that splits into
separate `@modelcontextprotocol/client` / `@modelcontextprotocol/server`
packages, tracking the 2026-07-28 MCP spec revision. v1 remains the
supported production release and keeps getting fixes for at least 6
months after v2 ships — and yes, watching for exactly this kind of split
is the whole point of this tool.

## The diff rules

| Change | Severity |
|---|---|
| Tool removed | breaking |
| Tool added | info |
| Tool description changed | info |
| New required input param | breaking |
| New optional input param | info |
| Input param removed | breaking |
| Input param type changed | breaking |
| Optional input param became required | breaking |
| Required input param became optional | info (relaxation) |
| Output schema added/removed | info |
| Output param added | info |
| Output param removed | breaking |
| Output param type changed | breaking |

Input-side changes are stricter than output-side: the server actively
rejects bad input, but nothing forces a caller to read a field that
appears in the output schema, so a new output field can't break anyone.

## Running it

Needs Postgres and Redis. Easiest via Docker:

```bash
docker compose up -d
cp .env.example .env    # defaults already match docker-compose.yml
npm install
npm run build
npm start                # runs migrations, then listens on :3000
```

`npm run dev` runs the same thing with auto-reload via `tsx watch`.

## API

| Method | Path | Does |
|---|---|---|
| `GET` | `/servers` | List all watched servers |
| `POST` | `/servers` | Add a server: `{ name, url, transport, pollIntervalMs?, slackWebhookUrl? }` |
| `GET` | `/servers/:id` | Get one server |
| `PATCH` | `/servers/:id/enabled` | `{ enabled: boolean }` — also (un)schedules its polling job |
| `POST` | `/servers/:id/poll-now` | Queue an immediate poll, outside the regular schedule |
| `DELETE` | `/servers/:id` | Remove a server and unschedule it |
| `GET` | `/servers/:id/diffs` | Diff history, newest first |

`transport` is `"streamable-http"` or `"sse"`. `pollIntervalMs` defaults
to 300000 (5 minutes) and can't go below 10000.

```bash
curl -X POST localhost:3000/servers -H 'content-type: application/json' -d '{
  "name": "weather",
  "url": "https://example.com/mcp",
  "transport": "streamable-http",
  "pollIntervalMs": 60000,
  "slackWebhookUrl": "https://hooks.slack.com/services/..."
}'
```

If a server doesn't get its own `slackWebhookUrl`, breaking changes fall
back to the top-level `SLACK_WEBHOOK_URL` env var, if set. If neither is
set, breaking changes are still recorded in `schema_diffs` — you just
don't get paged.

## Tests

Repository tests hit a real local Postgres (not mocks) — needs its own
database so `npm test` doesn't truncate your dev data:

```bash
createdb mcp_schema_watch_test   # one-time setup, or via psql -c "CREATE DATABASE ..."
npm test                          # 41 tests
```

Set `TEST_DATABASE_URL` if your test database needs different
credentials than the default (`postgres://mcp_watch:devpassword@localhost:5432/mcp_schema_watch_test`).

## License

MIT
