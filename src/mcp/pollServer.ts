import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { ParamSchema, ToolDefinition, WatchedServerConfig } from "../types.js";

/**
 * This uses @modelcontextprotocol/sdk (v1.x) deliberately. As of writing,
 * the SDK repo's `main` branch has already moved to a v2 beta that splits
 * the unified package into separate `@modelcontextprotocol/client` and
 * `@modelcontextprotocol/server` packages (tracking the 2026-07-28 spec).
 * v1 remains Anthropic's supported production release and keeps getting
 * fixes for at least 6 months after v2 ships, so it's the right choice
 * for now. Swap this file when v2 stabilizes — and yes, that split is
 * exactly the kind of ecosystem change this tool exists to catch.
 */

function buildTransport(config: WatchedServerConfig): Transport {
  const url = new URL(config.url);

  if (config.transport === "sse") {
    return new SSEClientTransport(url);
  }

  // @ts-expect-error — StreamableHTTPClientTransport's `sessionId` is a
  // getter typed `string | undefined`, which exactOptionalPropertyTypes
  // treats as incompatible with Transport's `sessionId?: string`. Real
  // interaction between our stricter tsconfig and the SDK's own types,
  // not a bug in either — the class implements Transport correctly at
  // runtime. SSEClientTransport has no sessionId field, so only this
  // branch is affected. Re-check when bumping @modelcontextprotocol/sdk.
  return new StreamableHTTPClientTransport(url);
}

/**
 * Rebuilds a schema object field-by-field instead of passing the SDK's
 * object through directly. The SDK types `properties`/`required` as
 * `X | undefined` (present-but-possibly-undefined); our ParamSchema types
 * them as optional (present-or-absent) for exactOptionalPropertyTypes
 * compatibility. Only assigning a key when its value isn't undefined
 * satisfies both the compiler and the intent: no `properties: undefined`
 * ever ends up in a snapshot we hash and diff.
 */
function toParamSchema(schema: {
  type: "object";
  properties?: Record<string, object> | undefined;
  required?: string[] | undefined;
}): ParamSchema {
  const out: ParamSchema = { type: "object" };
  if (schema.properties !== undefined) out.properties = schema.properties;
  if (schema.required !== undefined) out.required = schema.required;
  return out;
}

/**
 * Connects to a live MCP server, fetches its current tool list, and
 * disconnects. Throws if the server is unreachable or doesn't speak MCP —
 * callers (the BullMQ processor) are expected to catch that and record it
 * as a poll failure rather than a schema change.
 */
export async function pollServerTools(config: WatchedServerConfig): Promise<ToolDefinition[]> {
  const client = new Client({ name: "mcp-schema-watch", version: "0.1.0" }, { capabilities: {} });
  const transport = buildTransport(config);

  try {
    await client.connect(transport);
    const result = await client.listTools();
    return result.tools.map((tool): ToolDefinition => {
      const mapped: ToolDefinition = {
        name: tool.name,
        inputSchema: toParamSchema(tool.inputSchema),
      };
      if (tool.description !== undefined) mapped.description = tool.description;
      if (tool.outputSchema !== undefined) mapped.outputSchema = toParamSchema(tool.outputSchema);
      return mapped;
    });
  } finally {
    await client.close();
  }
}
