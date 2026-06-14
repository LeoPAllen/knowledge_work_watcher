import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";

const cases = [
  {
    path: "extension/src/search/search-content-script.js",
    parserName: "KWWSearchParser",
    parser: {
      engineForUrl: () => "google",
      parseSearchPage: () => {
        throw new Error("parser must not run");
      },
    },
  },
  {
    path: "extension/src/llm/llm-content-script.js",
    parserName: "KWWLlmParser",
    parser: {
      toolForUrl: () => "chatgpt",
      parseLlmPage: () => {
        throw new Error("parser must not run");
      },
    },
  },
  {
    path: "extension/src/knowledge/knowledge-content-script.js",
    parserName: "KWWKnowledgeParser",
    parser: {
      parseKnowledgePage: () => {
        throw new Error("parser must not run");
      },
    },
  },
];

test("inactive content scripts do not parse pages or attach observers", async () => {
  for (const fixture of cases) {
    let observerCount = 0;
    const context = {
      chrome: {
        runtime: {
          async sendMessage(message) {
            assert.equal(message.type, "get_capture_gate");
            return { ok: true, active: false };
          },
        },
      },
      document: {},
      location: { href: "https://example.test/" },
      MutationObserver: class {
        constructor() {
          observerCount += 1;
        }
      },
      clearTimeout,
      setTimeout,
    };
    context[fixture.parserName] = fixture.parser;
    vm.runInNewContext(
      await readFile(resolve(fixture.path), "utf8"),
      context,
    );
    await new Promise((resolvePromise) => setImmediate(resolvePromise));
    assert.equal(observerCount, 0, fixture.path);
  }
});
