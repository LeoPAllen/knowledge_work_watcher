import assert from "node:assert/strict";
import test from "node:test";
import {
  canCreateTestEvent,
  extensionPageSource,
  isAuthorizedParserMessage,
} from "../src/background/message-policy.mjs";

const tab = { id: 1, windowId: 2 };

test("authorizes parser messages only from their scoped tab pages", () => {
  assert.equal(
    isAuthorizedParserMessage("search_page_parsed", {
      url: "https://www.google.com/search?q=synthetic",
      tab,
    }),
    true,
  );
  assert.equal(
    isAuthorizedParserMessage("llm_page_parsed", {
      url: "https://chatgpt.com/c/synthetic",
      tab,
    }),
    true,
  );
  assert.equal(
    isAuthorizedParserMessage("knowledge_page_parsed", {
      url: "https://en.wikipedia.org/wiki/Synthetic",
      tab,
    }),
    true,
  );
  assert.equal(
    isAuthorizedParserMessage("get_capture_gate", {
      url: "https://claude.ai/new",
      tab,
    }),
    true,
  );
  assert.equal(
    isAuthorizedParserMessage("get_capture_gate", {
      url: "https://chatgpt.com/account",
      tab,
    }),
    false,
  );

  assert.equal(
    isAuthorizedParserMessage("search_page_parsed", {
      url: "https://chatgpt.com/c/synthetic",
      tab,
    }),
    false,
  );
  assert.equal(
    isAuthorizedParserMessage("llm_page_parsed", {
      url: "https://chatgpt.com/c/synthetic",
    }),
    false,
  );
});

test("synthetic event creation requires persisted debug mode", () => {
  assert.equal(canCreateTestEvent({ debug_mode: true }), true);
  assert.equal(canCreateTestEvent({ debug_mode: false }), false);
  assert.equal(canCreateTestEvent(null), false);
});

test("authorizes privileged actions only from popup or options pages", () => {
  const origin = "chrome-extension://synthetic-extension/";
  assert.equal(
    extensionPageSource(
      { url: `${origin}src/options/options.html`, tab },
      origin,
    ),
    "options",
  );
  assert.equal(
    extensionPageSource(
      { url: `${origin}src/popup/popup.html` },
      origin,
    ),
    "popup",
  );
  assert.equal(
    extensionPageSource(
      { url: "https://chatgpt.com/c/synthetic", tab },
      origin,
    ),
    null,
  );
  assert.equal(
    extensionPageSource(
      { url: "chrome-extension://other-extension/src/options/options.html" },
      origin,
    ),
    null,
  );
});
