import { z } from "zod";

export const isoUtcString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/, "ts must be ISO-8601 with Z");

export const phoneSchema = z
  .string()
  .regex(/^\+\d+$/, "must start with + followed by digits");

export const webhookMessageSchema = z.object({
  message_id: z.string().min(1, "message_id required"),
  from: phoneSchema,
  to: phoneSchema,
  ts: isoUtcString,
  text: z.string().max(4096).optional(),
});

export type WebhookMessage = z.infer<typeof webhookMessageSchema>;

export type StoredMessage = WebhookMessage & { created_at: string };

