/**
 * Shape of a single tool as returned by an MCP server's `tools/list`.
 *
 * Verified against the actual `dist/esm/client/index.d.ts` inside the
 * published @modelcontextprotocol/sdk@1.29.0 package (not the SDK's public
 * docs, which move fast) — `inputSchema` is always present, `outputSchema`
 * is optional, and `type` is always the literal "object".
 */
export interface ParamSchema {
  type: "object";
  properties?: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
}

export interface ToolDefinition {
  name: string;
  description?: string;
  inputSchema: ParamSchema;
  outputSchema?: ParamSchema;
}

export type Severity = "breaking" | "info";

export type ChangeType =
  | "tool-added"
  | "tool-removed"
  | "tool-description-changed"
  | "input-param-added"
  | "input-param-removed"
  | "input-param-type-changed"
  | "input-param-became-required"
  | "input-param-became-optional"
  | "output-schema-added"
  | "output-schema-removed"
  | "output-param-added"
  | "output-param-removed"
  | "output-param-type-changed";

export interface Change {
  type: ChangeType;
  toolName: string;
  paramName?: string;
  detail: string;
  severity: Severity;
}

export type TransportKind = "streamable-http" | "sse";

export interface WatchedServerConfig {
  name: string;
  url: string;
  transport: TransportKind;
}

export interface DiffResult {
  serverName: string;
  changes: Change[];
  breakingCount: number;
  infoCount: number;
  checkedAt: string;
}
