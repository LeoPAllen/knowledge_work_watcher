import assert from "node:assert/strict";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { EventStorage } from "../src/storage.mjs";
import { createEvent } from "../../extension/src/shared/event-schema.mjs";

test("persists append-only events with restrictive database permissions", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "kww-storage-"));
  const path = join(directory, "events.sqlite");
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const syntheticEvent = createEvent({
    eventType: "queue_test_event",
    extensionVersion: "0.1.0",
    source: "debug",
    payload: { synthetic: true },
    eventId: "persistent-synthetic-event",
    createdAt: "2026-06-13T11:59:00.000Z",
  });

  const first = new EventStorage(path);
  first.append(syntheticEvent, {
    receivedAt: "2026-06-13T12:00:00.000Z",
    requestId: "request-1",
  });
  first.close();

  assert.equal(statSync(path).mode & 0o777, 0o600);
  const reopened = new EventStorage(path);
  t.after(() => reopened.close());
  const row = reopened.database
    .prepare("SELECT event_id, request_id FROM raw_events")
    .get();
  assert.deepEqual({ ...row }, {
    event_id: "persistent-synthetic-event",
    request_id: "request-1",
  });
});
