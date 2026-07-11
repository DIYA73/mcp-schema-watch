import { z } from "zod";

export const createWatchedServerSchema = z.object({
  name: z.string().min(1).max(200),
  url: z.string().url(),
  transport: z.enum(["streamable-http", "sse"]),
  pollIntervalMs: z.number().int().min(10_000).optional(),
  slackWebhookUrl: z.string().url().optional(),
});

export type CreateWatchedServerBody = z.infer<typeof createWatchedServerSchema>;

export const setEnabledSchema = z.object({
  enabled: z.boolean(),
});

export type SetEnabledBody = z.infer<typeof setEnabledSchema>;
