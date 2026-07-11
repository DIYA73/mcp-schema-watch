import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { diffTools } from "../src/diff/diffTools.js";
import type { ToolDefinition, ChangeType } from "../src/types.js";

const here = dirname(fileURLToPath(import.meta.url));
const loadFixture = (name: string): ToolDefinition[] =>
  JSON.parse(readFileSync(join(here, "fixtures", name), "utf8"));

function byType(changes: { type: ChangeType }[], type: ChangeType) {
  return changes.filter((c) => c.type === type);
}

test("identical snapshots produce zero changes", () => {
  const tools = loadFixture("weather-v1.json");
  assert.deepEqual(diffTools(tools, tools), []);
});

test("a removed tool is reported as breaking", () => {
  const before: ToolDefinition[] = [{ name: "a", inputSchema: { type: "object" } }];
  const changes = diffTools(before, []);
  assert.equal(changes.length, 1);
  assert.equal(changes[0]?.type, "tool-removed");
  assert.equal(changes[0]?.severity, "breaking");
});

test("a new tool is reported as info, not breaking", () => {
  const after: ToolDefinition[] = [{ name: "a", inputSchema: { type: "object" } }];
  const changes = diffTools([], after);
  assert.equal(changes.length, 1);
  assert.equal(changes[0]?.type, "tool-added");
  assert.equal(changes[0]?.severity, "info");
});

test("a new required input param is breaking", () => {
  const before: ToolDefinition[] = [
    { name: "a", inputSchema: { type: "object", properties: {}, required: [] } },
  ];
  const after: ToolDefinition[] = [
    {
      name: "a",
      inputSchema: { type: "object", properties: { x: { type: "string" } }, required: ["x"] },
    },
  ];
  const changes = diffTools(before, after);
  assert.equal(changes.length, 1);
  assert.equal(changes[0]?.type, "input-param-added");
  assert.equal(changes[0]?.severity, "breaking");
});

test("a new optional input param is info", () => {
  const before: ToolDefinition[] = [
    { name: "a", inputSchema: { type: "object", properties: {}, required: [] } },
  ];
  const after: ToolDefinition[] = [
    { name: "a", inputSchema: { type: "object", properties: { x: { type: "string" } } } },
  ];
  const changes = diffTools(before, after);
  assert.equal(changes.length, 1);
  assert.equal(changes[0]?.type, "input-param-added");
  assert.equal(changes[0]?.severity, "info");
});

test("removing an input param is always breaking, even if it was optional", () => {
  const before: ToolDefinition[] = [
    { name: "a", inputSchema: { type: "object", properties: { x: { type: "string" } } } },
  ];
  const after: ToolDefinition[] = [{ name: "a", inputSchema: { type: "object", properties: {} } }];
  const changes = diffTools(before, after);
  assert.equal(changes.length, 1);
  assert.equal(changes[0]?.type, "input-param-removed");
  assert.equal(changes[0]?.severity, "breaking");
});

test("a param type change is breaking", () => {
  const before: ToolDefinition[] = [
    { name: "a", inputSchema: { type: "object", properties: { x: { type: "string" } } } },
  ];
  const after: ToolDefinition[] = [
    { name: "a", inputSchema: { type: "object", properties: { x: { type: "number" } } } },
  ];
  const changes = diffTools(before, after);
  assert.equal(changes.length, 1);
  assert.equal(changes[0]?.type, "input-param-type-changed");
  assert.equal(changes[0]?.severity, "breaking");
});

test("an optional param becoming required is breaking", () => {
  const before: ToolDefinition[] = [
    { name: "a", inputSchema: { type: "object", properties: { x: { type: "string" } }, required: [] } },
  ];
  const after: ToolDefinition[] = [
    { name: "a", inputSchema: { type: "object", properties: { x: { type: "string" } }, required: ["x"] } },
  ];
  const changes = diffTools(before, after);
  assert.equal(changes.length, 1);
  assert.equal(changes[0]?.type, "input-param-became-required");
  assert.equal(changes[0]?.severity, "breaking");
});

test("a required param becoming optional is info, not breaking (it's a relaxation)", () => {
  const before: ToolDefinition[] = [
    { name: "a", inputSchema: { type: "object", properties: { x: { type: "string" } }, required: ["x"] } },
  ];
  const after: ToolDefinition[] = [
    { name: "a", inputSchema: { type: "object", properties: { x: { type: "string" } }, required: [] } },
  ];
  const changes = diffTools(before, after);
  assert.equal(changes.length, 1);
  assert.equal(changes[0]?.type, "input-param-became-optional");
  assert.equal(changes[0]?.severity, "info");
});

test("output schema changes are generally softer than input: new output param is info even if 'required'", () => {
  const before: ToolDefinition[] = [{ name: "a", inputSchema: { type: "object" } }];
  const after: ToolDefinition[] = [
    {
      name: "a",
      inputSchema: { type: "object" },
      outputSchema: { type: "object", properties: { y: { type: "string" } }, required: ["y"] },
    },
  ];
  const changes = diffTools(before, after);
  assert.equal(changes.length, 1);
  assert.equal(changes[0]?.type, "output-schema-added");
  assert.equal(changes[0]?.severity, "info");
});

test("removing an output param is still breaking (readers of the old field break)", () => {
  const before: ToolDefinition[] = [
    { name: "a", inputSchema: { type: "object" }, outputSchema: { type: "object", properties: { y: { type: "string" } } } },
  ];
  const after: ToolDefinition[] = [
    { name: "a", inputSchema: { type: "object" }, outputSchema: { type: "object", properties: {} } },
  ];
  const changes = diffTools(before, after);
  assert.equal(changes.length, 1);
  assert.equal(changes[0]?.type, "output-param-removed");
  assert.equal(changes[0]?.severity, "breaking");
});

test("a description-only change is info", () => {
  const before: ToolDefinition[] = [{ name: "a", description: "old", inputSchema: { type: "object" } }];
  const after: ToolDefinition[] = [{ name: "a", description: "new", inputSchema: { type: "object" } }];
  const changes = diffTools(before, after);
  assert.equal(changes.length, 1);
  assert.equal(changes[0]?.type, "tool-description-changed");
  assert.equal(changes[0]?.severity, "info");
});

test("realistic mixed snapshot: counts breaking vs info correctly", () => {
  const v1 = loadFixture("weather-v1.json");
  const v2 = loadFixture("weather-v2.json");
  const changes = diffTools(v1, v2);

  const breaking = changes.filter((c) => c.severity === "breaking");
  const info = changes.filter((c) => c.severity === "info");

  // Breaking: days type change, units required-add, get_alerts removed, highTemp output removed
  assert.equal(breaking.length, 4);
  // Info: get_radar_map added, conditions output added
  assert.equal(info.length, 2);

  assert.equal(byType(changes, "tool-removed")[0]?.toolName, "get_alerts");
  assert.equal(byType(changes, "tool-added")[0]?.toolName, "get_radar_map");
  assert.ok(byType(changes, "input-param-type-changed").some((c) => c.paramName === "days"));
  assert.ok(byType(changes, "input-param-added").some((c) => c.paramName === "units" && c.severity === "breaking"));
});
