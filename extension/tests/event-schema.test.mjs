import test from "node:test";
import assert from "node:assert/strict";

import {
  EVENT_TYPES,
  SCHEMA_VERSION,
  createEvent,
  validateEvent,
} from "../src/shared/event-schema.mjs";

const baseInput = {
  extensionVersion: "0.1.0",
  source: "debug",
  eventId: "event-1",
  createdAt: "2026-06-13T12:00:00.000Z",
};

test("creates each supported event type", () => {
  const payloads = {
    extension_installed: { reason: "install" },
    consent_changed: { consent_granted: true },
    capture_paused: {},
    capture_resumed: {},
    config_changed: { changed_fields: ["allowlist"] },
    queue_test_event: { synthetic: true },
    tab_created: {
      url_hash: "a".repeat(64),
      hostname: "example.test",
      tab_id: `tab_${"b".repeat(64)}`,
      window_id: `window_${"c".repeat(64)}`,
      browser_timestamp: 1,
    },
    tab_activated: {
      url_hash: "a".repeat(64),
      hostname: "example.test",
      tab_id: `tab_${"b".repeat(64)}`,
      window_id: `window_${"c".repeat(64)}`,
      browser_timestamp: 1,
    },
    tab_updated: {
      url_hash: "a".repeat(64),
      hostname: "example.test",
      tab_id: `tab_${"b".repeat(64)}`,
      window_id: `window_${"c".repeat(64)}`,
      browser_timestamp: 1,
      status: "complete",
    },
    navigation_committed: {
      url_hash: "a".repeat(64),
      hostname: "example.test",
      tab_id: `tab_${"b".repeat(64)}`,
      window_id: `window_${"c".repeat(64)}`,
      browser_timestamp: 1,
      transition_type: "link",
      transition_qualifiers: [],
    },
    window_focus_changed: {
      url_hash: "a".repeat(64),
      hostname: "example.test",
      tab_id: `tab_${"b".repeat(64)}`,
      window_id: `window_${"c".repeat(64)}`,
      browser_timestamp: 1,
      focused: true,
    },
    capture_skipped: {
      signal_type: "navigation_committed",
      classification: "denied",
      reason: "denied_domain",
      category: "webmail",
    },
    search_query_observed: {
      page_url_hash: "a".repeat(64),
      search_hostname: "www.google.com",
      tab_id: `tab_${"b".repeat(64)}`,
      window_id: `window_${"c".repeat(64)}`,
      browser_timestamp: 1,
      search_engine: "google",
      query: "synthetic research",
      query_redacted: false,
      redaction_reason: null,
    },
    search_results_exposed: {
      page_url_hash: "a".repeat(64),
      search_hostname: "www.google.com",
      tab_id: `tab_${"b".repeat(64)}`,
      window_id: `window_${"c".repeat(64)}`,
      browser_timestamp: 1,
      search_engine: "google",
      results: [
        {
          rank: 1,
          title: "Synthetic result",
          destination_hostname: "example.test",
          destination_url_hash: "d".repeat(64),
          result_type: "organic",
        },
      ],
    },
    search_result_clicked: {
      page_url_hash: "a".repeat(64),
      search_hostname: "www.google.com",
      tab_id: `tab_${"b".repeat(64)}`,
      window_id: `window_${"c".repeat(64)}`,
      browser_timestamp: 1,
      search_engine: "google",
      clicked_rank: 1,
      destination_hostname: "example.test",
      destination_url_hash: "d".repeat(64),
    },
    parser_error: {
      page_url_hash: "a".repeat(64),
      search_hostname: "www.google.com",
      tab_id: `tab_${"b".repeat(64)}`,
      window_id: `window_${"c".repeat(64)}`,
      browser_timestamp: 1,
      search_engine: "google",
      parser_stage: "parse",
      error_code: "results_root_missing",
      parser_version: 1,
    },
  };

  for (const eventType of EVENT_TYPES) {
    const event = createEvent({
      ...baseInput,
      eventType,
      payload: payloads[eventType],
    });

    assert.equal(event.schema_version, SCHEMA_VERSION);
    assert.equal(event.event_type, eventType);
    assert.equal(event.participant_id_hash, null);
    assert.equal(event.session_id, null);
    assert.equal(validateEvent(event).valid, true);
  }
});

test("accepts popup as a state-control event source", () => {
  const event = createEvent({
    ...baseInput,
    source: "popup",
    eventType: "capture_paused",
    captureMode: "paused",
  });

  assert.equal(validateEvent(event).valid, true);
});

test("rejects unsupported or malformed event data", () => {
  assert.throws(
    () =>
      createEvent({
        ...baseInput,
        eventType: "navigation",
        payload: { unsupported: true },
      }),
    /Invalid event/,
  );

  const malformed = {
    event_id: "event-2",
    schema_version: SCHEMA_VERSION,
    event_type: "queue_test_event",
    created_at: "not-a-date",
    participant_id_hash: null,
    session_id: null,
    extension_version: "0.1.0",
    capture_mode: "off",
    source: "debug",
    payload: { synthetic: true },
  };

  const result = validateEvent(malformed);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /created_at/);
});

test("rejects unexpected fields and invalid payloads", () => {
  const valid = createEvent({
    ...baseInput,
    eventType: "queue_test_event",
    payload: { synthetic: true },
  });

  assert.equal(validateEvent({ ...valid, unsupported: true }).valid, false);
  assert.equal(
    validateEvent({ ...valid, payload: { synthetic: false } }).valid,
    false,
  );
  assert.equal(
    validateEvent({ ...valid, participant_id_hash: "raw-participant-id" }).valid,
    false,
  );
  assert.throws(
    () =>
      createEvent({
        ...baseInput,
        eventType: "config_changed",
        payload: { changed_fields: ["participant-secret"] },
      }),
    /Invalid event/,
  );

  assert.throws(
    () =>
      createEvent({
        ...baseInput,
        eventType: "tab_activated",
        payload: {
          url_hash: "a".repeat(64),
          hostname: "example.test",
          tab_id: "raw-tab-id",
          window_id: `window_${"c".repeat(64)}`,
          browser_timestamp: 1,
          title: "must not be accepted",
        },
      }),
    /Invalid event/,
  );

  assert.throws(
    () =>
      createEvent({
        ...baseInput,
        eventType: "search_results_exposed",
        payload: {
          page_url_hash: "a".repeat(64),
          search_hostname: "www.google.com",
          tab_id: `tab_${"b".repeat(64)}`,
          window_id: `window_${"c".repeat(64)}`,
          browser_timestamp: 1,
          search_engine: "google",
          results: [
            {
              rank: 1,
              title: "Synthetic result",
              destination_hostname: "example.test",
              destination_url_hash: "d".repeat(64),
              result_type: "organic",
              snippet: "must not be accepted",
            },
          ],
        },
      }),
    /Invalid event/,
  );
});
