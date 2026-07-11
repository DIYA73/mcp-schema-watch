import { diffTools } from "../diff/diffTools.js";
import { hashTools } from "../diff/normalize.js";
import type { Change, WatchedServerConfig } from "../types.js";
import type { BreakingAlertHandler, DiffsPort, PollFailuresPort, Poller, SnapshotsPort } from "./ports.js";

export type PollOutcome =
  | { status: "unchanged" }
  | { status: "first-snapshot" }
  | { status: "changed"; changes: Change[]; breakingCount: number }
  | { status: "failed"; error: string };

export interface PollAndRecordDeps {
  poll: Poller;
  snapshots: SnapshotsPort;
  diffs: DiffsPort;
  pollFailures: PollFailuresPort;
  onBreakingChanges?: BreakingAlertHandler;
}

/**
 * One full poll cycle for a single server: fetch its current tools, compare
 * against the last stored snapshot, persist a new snapshot only if the hash
 * actually changed, and — only for genuinely breaking changes — fire the
 * alert handler. A poll failure (server unreachable, bad response, etc.) is
 * recorded and returned as a distinct outcome rather than thrown, so a
 * caller polling many servers in a loop doesn't need its own try/catch
 * around every call.
 */
export async function pollAndRecordServer(
  server: WatchedServerConfig & { id: number },
  deps: PollAndRecordDeps
): Promise<PollOutcome> {
  let tools;
  try {
    tools = await deps.poll(server);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await deps.pollFailures.insert(server.id, message);
    return { status: "failed", error: message };
  }

  const hash = hashTools(tools);
  const latest = await deps.snapshots.latest(server.id);

  if (latest && latest.hash === hash) {
    return { status: "unchanged" };
  }

  const snapshot = await deps.snapshots.insert(server.id, tools, hash);

  if (!latest) {
    return { status: "first-snapshot" };
  }

  const changes = diffTools(latest.tools, tools);
  if (changes.length === 0) {
    // Hash differed (e.g. non-deterministic field we don't normalize for)
    // but the diff engine sees no meaningful change — nothing to record.
    return { status: "unchanged" };
  }

  await deps.diffs.insert(server.id, latest.id, snapshot.id, changes);

  const breaking = changes.filter((c) => c.severity === "breaking");
  if (breaking.length > 0 && deps.onBreakingChanges) {
    await deps.onBreakingChanges(server, breaking);
  }

  return { status: "changed", changes, breakingCount: breaking.length };
}
