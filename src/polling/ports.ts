import type { Change, ToolDefinition, WatchedServerConfig } from "../types.js";
import type { DiffRow, SnapshotRow } from "../db/rows.js";

export interface SnapshotsPort {
  latest(serverId: number): Promise<SnapshotRow | null>;
  insert(serverId: number, tools: ToolDefinition[], hash: string): Promise<SnapshotRow>;
}

export interface DiffsPort {
  insert(serverId: number, fromSnapshotId: number | null, toSnapshotId: number, changes: Change[]): Promise<DiffRow>;
}

export interface PollFailuresPort {
  insert(serverId: number, errorMessage: string): Promise<unknown>;
}

export type Poller = (config: WatchedServerConfig) => Promise<ToolDefinition[]>;

export type BreakingAlertHandler = (
  server: WatchedServerConfig,
  breakingChanges: Change[]
) => Promise<void>;
