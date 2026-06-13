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

export function createLocalQueue(storage, { limit = DEFAULT_QUEUE_LIMIT } = {}) {
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
  };
}
