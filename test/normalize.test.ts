import { test } from "node:test";
import assert from "node:assert/strict";
import { hashTools, normalizeTools, stableStringify } from "../src/diff/normalize.js";
import type { ToolDefinition } from "../src/types.js";

test("stableStringify produces identical output regardless of key order", () => {
  const a = { b: 1, a: 2 };
  const b = { a: 2, b: 1 };
  assert.equal(stableStringify(a), stableStringify(b));
});

test("normalizeTools sorts by name regardless of input order", () => {
  const tools: ToolDefinition[] = [
    { name: "zebra", inputSchema: { type: "object" } },
    { name: "apple", inputSchema: { type: "object" } },
  ];
  const sorted = normalizeTools(tools);
  assert.deepEqual(sorted.map((t) => t.name), ["apple", "zebra"]);
});

test("hashTools is identical for the same tools listed in a different order", () => {
  const a: ToolDefinition[] = [
    { name: "b", inputSchema: { type: "object", properties: { x: { type: "string" } } } },
    { name: "a", inputSchema: { type: "object" } },
  ];
  const b: ToolDefinition[] = [
    { name: "a", inputSchema: { type: "object" } },
    { name: "b", inputSchema: { type: "object", properties: { x: { type: "string" } } } },
  ];
  assert.equal(hashTools(a), hashTools(b));
});

test("hashTools changes when a schema actually changes", () => {
  const a: ToolDefinition[] = [{ name: "a", inputSchema: { type: "object", properties: {} } }];
  const b: ToolDefinition[] = [
    { name: "a", inputSchema: { type: "object", properties: { x: { type: "string" } } } },
  ];
  assert.notEqual(hashTools(a), hashTools(b));
});
