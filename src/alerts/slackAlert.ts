import type { Change, WatchedServerConfig } from "../types.js";

/**
 * Posts a Slack incoming-webhook message summarizing breaking changes for
 * one server. Deliberately only called for breaking changes — info-level
 * changes (new tools, relaxed requirements) don't page anyone.
 */
export async function sendSlackAlert(
  webhookUrl: string,
  server: Pick<WatchedServerConfig, "name" | "url">,
  breakingChanges: Change[]
): Promise<void> {
  if (breakingChanges.length === 0) return;

  const lines = breakingChanges
    .slice(0, 10)
    .map((c) => `• *${c.toolName}*${c.paramName ? `.${c.paramName}` : ""}: ${c.detail}`);
  const overflow = breakingChanges.length > 10 ? `\n…and ${breakingChanges.length - 10} more.` : "";

  const text = [
    `:rotating_light: *${breakingChanges.length} breaking change${breakingChanges.length === 1 ? "" : "s"}* detected on \`${server.name}\` (${server.url})`,
    ...lines,
  ].join("\n") + overflow;

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    throw new Error(`Slack webhook returned ${response.status}: ${await response.text()}`);
  }
}
