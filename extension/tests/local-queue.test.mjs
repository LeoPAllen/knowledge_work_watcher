import test from "node:test";
import assert from "node:assert/strict";

import { createEvent } from "../src/shared/event-schema.mjs";
import { createLocalQueue } from "../src/shared/local-queue.mjs";
import { createMemoryStorageAdapter } from "../src/shared/storage.mjs";

function syntheticEvent(eventId) {
  return createEvent({
    eventType: "queue_test_event",
    extensionVersion: "0.1.0",
    source: "debug",
    payload: { synthetic: true },
    eventId,
    createdAt: "2026-06-13T12:00:00.000Z",
  });
}

test("appends, lists, and clears events in order", async () => {
  const queue = createLocalQueue(createMemoryStorageAdapter());

  assert.equal(await queue.append(syntheticEvent("event-1")), 1);
  assert.equal(await queue.append(syntheticEvent("event-2")), 2);
  assert.deepEqual(
    (await queue.list()).map((event) => event.event_id),
    ["event-1", "event-2"],
  );

  await queue.clear();
  assert.deepEqual(await queue.list(), []);
});

test("rejects malformed events before storage", async () => {
  const queue = createLocalQueue(createMemoryStorageAdapter());

  await assert.rejects(
    queue.append({ event_type: "queue_test_event" }),
    /Cannot enqueue invalid event/,
  );
  assert.deepEqual(await queue.list(), []);
});

test("rejects appends when the queue limit is reached", async () => {
  const queue = createLocalQueue(createMemoryStorageAdapter(), { limit: 2 });

  await queue.append(syntheticEvent("event-1"));
  await queue.append(syntheticEvent("event-2"));
  await assert.rejects(
    queue.append(syntheticEvent("event-3")),
    /queue limit of 2 reached/,
  );
  assert.equal((await queue.list()).length, 2);
});

test("serializes concurrent appends within a queue instance", async () => {
  const queue = createLocalQueue(createMemoryStorageAdapter());

  await Promise.all([
    queue.append(syntheticEvent("event-1")),
    queue.append(syntheticEvent("event-2")),
    queue.append(syntheticEvent("event-3")),
  ]);

  assert.equal((await queue.list()).length, 3);
});

test("rejects malformed events already present in storage", async () => {
  const storage = createMemoryStorageAdapter([{ unexpected: true }]);
  const queue = createLocalQueue(storage);

  await assert.rejects(queue.list(), /Stored queue contains an invalid event/);
  await assert.rejects(
    queue.append(syntheticEvent("event-1")),
    /Stored queue contains an invalid event/,
  );
});
