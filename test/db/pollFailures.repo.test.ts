import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import type { Pool } from "pg";
import { createTestPool, truncateAll } from "./testDb.js";
import { WatchedServersRepo } from "../../src/db/watchedServers.repo.js";
import { PollFailuresRepo } from "../../src/db/pollFailures.repo.js";

let pool: Pool;
let servers: WatchedServersRepo;
let repo: PollFailuresRepo;
let serverId: number;

before(async () => {
  pool = await createTestPool();
  servers = new WatchedServersRepo(pool);
  repo = new PollFailuresRepo(pool);
});

beforeEach(async () => {
  await truncateAll(pool);
  const server = await servers.create({ name: "weather", url: "https://example.com/mcp", transport: "streamable-http" });
  serverId = server.id;
});

after(async () => {
  await pool.end();
});

test("insert() records the error message", async () => {
  const failure = await repo.insert(serverId, "ECONNREFUSED");
  assert.equal(failure.errorMessage, "ECONNREFUSED");
});

test("listForServer() returns newest first", async () => {
  await repo.insert(serverId, "first failure");
  await new Promise((r) => setTimeout(r, 10));
  await repo.insert(serverId, "second failure");
  const list = await repo.listForServer(serverId);
  assert.deepEqual(list.map((f) => f.errorMessage), ["second failure", "first failure"]);
});

test("deleting a server cascades to its poll failures", async () => {
  await repo.insert(serverId, "boom");
  await servers.delete(serverId);
  const list = await repo.listForServer(serverId);
  assert.deepEqual(list, []);
});
