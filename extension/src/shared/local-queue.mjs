import { validateEvent } from "./event-schema.mjs";

export const DEFAULT_QUEUE_LIMIT = 500;

function validateStoredEvents(events) {
  if (!Array.isArray(events)) {
    throw new TypeError("Stored queue must be an array");
  }

  for (const event of events) {
    const validation = validateEvent(event);
    if (!validation.valid) {
      throw new TypeError("Stored queue contains an invalid event");
    }
  }

  return events;
}

export function createLocalQueue(
  storage,
  { limit = DEFAULT_QUEUE_LIMIT, deadLetterStorage = null } = {},
) {
  if (!storage || typeof storage.read !== "function" || typeof storage.write !== "function") {
    throw new TypeError("storage must provide read and write functions");
  }

  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError("queue limit must be a positive integer");
  }

  let pendingWrite = Promise.resolve();

  function runExclusive(operation) {
    const result = pendingWrite.then(operation, operation);
    pendingWrite = result.catch(() => {});
    return result;
  }

  return {
    async append(event) {
      const validation = validateEvent(event);
      if (!validation.valid) {
        throw new TypeError(`Cannot enqueue invalid event: ${validation.errors.join("; ")}`);
      }

      return runExclusive(async () => {
        const events = validateStoredEvents(await storage.read());
        if (events.length >= limit) {
          throw new RangeError(`Local event queue limit of ${limit} reached`);
        }

        const nextEvents = [...events, structuredClone(event)];
        await storage.write(nextEvents);
        return nextEvents.length;
      });
    },

    async list() {
      await pendingWrite;
      const events = validateStoredEvents(await storage.read());
      return structuredClone(events);
    },

    async clear() {
      return runExclusive(async () => {
        await storage.write([]);
      });
    },

    async settle({ removeEventIds = [], deadLetters = [] }) {
      return runExclusive(async () => {
        const events = validateStoredEvents(await storage.read());
        const removeIds = new Set(removeEventIds);
        const currentIds = new Set(events.map((event) => event.event_id));
        if (
          removeIds.size !== removeEventIds.length ||
          !removeEventIds.every((eventId) => currentIds.has(eventId))
        ) {
          throw new TypeError("queue settlement contains unknown event IDs");
        }
        if (deadLetters.length > 0 && !deadLetterStorage) {
          throw new TypeError("dead-letter storage is not configured");
        }
        const deadLetterIds = new Set(
          deadLetters.map((record) => record.event_id),
        );
        if (
          deadLetterIds.size !== deadLetters.length ||
          !deadLetters.every(
            (record) =>
              removeIds.has(record.event_id) &&
              typeof record.event_type === "string" &&
              typeof record.reason === "string" &&
              typeof record.rejected_at === "string",
          )
        ) {
          throw new TypeError("dead-letter records are invalid");
        }

        if (deadLetters.length > 0) {
          const existing = await deadLetterStorage.read();
          const existingIds = new Set(
            existing.map((record) => record.event_id),
          );
          await deadLetterStorage.write(
            [
              ...existing,
              ...deadLetters.filter(
                (record) => !existingIds.has(record.event_id),
              ),
            ].slice(-limit),
          );
        }
        const remaining = events.filter(
          (event) => !removeIds.has(event.event_id),
        );
        await storage.write(remaining);
        return remaining.length;
      });
    },

    async listDeadLetters() {
      await pendingWrite;
      return structuredClone((await deadLetterStorage?.read()) ?? []);
    },

    async clearDeadLetters() {
      return runExclusive(async () => {
        if (deadLetterStorage) {
          await deadLetterStorage.write([]);
        }
      });
    },
  };
}
