import { createHash } from "node:crypto";
import type { ToolDefinition } from "../types.js";

/**
 * Deterministically stringifies a value by sorting object keys recursively.
 *
 * Needed because two structurally-identical `tools/list` responses can
 * arrive with keys in different orders — JSON key order isn't guaranteed
 * by every server or serializer — which would otherwise hash differently
 * despite being semantically identical, producing a false-positive diff.
 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

/**
 * Sorts tools by name so hash comparisons aren't sensitive to a server
 * changing the order it lists tools in between polls.
 */
export function normalizeTools(tools: ToolDefinition[]): ToolDefinition[] {
  return [...tools].sort((a, b) => a.name.localeCompare(b.name));
}

/** Cheap fingerprint used to skip a full diff when nothing changed at all. */
export function hashTools(tools: ToolDefinition[]): string {
  return createHash("sha256").update(stableStringify(normalizeTools(tools))).digest("hex");
}
