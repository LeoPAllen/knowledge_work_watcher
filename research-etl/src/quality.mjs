import { EVENT_TYPES, SCHEMA_VERSION, validateEvent } from "../../extension/src/shared/event-schema.mjs";

const SECRET =
  /\b(?:api[_-]?key|password|passwd|secret|token)\s*[:=]\s*\S+|\bsk-[a-z0-9_-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----/i;
const RAW_URL_FIELD = /(^|_)(url|href|referrer)$/i;

function isIsoTimestamp(value) {
  return (
    typeof value === "string" &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}

function findUnsafeField(value, path = "payload") {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findUnsafeField(value[index], `${path}.${index}`);
      if (found) {
        return found;
      }
    }
    return null;
  }
  if (typeof value !== "object" || value === null) {
    return null;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (RAW_URL_FIELD.test(key) || key.toLowerCase() === "title") {
      return `${path}.${key}`;
    }
    const found = findUnsafeField(nested, `${path}.${key}`);
    if (found) {
      return found;
    }
  }
  return null;
}

export function validateRecords(records) {
  const eventIds = new Set();
  const eventTypeCounts = Object.fromEntries(
    EVENT_TYPES.map((eventType) => [eventType, 0]),
  );
  const warnings = [];

  for (const record of records) {
    const { event } = record;
    if (event?.schema_version !== SCHEMA_VERSION) {
      throw new TypeError(
        `Unsupported schema version for ${event?.event_id ?? "unknown event"}`,
      );
    }
    const validation = validateEvent(event);
    if (!validation.valid) {
      throw new TypeError(
        `Invalid event ${event?.event_id ?? "unknown"}: ${validation.errors.join("; ")}`,
      );
    }
    if (eventIds.has(event.event_id)) {
      throw new TypeError(`Duplicate event_id: ${event.event_id}`);
    }
    eventIds.add(event.event_id);
    if (!isIsoTimestamp(event.created_at)) {
      throw new TypeError(`Invalid created_at: ${event.event_id}`);
    }
    if (record.received_at !== null && !isIsoTimestamp(record.received_at)) {
      throw new TypeError(`Invalid received_at: ${event.event_id}`);
    }
    if (
      event.event_type === "capture_skipped" &&
      ["denied", "private_or_sensitive"].includes(
        event.payload.classification,
      )
    ) {
      const unsafeField = findUnsafeField(event.payload);
      if (unsafeField) {
        throw new TypeError(
          `Denied/private event contains unsafe field ${unsafeField}`,
        );
      }
    }
    eventTypeCounts[event.event_type] += 1;
    if (event.participant_id_hash === null) {
      warnings.push(`missing participant hash: ${event.event_id}`);
    }
    if (event.session_id === null) {
      warnings.push(`missing session ID: ${event.event_id}`);
    }
  }

  const missingEventTypes = Object.entries(eventTypeCounts)
    .filter(([, count]) => count === 0)
    .map(([eventType]) => eventType);
  return { eventTypeCounts, missingEventTypes, warnings };
}

export function assertSafeOutputs(tables) {
  for (const [tableName, table] of Object.entries(tables)) {
    for (const row of table.rows) {
      for (const [column, value] of Object.entries(row)) {
        if (typeof value === "string" && SECRET.test(value)) {
          throw new TypeError(
            `Secret-like value in ${tableName}.${column}`,
          );
        }
      }
    }
  }
}
