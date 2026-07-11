import type { Change, ToolDefinition, TransportKind } from "../types.js";

export interface WatchedServerRow {
  id: number;
  name: string;
  url: string;
  transport: TransportKind;
  pollIntervalMs: number;
  enabled: boolean;
  slackWebhookUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateWatchedServerInput {
  name: string;
  url: string;
  transport: TransportKind;
  pollIntervalMs?: number | undefined;
  slackWebhookUrl?: string | undefined;
}

export interface SnapshotRow {
  id: number;
  serverId: number;
  tools: ToolDefinition[];
  hash: string;
  capturedAt: Date;
}

export interface DiffRow {
  id: number;
  serverId: number;
  fromSnapshotId: number | null;
  toSnapshotId: number;
  changes: Change[];
  breakingCount: number;
  infoCount: number;
  createdAt: Date;
}

export interface PollFailureRow {
  id: number;
  serverId: number;
  errorMessage: string;
  occurredAt: Date;
}
