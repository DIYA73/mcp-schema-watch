import type { Change, ChangeType, ParamSchema, ToolDefinition } from "../types.js";

function paramType(schema: unknown): string {
  if (schema !== null && typeof schema === "object" && "type" in schema) {
    const t = (schema as { type?: unknown }).type;
    return typeof t === "string" ? t : "unknown";
  }
  return "unknown";
}

/**
 * Diffs one side of a tool's schema (input or output) parameter-by-parameter.
 *
 * Severity rules (input side is the contract callers must satisfy, output
 * side is what callers parse back — both can break a caller, but input
 * changes are stricter since the server actively rejects bad input):
 *   - new required param, or param removed, or param type changed → breaking
 *   - new optional param, or required param loosened to optional → info
 *   - whole schema appearing where none existed → breaking for input
 *     (callers now need to send something new to succeed) and info for
 *     output (nothing forces you to read the new field)
 *   - whole schema disappearing → breaking for input, info for output
 */
function diffParamSchema(
  toolName: string,
  side: "input" | "output",
  before: ParamSchema | undefined,
  after: ParamSchema | undefined
): Change[] {
  const changes: Change[] = [];
  const label = side === "input" ? "Input" : "Output";
  const schemaAddedType: ChangeType = side === "input" ? "input-param-added" : "output-schema-added";
  const schemaRemovedType: ChangeType = side === "input" ? "input-param-removed" : "output-schema-removed";

  if (!before && after) {
    changes.push({
      type: schemaAddedType,
      toolName,
      detail: `${label} schema was added where none existed before.`,
      severity: side === "input" ? "breaking" : "info",
    });
    return changes;
  }
  if (before && !after) {
    changes.push({
      type: schemaRemovedType,
      toolName,
      detail: `${label} schema was removed entirely.`,
      severity: side === "input" ? "breaking" : "info",
    });
    return changes;
  }
  if (!before || !after) return changes;

  const beforeProps = before.properties ?? {};
  const afterProps = after.properties ?? {};
  const beforeRequired = new Set(before.required ?? []);
  const afterRequired = new Set(after.required ?? []);
  const allParamNames = new Set([...Object.keys(beforeProps), ...Object.keys(afterProps)]);

  for (const paramName of allParamNames) {
    const wasPresent = paramName in beforeProps;
    const isPresent = paramName in afterProps;

    if (!wasPresent && isPresent) {
      const nowRequired = afterRequired.has(paramName);
      changes.push({
        type: side === "input" ? "input-param-added" : "output-param-added",
        toolName,
        paramName,
        detail: `New ${side} parameter "${paramName}" was added${nowRequired ? " and is required" : ""}.`,
        severity: side === "input" && nowRequired ? "breaking" : "info",
      });
      continue;
    }

    if (wasPresent && !isPresent) {
      changes.push({
        type: side === "input" ? "input-param-removed" : "output-param-removed",
        toolName,
        paramName,
        detail: `${label} parameter "${paramName}" was removed.`,
        severity: "breaking",
      });
      continue;
    }

    const beforeType = paramType(beforeProps[paramName]);
    const afterType = paramType(afterProps[paramName]);
    if (beforeType !== afterType) {
      changes.push({
        type: side === "input" ? "input-param-type-changed" : "output-param-type-changed",
        toolName,
        paramName,
        detail: `Parameter "${paramName}" changed type from "${beforeType}" to "${afterType}".`,
        severity: "breaking",
      });
    }

    if (side === "input") {
      const wasRequired = beforeRequired.has(paramName);
      const isRequired = afterRequired.has(paramName);
      if (!wasRequired && isRequired) {
        changes.push({
          type: "input-param-became-required",
          toolName,
          paramName,
          detail: `Parameter "${paramName}" is now required (was optional).`,
          severity: "breaking",
        });
      } else if (wasRequired && !isRequired) {
        changes.push({
          type: "input-param-became-optional",
          toolName,
          paramName,
          detail: `Parameter "${paramName}" is now optional (was required).`,
          severity: "info",
        });
      }
    }
  }

  return changes;
}

/**
 * Diffs two `tools/list` snapshots and returns every detected change,
 * each tagged with a severity. Pure function — no I/O, so it's safe to
 * unit test with plain fixture JSON and safe to run in a hot loop across
 * many watched servers.
 */
export function diffTools(previous: ToolDefinition[], current: ToolDefinition[]): Change[] {
  const changes: Change[] = [];
  const prevByName = new Map(previous.map((t) => [t.name, t]));
  const currByName = new Map(current.map((t) => [t.name, t]));
  const allNames = new Set([...prevByName.keys(), ...currByName.keys()]);

  for (const name of allNames) {
    const before = prevByName.get(name);
    const after = currByName.get(name);

    if (!before && after) {
      changes.push({
        type: "tool-added",
        toolName: name,
        detail: `New tool "${name}" is now available.`,
        severity: "info",
      });
      continue;
    }

    if (before && !after) {
      changes.push({
        type: "tool-removed",
        toolName: name,
        detail: `Tool "${name}" is no longer available. Any code calling it will now fail.`,
        severity: "breaking",
      });
      continue;
    }

    if (!before || !after) continue;

    if ((before.description ?? "") !== (after.description ?? "")) {
      changes.push({
        type: "tool-description-changed",
        toolName: name,
        detail: "Description text changed. Behavior may or may not have changed — worth a manual look.",
        severity: "info",
      });
    }

    changes.push(...diffParamSchema(name, "input", before.inputSchema, after.inputSchema));
    changes.push(...diffParamSchema(name, "output", before.outputSchema, after.outputSchema));
  }

  return changes;
}
