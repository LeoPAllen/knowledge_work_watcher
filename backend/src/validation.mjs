import { z } from "zod";
import {
  SCHEMA_VERSION,
  validateEvent,
} from "../../extension/src/shared/event-schema.mjs";

const eventSchema = z
  .strictObject({
    event_id: z.string().min(1),
    schema_version: z.literal(SCHEMA_VERSION),
    event_type: z.string().min(1),
    created_at: z.string().min(1),
    participant_id_hash: z.string().nullable(),
    session_id: z.string().nullable(),
    extension_version: z.string().min(1),
    capture_mode: z.string().min(1),
    source: z.string().min(1),
    payload: z.record(z.string(), z.unknown()),
  })
  .superRefine((event, context) => {
    const result = validateEvent(event);
    for (const error of result.errors) {
      context.addIssue({
        code: "custom",
        message: error,
      });
    }
  });

const batchSchema = z.strictObject({
  events: z.array(z.unknown()).min(1).max(500),
});

function safeIssues(error) {
  return error.issues.map((issue) => ({
    path: issue.path.join(".") || "event",
    message: issue.message,
  }));
}

export function validateIngestEvent(input) {
  const result = eventSchema.safeParse(input);
  return result.success
    ? { valid: true, event: result.data, errors: [] }
    : { valid: false, event: null, errors: safeIssues(result.error) };
}

export function validateBatchEnvelope(input) {
  const result = batchSchema.safeParse(input);
  return result.success
    ? { valid: true, events: result.data.events, errors: [] }
    : { valid: false, events: [], errors: safeIssues(result.error) };
}
