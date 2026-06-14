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
  parser_version: 1,
  model_name: "GPT Synthetic",
  prompts: [{ prompt_index: 1, text: "Compare research methods" }],
  responses: [
    {
      response_index: 1,
      source_urls: [
        "https://example.org/source?tracking=1",
        "https://mail.google.com/mail/u/0/",
      ],
    },
  ],
};

test("queues prompt, response metadata, safe sources, and interaction metadata", async () => {
  const { events, telemetry } = harness();
  await telemetry.onPageParsed(parsed, sender);

  assert.deepEqual(
    events.map((event) => event.event_type),
    [
      "llm_prompt_observed",
      "llm_response_observed",
      "llm_source_links_exposed",
      "llm_interaction_metadata",
    ],
  );
  assert.equal(events[0].payload.prompt_text, "Compare research methods");
  assert.equal(events[1].payload.response_text_captured, false);
  assert.equal("response_text" in events[1].payload, false);
  assert.deepEqual(events[2].payload.sources, [
    {
      destination_hostname: "example.org",
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
  assert.equal(events.length, 4);

  await telemetry.onPageParsed(
    {
      ...parsed,
      prompts: [
        ...parsed.prompts,
        { prompt_index: 2, text: "Second synthetic prompt" },
      ],
      responses: [
        ...parsed.responses,
        { response_index: 2, source_urls: [] },
      ],
    },
    sender,
  );
  assert.deepEqual(
    events.slice(4).map((event) => event.event_type),
    [
      "llm_prompt_observed",
      "llm_response_observed",
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
      parserVersion: 1,
      message: "private response contents",
    },
    sender,
  );
  assert.equal(events[0].event_type, "parser_error");
  assert.equal(events[0].payload.parser_kind, "llm");
  assert.equal(JSON.stringify(events).includes("private response"), false);
});
