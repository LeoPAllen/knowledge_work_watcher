import assert from "node:assert/strict";
import test from "node:test";
import { createUploadSync } from "../src/background/upload-sync.mjs";
import { createEvent } from "../src/shared/event-schema.mjs";
import { createLocalQueue } from "../src/shared/local-queue.mjs";
import { createMemorySyncStateStorage } from "../src/shared/sync-state.mjs";
import {
  createMemoryDeadLetterStorage,
  createMemoryStorageAdapter,
} from "../src/shared/storage.mjs";

const TOKEN = "synthetic-study-token";
const NOW = Date.parse("2026-06-13T12:00:00.000Z");

function event(eventId) {
  return createEvent({
    eventType: "queue_test_event",
    extensionVersion: "0.1.0",
    captureMode: "ambient",
    source: "debug",
    payload: { synthetic: true },
    eventId,
    createdAt: "2026-06-13T11:59:00.000Z",
  });
}

function responseFor(events, rejected = new Map()) {
  const results = events.map((item, index) =>
    rejected.has(index)
      ? {
          index,
          accepted: false,
          reason: rejected.get(index),
        }
      : {
          index,
          accepted: true,
          event_id: item.event_id,
        },
  );
  return new Response(
    JSON.stringify({
      accepted: results.filter((result) => result.accepted).length,
      rejected: results.filter((result) => !result.accepted).length,
      results,
    }),
    { status: 202, headers: { "content-type": "application/json" } },
  );
}

function setup({
  context = {},
  fetchImpl,
  initialEvents = [event("event-1")],
  permission = true,
} = {}) {
  const currentContext = {
    consent_accepted: true,
    ambient_enabled: true,
    paused: false,
    upload_enabled: true,
    capture_status: "active",
    study_server_url: "https://study.example",
    study_auth_token: TOKEN,
    ...context,
  };
  const queue = createLocalQueue(
    createMemoryStorageAdapter(initialEvents),
    { deadLetterStorage: createMemoryDeadLetterStorage() },
  );
  const syncStateStorage = createMemorySyncStateStorage();
  const alarmCalls = [];
  const alarms = {
    async create(name, details) {
      alarmCalls.push(["create", name, details]);
    },
    async clear(name) {
      alarmCalls.push(["clear", name]);
    },
  };
  const upload = createUploadSync({
    stateController: {
      async getUploadContext() {
        return structuredClone(currentContext);
      },
    },
    queue,
    syncStateStorage,
    fetchImpl:
      fetchImpl ??
      (async (url, options) =>
        responseFor(JSON.parse(options.body).events)),
    alarms,
    permissions: {
      async contains() {
        return permission;
      },
    },
    now: () => NOW,
  });
  return {
    upload,
    queue,
    syncStateStorage,
    alarmCalls,
    currentContext,
  };
}

test("does not upload without consent or while paused", async () => {
  let calls = 0;
  for (const context of [
    { consent_accepted: false },
    { paused: true, capture_status: "paused" },
    { upload_enabled: false },
  ]) {
    const { upload, queue } = setup({
      context,
      fetchImpl: async () => {
        calls += 1;
        throw new Error("must not fetch");
      },
    });
    await upload.syncNow();
    assert.equal((await queue.list()).length, 1);
  }
  assert.equal(calls, 0);
});

test("successful batch upload removes acknowledged events", async () => {
  const { upload, queue } = setup({
    initialEvents: [event("event-1"), event("event-2")],
  });

  const state = await upload.syncNow();

  assert.equal(state.status, "succeeded");
  assert.equal(state.last_accepted, 2);
  assert.deepEqual(await queue.list(), []);
});

test("failed upload preserves events and persists exponential backoff", async () => {
  const { upload, queue, syncStateStorage, alarmCalls } = setup({
    fetchImpl: async () => {
      throw new Error(`network failed for ${TOKEN}`);
    },
  });

  await upload.syncNow();
  await upload.syncNow();

  assert.equal((await queue.list()).length, 1);
  const state = await syncStateStorage.read();
  assert.equal(state.status, "retry_wait");
  assert.equal(state.consecutive_failures, 2);
  assert.equal(state.next_retry_at, NOW + 60_000);
  assert.equal(alarmCalls.filter(([action]) => action === "create").length, 2);
});

test("stalled requests abort and preserve queued events", async () => {
  const queue = createLocalQueue(
    createMemoryStorageAdapter([event("event-1")]),
    { deadLetterStorage: createMemoryDeadLetterStorage() },
  );
  const upload = createUploadSync({
    stateController: {
      async getUploadContext() {
        return {
          consent_accepted: true,
          ambient_enabled: true,
          paused: false,
          upload_enabled: true,
          capture_status: "active",
          study_server_url: "https://study.example",
          study_auth_token: TOKEN,
        };
      },
    },
    queue,
    syncStateStorage: createMemorySyncStateStorage(),
    fetchImpl: async (url, options) =>
      new Promise((resolve, reject) => {
        options.signal.addEventListener("abort", () => {
          reject(new Error("aborted"));
        });
      }),
    alarms: { create: async () => {}, clear: async () => {} },
    permissions: { contains: async () => true },
    now: () => NOW,
    requestTimeoutMs: 1,
  });

  const state = await upload.syncNow();

  assert.equal(state.status, "retry_wait");
  assert.equal(state.last_error, "network_error");
  assert.equal((await queue.list()).length, 1);
});

test("automatic sync requests honor persisted retry backoff", async () => {
  let calls = 0;
  const { upload, syncStateStorage } = setup({
    fetchImpl: async () => {
      calls += 1;
      throw new Error("synthetic network failure");
    },
  });
  await syncStateStorage.write({
    status: "retry_wait",
    consecutive_failures: 1,
    next_retry_at: NOW + 30_000,
    last_attempt_at: null,
    last_success_at: null,
    last_error: "network_error",
    last_accepted: 0,
    last_rejected: 0,
  });

  upload.requestSync();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(calls, 0);
});

test("automatic sync does not repeat configuration errors", async () => {
  let calls = 0;
  const { upload, syncStateStorage } = setup({
    fetchImpl: async () => {
      calls += 1;
      return new Response("", { status: 401 });
    },
  });
  await syncStateStorage.write({
    status: "error",
    consecutive_failures: 1,
    next_retry_at: null,
    last_attempt_at: null,
    last_success_at: null,
    last_error: "unauthorized",
    last_accepted: 0,
    last_rejected: 0,
  });

  upload.requestSync();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(calls, 0);
});

test("server rejections move metadata only to the dead-letter queue", async () => {
  const { upload, queue } = setup({
    initialEvents: [event("event-1"), event("event-2")],
    fetchImpl: async (url, options) => {
      const events = JSON.parse(options.body).events;
      return responseFor(events, new Map([[1, "invalid_event"]]));
    },
  });

  const state = await upload.syncNow();

  assert.equal(state.last_accepted, 1);
  assert.equal(state.last_rejected, 1);
  assert.deepEqual(await queue.list(), []);
  assert.deepEqual(await queue.listDeadLetters(), [
    {
      event_id: "event-2",
      event_type: "queue_test_event",
      reason: "invalid_event",
      rejected_at: "2026-06-13T12:00:00.000Z",
    },
  ]);
});

test("invalid server acknowledgements preserve the queue", async () => {
  const { upload, queue } = setup({
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          accepted: 1,
          rejected: 0,
          results: [
            { index: 0, accepted: true, event_id: "wrong-event" },
          ],
        }),
        { status: 202 },
      ),
  });

  const state = await upload.syncNow();

  assert.equal(state.status, "retry_wait");
  assert.equal(state.last_error, "invalid_server_response");
  assert.equal((await queue.list()).length, 1);
});

test("events appended during upload survive settlement when capture pauses", async () => {
  let harness;
  harness = setup({
    fetchImpl: async (url, options) => {
      await harness.queue.append(event("event-2"));
      harness.currentContext.paused = true;
      harness.currentContext.capture_status = "paused";
      return responseFor(JSON.parse(options.body).events);
    },
  });

  const state = await harness.upload.syncNow();

  assert.equal(state.status, "blocked");
  assert.deepEqual(
    (await harness.queue.list()).map((item) => item.event_id),
    ["event-2"],
  );
});

test("missing permission and unauthorized responses preserve events", async () => {
  const missingPermission = setup({ permission: false });
  const permissionState = await missingPermission.upload.syncNow();
  assert.equal(permissionState.last_error, "permission_missing");
  assert.equal((await missingPermission.queue.list()).length, 1);

  const unauthorized = setup({
    fetchImpl: async () => new Response("", { status: 401 }),
  });
  const authState = await unauthorized.upload.syncNow();
  assert.equal(authState.last_error, "unauthorized");
  assert.equal(authState.next_retry_at, null);
  assert.equal((await unauthorized.queue.list()).length, 1);
});

test("auth token and raw payloads are never logged", async () => {
  const logs = [];
  const originalError = console.error;
  const originalInfo = console.info;
  console.error = (...values) => logs.push(values.join(" "));
  console.info = (...values) => logs.push(values.join(" "));
  try {
    const { upload } = setup({
      fetchImpl: async () => {
        throw new Error(`${TOKEN} ${JSON.stringify(event("event-1"))}`);
      },
    });
    await upload.syncNow();
  } finally {
    console.error = originalError;
    console.info = originalInfo;
  }
  assert.deepEqual(logs, []);
});

test("denied-page skip uploads contain no URL or title fields", async () => {
  const skipped = createEvent({
    eventType: "capture_skipped",
    extensionVersion: "0.1.0",
    captureMode: "ambient",
    source: "telemetry",
    payload: {
      signal_type: "navigation_committed",
      classification: "denied",
      reason: "denied_domain",
      category: "webmail",
    },
    eventId: "skip-event",
    createdAt: "2026-06-13T11:59:00.000Z",
  });
  let uploaded;
  const { upload } = setup({
    initialEvents: [skipped],
    fetchImpl: async (url, options) => {
      uploaded = JSON.parse(options.body);
      return responseFor(uploaded.events);
    },
  });

  await upload.syncNow();

  const serialized = JSON.stringify(uploaded);
  assert.doesNotMatch(serialized, /url|title|mail\.google/);
});
