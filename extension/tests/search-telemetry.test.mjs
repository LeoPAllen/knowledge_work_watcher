import test from "node:test";
import assert from "node:assert/strict";

import { createSearchTelemetry } from "../src/background/search-telemetry.mjs";

function harness(overrides = {}) {
  const events = [];
  let context = {
    capture_status: "active",
    participant_id_hash: "a".repeat(64),
    session_id: "session-1",
    allowlist: [],
    ...overrides,
  };
  const telemetry = createSearchTelemetry({
    stateController: {
      async getTelemetryContext() {
        return structuredClone(context);
      },
    },
    queue: {
      async append(event) {
        events.push(structuredClone(event));
      },
    },
    extensionVersion: "0.1.0",
    hashUrl: async () => "d".repeat(64),
    pseudonymize: async (_session, kind, value) =>
      `${kind}_${String(value).repeat(64).slice(0, 64)}`,
  });
  return {
    events,
    telemetry,
    setContext(changes) {
      context = { ...context, ...changes };
    },
  };
}

const sender = {
  url: "https://www.google.com/search?q=knowledge+work",
  tab: { id: 1, windowId: 2 },
};
const parsed = {
  engine: "google",
  query: "untrusted content-script query",
  parser_version: 1,
  results: [
    {
      rank: 1,
      title: "Synthetic result",
      url: "https://example.org/source?tracking=1",
      result_type: "organic",
    },
    {
      rank: 2,
      title: "Private result",
      url: "https://mail.google.com/mail/u/0/",
      result_type: "organic",
    },
    {
      rank: 3,
      title: "Contact person@example.test",
      url: "https://example.net/contact",
      result_type: "organic",
    },
  ],
};

test("queues minimized query and exposure events from a valid search sender", async () => {
  const { events, telemetry } = harness();
  await telemetry.onPageParsed(parsed, sender);

  assert.deepEqual(
    events.map((event) => event.event_type),
    ["search_query_observed", "search_results_exposed"],
  );
  assert.equal(events[0].payload.query, "knowledge work");
  assert.equal(events[0].payload.page_url_hash, "d".repeat(64));
  assert.equal(events[1].payload.results.length, 1);
  assert.deepEqual(events[1].payload.results[0], {
    rank: 1,
    title: "Synthetic result",
    destination_hostname: "example.org",
    destination_url_hash: "d".repeat(64),
    result_type: "organic",
  });
  assert.equal(JSON.stringify(events).includes("tracking"), false);
  assert.equal(JSON.stringify(events).includes("mail.google.com"), false);
  assert.equal(JSON.stringify(events).includes("person@example.test"), false);
  assert.equal(JSON.stringify(events).includes("untrusted"), false);
});

test("redacts sensitive query text taken from the validated sender URL", async () => {
  const { events, telemetry } = harness();
  await telemetry.onPageParsed(parsed, {
    ...sender,
    url: "https://www.google.com/search?q=person%40example.test",
  });
  assert.equal(events[0].payload.query, null);
  assert.equal(events[0].payload.query_redacted, true);
  assert.equal(events[0].payload.redaction_reason, "email");
});

test("does not queue when capture is off or paused", async () => {
  for (const captureStatus of ["off", "paused"]) {
    const { events, telemetry } = harness({
      capture_status: captureStatus,
      session_id: captureStatus === "off" ? null : "session-1",
    });
    await telemetry.onPageParsed(parsed, sender);
    await telemetry.onResultClicked(
      { engine: "google", rank: 1, url: "https://example.org/" },
      sender,
    );
    assert.deepEqual(events, []);
  }
});

test("rejects mismatched engines, paths, hosts, and missing tab context", async () => {
  const invalid = [
    [{ ...parsed, engine: "bing" }, sender],
    [parsed, { ...sender, url: "https://www.google.com/account" }],
    [parsed, { ...sender, url: "https://evil.example/search?q=test" }],
    [parsed, { ...sender, tab: undefined }],
  ];

  for (const [message, invalidSender] of invalid) {
    const { events, telemetry } = harness();
    await telemetry.onPageParsed(message, invalidSender);
    assert.deepEqual(events, []);
  }
});

test("queues minimized recognized result clicks", async () => {
  const { events, telemetry } = harness();
  await telemetry.onResultClicked(
    { engine: "google", rank: 2, url: "https://example.net/guide?q=secret" },
    sender,
  );
  assert.equal(events[0].event_type, "search_result_clicked");
  assert.equal(events[0].payload.clicked_rank, 2);
  assert.equal(events[0].payload.destination_hostname, "example.net");
  assert.equal(JSON.stringify(events).includes("secret"), false);
});

test("parser errors contain only allowlisted codes and safe page metadata", async () => {
  const { events, telemetry } = harness();
  await telemetry.onParserError(
    {
      stage: "parse",
      code: "results_root_missing",
      parserVersion: 1,
      message: "private DOM contents",
    },
    sender,
  );
  assert.equal(events[0].event_type, "parser_error");
  assert.equal(events[0].payload.error_code, "results_root_missing");
  assert.equal(JSON.stringify(events).includes("private DOM"), false);

  await telemetry.onParserError(
    { stage: "parse", code: "unexpected-secret", parserVersion: 1 },
    sender,
  );
  assert.equal(events.length, 1);
});

test("rechecks the active session before append", async () => {
  const { events, telemetry, setContext } = harness();
  const original = telemetry.onPageParsed.bind(telemetry);
  setContext({ capture_status: "off", session_id: null });
  await original(parsed, sender);
  assert.deepEqual(events, []);
});
