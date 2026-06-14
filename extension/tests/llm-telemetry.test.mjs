import test from "node:test";
import assert from "node:assert/strict";

import { createLlmTelemetry } from "../src/background/llm-telemetry.mjs";

function harness(overrides = {}) {
  const events = [];
  let context = {
    capture_status: "active",
    participant_id_hash: "a".repeat(64),
    session_id: "session-1",
    allowlist: [],
    ...overrides,
  };
  const telemetry = createLlmTelemetry({
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
    pseudonymizeConversation: async () => `conversation_${"e".repeat(64)}`,
  });
  return { events, telemetry };
}

const sender = {
  url: "https://chatgpt.com/c/synthetic-conversation",
  tab: { id: 1, windowId: 2 },
};
const parsed = {
  tool: "chatgpt",
  parser_version: 2,
  parser_name: "kww_llm_visible_text",
  capture_method: "visible_dom_text",
  selector_family: "canonical",
  confidence: "high",
  health: {
    parsed_count: 1,
    missing_response_text_count: 0,
    degraded_count: 0,
  },
  model_name: "GPT Synthetic",
  prompts: [{ prompt_index: 1, text: "Compare research methods" }],
  responses: [
    {
      response_index: 1,
      text: "Visible assistant response",
      selector_family: "canonical",
      confidence: "high",
      source_urls: [
        "https://developer.mozilla.org/source?tracking=1",
        "https://mail.google.com/mail/u/0/",
      ],
    },
  ],
};

test("queues response text by default with minimized metadata and sources", async () => {
  const { events, telemetry } = harness();
  await telemetry.onPageParsed(parsed, sender);

  assert.deepEqual(
    events.map((event) => event.event_type),
    [
      "llm_prompt_observed",
      "llm_response_observed",
      "llm_response_text_observed",
      "llm_source_links_exposed",
      "llm_interaction_metadata",
    ],
  );
  assert.equal(events[0].payload.prompt_text, "Compare research methods");
  assert.equal(events[1].payload.response_text_captured, false);
  assert.equal(events[2].payload.response_text, "Visible assistant response");
  assert.equal(events[2].payload.capture_profile, "study_expanded");
  assert.deepEqual(events[3].payload.sources, [
    {
      destination_hostname: "developer.mozilla.org",
      destination_url_hash: "d".repeat(64),
    },
  ]);
  const serialized = JSON.stringify(events);
  assert.equal(serialized.includes("tracking"), false);
  assert.equal(serialized.includes("mail.google.com"), false);
  assert.equal(serialized.includes("synthetic-conversation"), false);
});

test("redacts sensitive prompts and model labels", async () => {
  const { events, telemetry } = harness();
  await telemetry.onPageParsed(
    {
      ...parsed,
      model_name: "person@example.test",
      prompts: [{ prompt_index: 1, text: "api_key=synthetic-secret-value" }],
    },
    sender,
  );
  assert.equal(events[0].payload.prompt_text, null);
  assert.equal(events[0].payload.prompt_redacted, true);
  assert.equal(events[0].payload.redaction_reason, "secret");
  assert.equal(events[0].payload.model_name, null);
});

test("redacts and caps visible assistant response text", async () => {
  const { events, telemetry } = harness();
  await telemetry.onPageParsed(
    {
      ...parsed,
      responses: [
        {
          ...parsed.responses[0],
          text: `Contact person@example.test ${"x".repeat(9000)}`,
        },
      ],
    },
    sender,
  );
  const response = events.find(
    (event) => event.event_type === "llm_response_text_observed",
  );
  assert.match(response.payload.response_text, /\[REDACTED_EMAIL\]/);
  assert.equal(response.payload.response_text.includes("person@example"), false);
  assert.equal(response.payload.char_count_stored, 8000);
  assert.equal(response.payload.truncated, true);
  assert.equal(response.payload.redaction_applied, true);
});

test("does not queue when capture is off or paused", async () => {
  for (const captureStatus of ["off", "paused"]) {
    const { events, telemetry } = harness({
      capture_status: captureStatus,
      session_id: captureStatus === "off" ? null : "session-1",
    });
    await telemetry.onPageParsed(parsed, sender);
    assert.deepEqual(events, []);
  }
});

test("rejects mismatched tools, hosts, and missing tab context", async () => {
  const invalid = [
    [{ ...parsed, tool: "claude" }, sender],
    [parsed, { ...sender, url: "https://evil.example/c/demo" }],
    [parsed, { ...sender, url: "https://chatgpt.com/account" }],
    [parsed, { ...sender, url: "https://claude.ai/login" }],
    [parsed, { ...sender, tab: undefined }],
  ];
  for (const [message, invalidSender] of invalid) {
    const { events, telemetry } = harness();
    await telemetry.onPageParsed(message, invalidSender);
    assert.deepEqual(events, []);
  }
});

test("deduplicates repeated snapshots and emits new turns", async () => {
  const { events, telemetry } = harness();
  await telemetry.onPageParsed(parsed, sender);
  await telemetry.onPageParsed(parsed, sender);
  assert.equal(events.length, 5);

  await telemetry.onPageParsed(
    {
      ...parsed,
      prompts: [
        ...parsed.prompts,
        { prompt_index: 2, text: "Second synthetic prompt" },
      ],
      responses: [
        ...parsed.responses,
        {
          response_index: 2,
          text: "Second visible response",
          selector_family: "canonical",
          confidence: "high",
          source_urls: [],
        },
      ],
    },
    sender,
  );
  assert.deepEqual(
    events.slice(5).map((event) => event.event_type),
    [
      "llm_prompt_observed",
      "llm_response_observed",
      "llm_response_text_observed",
      "llm_interaction_metadata",
    ],
  );
});

test("parser errors store only allowlisted safe metadata", async () => {
  const { events, telemetry } = harness();
  await telemetry.onParserError(
    {
      stage: "parse",
      code: "conversation_root_missing",
      parserVersion: 2,
      message: "private response contents",
    },
    sender,
  );
  assert.equal(events[0].event_type, "parser_error");
  assert.equal(events[0].payload.parser_kind, "llm");
  assert.equal(JSON.stringify(events).includes("private response"), false);
});

test("queues safe degraded metadata without response contents", async () => {
  const { events, telemetry } = harness();
  await telemetry.onPageParsed(
    {
      ...parsed,
      health: {
        parsed_count: 0,
        missing_response_text_count: 1,
        degraded_count: 1,
      },
      responses: [
        {
          response_index: 1,
          text: "",
          selector_family: "fallback",
          confidence: "medium",
          source_urls: [],
        },
      ],
      selector_family: "fallback",
      confidence: "medium",
    },
    sender,
  );
  const degraded = events.find(
    (event) => event.event_type === "parser_degraded",
  );
  assert.equal(degraded.payload.missing_count, 1);
  assert.doesNotMatch(JSON.stringify(degraded), /response contents/i);
});
