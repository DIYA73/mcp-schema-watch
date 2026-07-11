import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import type { Pool } from "pg";
import { createTestPool, truncateAll } from "./testDb.js";
import { WatchedServersRepo } from "../../src/db/watchedServers.repo.js";

let pool: Pool;
let repo: WatchedServersRepo;

before(async () => {
  pool = await createTestPool();
  repo = new WatchedServersRepo(pool);
});

beforeEach(async () => {
  await truncateAll(pool);
});

after(async () => {
  await pool.end();
});

test("create() persists and returns the row with defaults applied", async () => {
  const server = await repo.create({ name: "weather", url: "https://example.com/mcp", transport: "streamable-http" });
  assert.equal(server.name, "weather");
  assert.equal(server.pollIntervalMs, 300_000); // schema default
  assert.equal(server.enabled, true);
  assert.equal(server.slackWebhookUrl, null);
  assert.ok(server.id > 0);
});

test("create() respects an explicit pollIntervalMs and slackWebhookUrl", async () => {
  const server = await repo.create({
    name: "weather",
    url: "https://example.com/mcp",
    transport: "sse",
    pollIntervalMs: 60_000,
    slackWebhookUrl: "https://hooks.slack.com/services/x",
  });
  assert.equal(server.pollIntervalMs, 60_000);
  assert.equal(server.slackWebhookUrl, "https://hooks.slack.com/services/x");
});

test("name must be unique", async () => {
  await repo.create({ name: "weather", url: "https://a.example.com/mcp", transport: "streamable-http" });
  await assert.rejects(() => repo.create({ name: "weather", url: "https://b.example.com/mcp", transport: "streamable-http" }));
});

test("list() returns all servers sorted by name", async () => {
  await repo.create({ name: "zebra", url: "https://z.example.com/mcp", transport: "streamable-http" });
  await repo.create({ name: "apple", url: "https://a.example.com/mcp", transport: "streamable-http" });
  const servers = await repo.list();
  assert.deepEqual(servers.map((s) => s.name), ["apple", "zebra"]);
});

test("listEnabled() excludes disabled servers", async () => {
  const a = await repo.create({ name: "a", url: "https://a.example.com/mcp", transport: "streamable-http" });
  await repo.create({ name: "b", url: "https://b.example.com/mcp", transport: "streamable-http" });
  await repo.setEnabled(a.id, false);
  const enabled = await repo.listEnabled();
  assert.deepEqual(enabled.map((s) => s.name), ["b"]);
});

test("findById() returns null for a missing id", async () => {
  assert.equal(await repo.findById(999999), null);
});

test("findByName() finds an existing server", async () => {
  await repo.create({ name: "weather", url: "https://example.com/mcp", transport: "streamable-http" });
  const found = await repo.findByName("weather");
  assert.equal(found?.name, "weather");
});

test("delete() removes the row", async () => {
  const server = await repo.create({ name: "weather", url: "https://example.com/mcp", transport: "streamable-http" });
  await repo.delete(server.id);
  assert.equal(await repo.findById(server.id), null);
});
