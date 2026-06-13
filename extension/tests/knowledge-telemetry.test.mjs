import test from "node:test";
import assert from "node:assert/strict";

import { createKnowledgeTelemetry } from "../src/background/knowledge-telemetry.mjs";

function harness(overrides = {}) {
  const events = [];
  const context = {
    capture_status: "active",
    participant_id_hash: "a".repeat(64),
    session_id: "session-1",
    allowlist: [],
    ...overrides,
  };
  const telemetry = createKnowledgeTelemetry({
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
  return { events, telemetry };
}

const tab = { id: 1, windowId: 2 };

test("queues Stack Overflow question and answer metadata without text bodies", async () => {
  const { events, telemetry } = harness();
  await telemetry.onPageParsed(
    {
      ok: true,
      site: "stackoverflow.com",
      category: "qna",
      page_type: "question",
      title: "Synthetic question",
      referrer_category: "external",
      parser_version: 1,
      question: {
        question_id: "123",
        tags: ["javascript", "privacy"],
        score: 42,
      },
      answers: [
        { answer_id: "456", accepted: true, score: 17 },
        { answer_id: "789", accepted: false, score: 3 },
      ],
      body: "must not be trusted",
    },
    {
      url: "https://stackoverflow.com/questions/123/synthetic-question",
      tab,
    },
  );

  assert.deepEqual(
    events.map((event) => event.event_type),
    [
      "knowledge_page_exposed",
      "qna_question_exposed",
      "qna_answer_exposed",
      "qna_answer_exposed",
    ],
  );
  assert.equal(events[1].payload.question_id, "123");
  assert.equal(events[2].payload.accepted, true);
  assert.equal(JSON.stringify(events).includes("must not be trusted"), false);
});

test("queues only validated public GitHub URL metadata", async () => {
  const { events, telemetry } = harness();
  await telemetry.onPageParsed(
    {
      site: "github",
      category: "code_repo",
      page_type: "repository",
      title: "Synthetic issue",
      referrer_category: "none",
      parser_version: 1,
      repository: {
        owner: "example",
        repository: "project",
        visibility: "public",
      },
    },
    {
      url: "https://github.com/example/project/issues/12",
      tab,
    },
  );

  assert.deepEqual(
    events.map((event) => event.event_type),
    ["knowledge_page_exposed", "code_repo_exposed"],
  );
  assert.equal(events[1].payload.page_type, "issue");
  assert.equal(events[1].payload.issue_number, 12);
  assert.equal(events[1].payload.owner, "example");
});

test("skips ambiguous, private, mismatched, and reserved GitHub contexts", async () => {
  const examples = [
    [
      "https://github.com/example/private",
      { owner: "example", repository: "private", visibility: "private" },
    ],
    [
      "https://github.com/example/project",
      { owner: "other", repository: "project", visibility: "public" },
    ],
    [
      "https://github.com/settings/profile",
      { owner: "settings", repository: "profile", visibility: "public" },
    ],
  ];
  for (const [url, repository] of examples) {
    const { events, telemetry } = harness();
    await telemetry.onPageParsed(
      {
        site: "github",
        category: "code_repo",
        page_type: "repository",
        title: "Private title",
        referrer_category: "none",
        parser_version: 1,
        repository,
      },
      { url, tab },
    );
    assert.deepEqual(events, []);
  }
});

test("queues minimized docs and Wikipedia exposure", async () => {
  const examples = [
    {
      sender: {
        url: "https://developer.mozilla.org/en-US/docs/Web/API/URL",
        tab,
      },
      parsed: {
        site: "developer.mozilla.org",
        category: "documentation",
        page_type: "documentation",
        title: "URL API",
        headings: ["Constructor", "Instance methods"],
        package_name: null,
        referrer_category: "external",
        parser_version: 1,
      },
    },
    {
      sender: {
        url: "https://en.wikipedia.org/wiki/Knowledge_worker",
        tab,
      },
      parsed: {
        site: "wikipedia",
        category: "reference",
        page_type: "article",
        title: "Knowledge worker",
        headings: ["History", "Research"],
        package_name: null,
        referrer_category: "none",
        parser_version: 1,
      },
    },
  ];

  for (const { parsed, sender } of examples) {
    const { events, telemetry } = harness();
    await telemetry.onPageParsed(parsed, sender);
    assert.deepEqual(
      events.map((event) => event.event_type),
      ["knowledge_page_exposed", "docs_page_exposed"],
    );
    assert.deepEqual(events[1].payload.headings, parsed.headings);
    assert.equal("page_text" in events[1].payload, false);
  }
});

test("redacts sensitive titles, headings, tags, and file paths", async () => {
  const { events, telemetry } = harness();
  await telemetry.onPageParsed(
    {
      site: "developer.mozilla.org",
      category: "documentation",
      page_type: "documentation",
      title: "Contact person@example.test",
      headings: ["api_key=synthetic-secret-value", "Safe heading"],
      package_name: null,
      referrer_category: "none",
      parser_version: 1,
    },
    {
      url: "https://developer.mozilla.org/en-US/docs/Test",
      tab,
    },
  );
  assert.equal(events[0].payload.title, null);
  assert.deepEqual(events[1].payload.headings, ["Safe heading"]);
});

test("does not queue when capture is off or paused", async () => {
  for (const captureStatus of ["off", "paused"]) {
    const { events, telemetry } = harness({
      capture_status: captureStatus,
      session_id: captureStatus === "off" ? null : "session-1",
    });
    await telemetry.onPageParsed(
      {
        site: "wikipedia",
        category: "reference",
        page_type: "article",
        title: "Synthetic",
        headings: [],
        package_name: null,
        referrer_category: "none",
        parser_version: 1,
      },
      { url: "https://en.wikipedia.org/wiki/Synthetic", tab },
    );
    assert.deepEqual(events, []);
  }
});

test("unknown sender and parser errors fail safely", async () => {
  const { events, telemetry } = harness();
  await telemetry.onPageParsed(
    {
      site: "wikipedia",
      category: "reference",
      page_type: "article",
      parser_version: 1,
    },
    { url: "https://example.com/wiki/Test", tab },
  );
  assert.deepEqual(events, []);

  await telemetry.onParserError(
    {
      stage: "parse",
      code: "knowledge_root_missing",
      parserVersion: 1,
      message: "private DOM contents",
    },
    { url: "https://developer.mozilla.org/en-US/docs/Test", tab },
  );
  assert.equal(events[0].event_type, "parser_error");
  assert.equal(events[0].payload.parser_kind, "knowledge");
  assert.equal(JSON.stringify(events).includes("private DOM"), false);
});
