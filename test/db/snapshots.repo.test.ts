import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import type { Pool } from "pg";
import { createTestPool, truncateAll } from "./testDb.js";
import { WatchedServersRepo } from "../../src/db/watchedServers.repo.js";
import { SnapshotsRepo } from "../../src/db/snapshots.repo.js";
import type { ToolDefinition } from "../../src/types.js";

let pool: Pool;
let servers: WatchedServersRepo;
let repo: SnapshotsRepo;
let serverId: number;

const sampleTools: ToolDefinition[] = [
  {
    name: "get_forecast",
    description: "Get the forecast.",
    inputSchema: { type: "object", properties: { location: { type: "string" } }, required: ["location"] },
  },
];

before(async () => {
  pool = await createTestPool();
  servers = new WatchedServersRepo(pool);
  repo = new SnapshotsRepo(pool);
});

beforeEach(async () => {
  await truncateAll(pool);
  const server = await servers.create({ name: "weather", url: "https://example.com/mcp", transport: "streamable-http" });
  serverId = server.id;
});

after(async () => {
  await pool.end();
});

test("insert() round-trips tools through JSONB exactly", async () => {
  const snapshot = await repo.insert(serverId, sampleTools, "hash-1");
  assert.deepEqual(snapshot.tools, sampleTools);
  assert.equal(snapshot.hash, "hash-1");
});

test("latest() returns null when no snapshot exists yet", async () => {
  assert.equal(await repo.latest(serverId), null);
});

test("latest() returns the most recently captured snapshot", async () => {
  await repo.insert(serverId, sampleTools, "hash-1");
  await new Promise((r) => setTimeout(r, 10)); // ensure captured_at ordering is unambiguous
  const second = await repo.insert(serverId, sampleTools, "hash-2");
  const latest = await repo.latest(serverId);
  assert.equal(latest?.id, second.id);
  assert.equal(latest?.hash, "hash-2");
});

test("listForServer() returns newest first", async () => {
  await repo.insert(serverId, sampleTools, "hash-1");
  await new Promise((r) => setTimeout(r, 10));
  await repo.insert(serverId, sampleTools, "hash-2");
  const list = await repo.listForServer(serverId);
  assert.deepEqual(list.map((s) => s.hash), ["hash-2", "hash-1"]);
});
