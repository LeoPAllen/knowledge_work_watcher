import assert from "node:assert/strict";
import { Writable } from "node:stream";
import test from "node:test";
import { buildApp } from "../src/app.mjs";
import { EventStorage } from "../src/storage.mjs";
import { createEvent } from "../../extension/src/shared/event-schema.mjs";

const TOKEN = "synthetic-study-token";
const RECEIVED_AT = "2026-06-13T12:00:00.000Z";

function config(overrides = {}) {
  return {
    host: "127.0.0.1",
    port: 3000,
    storagePath: ":memory:",
    studyToken: TOKEN,
    maxPayloadBytes: 256 * 1024,
    corsAllowedOrigin: null,
    ...overrides,
  };
}

function event(overrides = {}) {
  return {
    ...createEvent({
      eventType: "queue_test_event",
      extensionVersion: "0.1.0",
      source: "debug",
      payload: { synthetic: true },
      eventId: "synthetic-event-1",
      createdAt: "2026-06-13T11:59:00.000Z",
    }),
    ...overrides,
  };
}

function authorization() {
  return { authorization: `Bearer ${TOKEN}` };
}

test("health and schema version endpoints return request IDs", async (t) => {
  const app = buildApp({ config: config() });
  t.after(() => app.close());

  const health = await app.inject({ method: "GET", url: "/health" });
  assert.equal(health.statusCode, 200);
  assert.equal(health.json().status, "ok");
  assert.equal(health.headers["x-request-id"], health.json().request_id);

  const schema = await app.inject({
    method: "GET",
    url: "/v1/schema/version",
  });
  assert.equal(schema.statusCode, 200);
  assert.equal(schema.json().schema_version, 1);
});

test("accepts and appends a valid event with server metadata", async (t) => {
  const storage = new EventStorage(":memory:");
  const app = buildApp({
    config: config(),
    storage,
    now: () => RECEIVED_AT,
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/v1/events",
    headers: authorization(),
    payload: event(),
  });

  assert.equal(response.statusCode, 202);
  assert.equal(response.json().accepted, true);
  const row = storage.database
    .prepare("SELECT * FROM raw_events")
    .get();
  assert.equal(row.event_id, "synthetic-event-1");
  assert.equal(row.received_at, RECEIVED_AT);
  assert.equal(row.request_id, response.json().request_id);
  assert.deepEqual(JSON.parse(row.raw_event_json), event());
});

test("rejects malformed events without storage", async (t) => {
  const storage = new EventStorage(":memory:");
  const app = buildApp({ config: config(), storage });
  t.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/v1/events",
    headers: authorization(),
    payload: { ...event(), payload: { synthetic: false } },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error, "invalid_event");
  assert.equal(
    storage.database.prepare("SELECT COUNT(*) AS count FROM raw_events").get()
      .count,
    0,
  );
});

test("rejects malformed JSON with a safe client error", async (t) => {
  const app = buildApp({ config: config() });
  t.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/v1/events",
    headers: {
      ...authorization(),
      "content-type": "application/json",
    },
    payload: '{"event_id":',
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error, "invalid_request");
  assert.doesNotMatch(response.body, /Unexpected|JSON/);
});

test("requires bearer authentication for ingestion", async (t) => {
  const app = buildApp({ config: config() });
  t.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/v1/events",
    payload: event(),
  });

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.json().error, "unauthorized");
});

test("rejects oversized request bodies before validation", async (t) => {
  const app = buildApp({
    config: config({ maxPayloadBytes: 1024 }),
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/v1/events",
    headers: {
      ...authorization(),
      "content-type": "application/json",
    },
    payload: JSON.stringify({ value: "x".repeat(2000) }),
  });

  assert.equal(response.statusCode, 413);
  assert.equal(response.json().error, "payload_too_large");
});

test("batch ingestion partially accepts valid events", async (t) => {
  const storage = new EventStorage(":memory:");
  const app = buildApp({ config: config(), storage });
  t.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/v1/events/batch",
    headers: authorization(),
    payload: {
      events: [
        event(),
        { ...event({ event_id: "synthetic-event-2" }), unexpected: true },
      ],
    },
  });

  assert.equal(response.statusCode, 202);
  assert.equal(response.json().accepted, 1);
  assert.equal(response.json().rejected, 1);
  assert.equal(response.json().results[1].reason, "invalid_event");
  assert.equal(
    storage.database.prepare("SELECT COUNT(*) AS count FROM raw_events").get()
      .count,
    1,
  );
});

test("duplicate event IDs are rejected without replacing records", async (t) => {
  const storage = new EventStorage(":memory:");
  const app = buildApp({ config: config(), storage });
  t.after(() => app.close());

  const first = await app.inject({
    method: "POST",
    url: "/v1/events",
    headers: authorization(),
    payload: event(),
  });
  const duplicate = await app.inject({
    method: "POST",
    url: "/v1/events",
    headers: authorization(),
    payload: event(),
  });

  assert.equal(first.statusCode, 202);
  assert.equal(duplicate.statusCode, 409);
  assert.equal(duplicate.json().error, "duplicate_event_id");
  assert.equal(
    storage.database.prepare("SELECT COUNT(*) AS count FROM raw_events").get()
      .count,
    1,
  );
});

test("CORS headers are emitted only for the configured origin", async (t) => {
  const origin = "chrome-extension://synthetic-extension-id";
  const app = buildApp({
    config: config({ corsAllowedOrigin: origin }),
  });
  t.after(() => app.close());

  const allowed = await app.inject({
    method: "OPTIONS",
    url: "/v1/events",
    headers: { origin },
  });
  assert.equal(allowed.statusCode, 204);
  assert.equal(allowed.headers["access-control-allow-origin"], origin);

  const denied = await app.inject({
    method: "OPTIONS",
    url: "/v1/events",
    headers: { origin: "chrome-extension://other-extension" },
  });
  assert.equal(denied.statusCode, 403);
  assert.equal(denied.headers["access-control-allow-origin"], undefined);
});

test("default error logging omits raw event identifiers", async (t) => {
  let logs = "";
  const stream = new Writable({
    write(chunk, encoding, callback) {
      logs += chunk.toString();
      callback();
    },
  });
  const storage = {
    append() {
      throw Object.assign(new Error("synthetic storage failure"), {
        code: "SYNTHETIC_FAILURE",
      });
    },
    close() {},
  };
  const app = buildApp({
    config: config(),
    storage,
    logger: { level: "error", stream },
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/v1/events",
    headers: authorization(),
    payload: event({ event_id: "raw-payload-marker" }),
  });

  assert.equal(response.statusCode, 500);
  assert.match(logs, /SYNTHETIC_FAILURE/);
  assert.doesNotMatch(logs, /raw-payload-marker/);
  assert.doesNotMatch(logs, /synthetic storage failure/);
});
