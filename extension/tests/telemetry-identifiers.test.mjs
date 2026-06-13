import test from "node:test";
import assert from "node:assert/strict";

import {
  hashAllowedUrl,
  pseudonymizeBrowserId,
  pseudonymizeConversationId,
} from "../src/shared/telemetry-identifiers.mjs";

test("URL hashes omit query, fragment, credentials, and hostname case", async () => {
  const first = await hashAllowedUrl(
    "https://EXAMPLE.com/path?q=secret#private",
  );
  const second = await hashAllowedUrl("https://example.com/path");

  assert.equal(first, second);
  assert.match(first, /^[a-f0-9]{64}$/);
});

test("conversation identifiers are scoped by session, tool, and path", async () => {
  const first = await pseudonymizeConversationId(
    "session-a",
    "chatgpt",
    "/c/demo",
  );
  assert.match(first, /^conversation_[a-f0-9]{64}$/);
  assert.equal(
    first,
    await pseudonymizeConversationId("session-a", "chatgpt", "/c/demo"),
  );
  assert.notEqual(
    first,
    await pseudonymizeConversationId("session-b", "chatgpt", "/c/demo"),
  );
});

test("browser identifiers are stable only within a session and kind", async () => {
  const first = await pseudonymizeBrowserId("session-a", "tab", 7);
  assert.equal(first, await pseudonymizeBrowserId("session-a", "tab", 7));
  assert.notEqual(first, await pseudonymizeBrowserId("session-b", "tab", 7));
  assert.notEqual(first, await pseudonymizeBrowserId("session-a", "window", 7));
});
