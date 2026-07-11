import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import type { Pool } from "pg";
import { createTestPool, truncateAll } from "./testDb.js";
import { WatchedServersRepo } from "../../src/db/watchedServers.repo.js";
import { SnapshotsRepo } from "../../src/db/snapshots.repo.js";
import { DiffsRepo } from "../../src/db/diffs.repo.js";
import type { Change, ToolDefinition } from "../../src/types.js";

let pool: Pool;
let servers: WatchedServersRepo;
let snapshots: SnapshotsRepo;
let repo: DiffsRepo;
let serverId: number;
let fromId: number;
let toId: number;

const tools: ToolDefinition[] = [{ name: "a", inputSchema: { type: "object" } }];

const changes: Change[] = [
  { type: "tool-removed", toolName: "get_alerts", detail: "gone", severity: "breaking" },
  { type: "tool-added", toolName: "get_radar_map", detail: "new", severity: "info" },
];

before(async () => {
  pool = await createTestPool();
  servers = new WatchedServersRepo(pool);
  snapshots = new SnapshotsRepo(pool);
  repo = new DiffsRepo(pool);
});

beforeEach(async () => {
  await truncateAll(pool);
  const server = await servers.create({ name: "weather", url: "https://example.com/mcp", transport: "streamable-http" });
  serverId = server.id;
  fromId = (await snapshots.insert(serverId, tools, "hash-1")).id;
  toId = (await snapshots.insert(serverId, tools, "hash-2")).id;
});

after(async () => {
  await pool.end();
});

test("insert() computes breaking/info counts from the changes array", async () => {
  const diff = await repo.insert(serverId, fromId, toId, changes);
  assert.equal(diff.breakingCount, 1);
  assert.equal(diff.infoCount, 1);
  assert.deepEqual(diff.changes, changes);
});

test("insert() accepts a null fromSnapshotId for a server's first-ever diff", async () => {
  const diff = await repo.insert(serverId, null, toId, changes);
  assert.equal(diff.fromSnapshotId, null);
});

test("listForServer() returns newest first", async () => {
  await repo.insert(serverId, fromId, toId, changes);
  await new Promise((r) => setTimeout(r, 10));
  const second = await repo.insert(serverId, fromId, toId, changes);
  const list = await repo.listForServer(serverId);
  assert.equal(list[0]?.id, second.id);
});

test("listBreakingSince() only returns diffs with at least one breaking change", async () => {
  await repo.insert(serverId, fromId, toId, [{ type: "tool-added", toolName: "x", detail: "y", severity: "info" }]);
  await repo.insert(serverId, fromId, toId, changes); // has 1 breaking
  const since = new Date(Date.now() - 60_000);
  const breaking = await repo.listBreakingSince(serverId, since);
  assert.equal(breaking.length, 1);
  assert.ok(breaking[0]!.breakingCount > 0);
});
