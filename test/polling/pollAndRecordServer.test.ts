import { test } from "node:test";
import assert from "node:assert/strict";
import { pollAndRecordServer } from "../../src/polling/pollAndRecordServer.js";
import type { DiffsPort, PollFailuresPort, SnapshotsPort } from "../../src/polling/ports.js";
import type { Change, ToolDefinition, WatchedServerConfig } from "../../src/types.js";
import type { DiffRow, SnapshotRow } from "../../src/db/rows.js";
import { hashTools } from "../../src/diff/normalize.js";

function makeFakeSnapshots(initial?: SnapshotRow): SnapshotsPort & { inserted: SnapshotRow[] } {
  let current = initial ?? null;
  let nextId = (initial?.id ?? 0) + 1;
  const inserted: SnapshotRow[] = [];
  return {
    inserted,
    async latest() {
      return current;
    },
    async insert(serverId, tools, hash) {
      const row: SnapshotRow = { id: nextId++, serverId, tools, hash, capturedAt: new Date() };
      current = row;
      inserted.push(row);
      return row;
    },
  };
}

function makeFakeDiffs(): DiffsPort & { inserted: unknown[] } {
  const inserted: unknown[] = [];
  return {
    inserted,
    async insert(serverId, fromSnapshotId, toSnapshotId, changes) {
      const row: DiffRow = {
        id: inserted.length + 1,
        serverId,
        fromSnapshotId,
        toSnapshotId,
        changes,
        breakingCount: changes.filter((c) => c.severity === "breaking").length,
        infoCount: changes.filter((c) => c.severity === "info").length,
        createdAt: new Date(),
      };
      inserted.push(row);
      return row;
    },
  };
}

function makeFakePollFailures(): PollFailuresPort & { messages: string[] } {
  const messages: string[] = [];
  return {
    messages,
    async insert(_serverId, errorMessage) {
      messages.push(errorMessage);
      return undefined;
    },
  };
}

const server: WatchedServerConfig & { id: number } = {
  id: 1,
  name: "weather",
  url: "https://example.com/mcp",
  transport: "streamable-http",
};

const toolsV1: ToolDefinition[] = [{ name: "get_forecast", inputSchema: { type: "object" } }];
const toolsV2: ToolDefinition[] = [
  { name: "get_forecast", inputSchema: { type: "object" } },
  { name: "get_alerts", inputSchema: { type: "object" } },
];

test("first poll ever: records a snapshot but reports first-snapshot, not a diff", async () => {
  const snapshots = makeFakeSnapshots();
  const diffs = makeFakeDiffs();
  const pollFailures = makeFakePollFailures();

  const outcome = await pollAndRecordServer(server, {
    poll: async () => toolsV1,
    snapshots,
    diffs,
    pollFailures,
  });

  assert.equal(outcome.status, "first-snapshot");
  assert.equal(snapshots.inserted.length, 1);
  assert.equal(diffs.inserted.length, 0);
});

test("unchanged poll: no new snapshot, no diff", async () => {
  const existing: SnapshotRow = { id: 1, serverId: 1, tools: toolsV1, hash: hashTools(toolsV1), capturedAt: new Date() };
  const snapshots = makeFakeSnapshots(existing);
  const diffs = makeFakeDiffs();
  const pollFailures = makeFakePollFailures();

  const outcome = await pollAndRecordServer(server, {
    poll: async () => toolsV1,
    snapshots,
    diffs,
    pollFailures,
  });

  assert.equal(outcome.status, "unchanged");
  assert.equal(snapshots.inserted.length, 0);
  assert.equal(diffs.inserted.length, 0);
});

test("changed poll: records a new snapshot and a diff", async () => {
  const existing: SnapshotRow = { id: 1, serverId: 1, tools: toolsV1, hash: hashTools(toolsV1), capturedAt: new Date() };
  const snapshots = makeFakeSnapshots(existing);
  const diffs = makeFakeDiffs();
  const pollFailures = makeFakePollFailures();

  const outcome = await pollAndRecordServer(server, {
    poll: async () => toolsV2,
    snapshots,
    diffs,
    pollFailures,
  });

  assert.equal(outcome.status, "changed");
  assert.equal(snapshots.inserted.length, 1);
  assert.equal(diffs.inserted.length, 1);
});

test("breaking changes trigger the alert handler; info-only changes don't", async () => {
  const existing: SnapshotRow = { id: 1, serverId: 1, tools: toolsV2, hash: hashTools(toolsV2), capturedAt: new Date() };
  const snapshots = makeFakeSnapshots(existing);
  const diffs = makeFakeDiffs();
  const pollFailures = makeFakePollFailures();

  let alerted: Change[] | null = null;

  // toolsV1 relative to toolsV2 = get_alerts removed = breaking.
  await pollAndRecordServer(server, {
    poll: async () => toolsV1,
    snapshots,
    diffs,
    pollFailures,
    onBreakingChanges: async (_srv, changes) => {
      alerted = changes;
    },
  });

  assert.ok(alerted !== null);
  assert.ok((alerted as Change[]).every((c) => c.severity === "breaking"));
});

test("a poll failure is recorded, not thrown, and returns status 'failed'", async () => {
  const snapshots = makeFakeSnapshots();
  const diffs = makeFakeDiffs();
  const pollFailures = makeFakePollFailures();

  const outcome = await pollAndRecordServer(server, {
    poll: async () => {
      throw new Error("ECONNREFUSED");
    },
    snapshots,
    diffs,
    pollFailures,
  });

  assert.equal(outcome.status, "failed");
  assert.deepEqual(pollFailures.messages, ["ECONNREFUSED"]);
  assert.equal(snapshots.inserted.length, 0);
});
