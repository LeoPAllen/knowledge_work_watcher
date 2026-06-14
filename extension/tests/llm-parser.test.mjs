import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

import { parseHTML } from "linkedom";

const testRoot = dirname(fileURLToPath(import.meta.url));
const source = await readFile(
  resolve(testRoot, "../src/llm/llm-parser.js"),
  "utf8",
);
const context = { URL };
vm.runInNewContext(source, context);
const parser = context.KWWLlmParser;

async function fixture(name, pageUrl) {
  const html = await readFile(
    resolve(testRoot, `fixtures/llm/${name}.html`),
    "utf8",
  );
  const { document } = parseHTML(html);
  for (const link of document.querySelectorAll("a[href]")) {
    Object.defineProperty(link, "href", {
      configurable: true,
      value: new URL(link.getAttribute("href"), pageUrl).href,
    });
  }
  return document;
}

test("extracts prompts, visible responses, and source URLs for each supported LLM", async () => {
  const examples = [
    ["chatgpt", "https://chatgpt.com/c/demo", "Compare research methods"],
    ["claude", "https://claude.ai/chat/demo", "Summarize the synthetic evidence"],
    ["gemini", "https://gemini.google.com/app/demo", "Find documentation sources"],
    ["perplexity", "https://www.perplexity.ai/search/demo", "Explain the synthetic topic"],
    ["copilot", "https://copilot.microsoft.com/chats/demo", "List relevant synthetic tools"],
  ];

  for (const [name, pageUrl, prompt] of examples) {
    const parsed = parser.parseLlmPage(await fixture(name, pageUrl), pageUrl);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.tool, name);
    assert.equal(parsed.prompts[0].text, prompt);
    assert.equal(parsed.responses.length, 1);
    assert.match(parsed.responses[0].text, /Visible assistant|Visible \w+ response/);
    assert.equal(parsed.responses[0].source_urls.length >= 1, true);
    assert.equal(parsed.parser_version, 2);
  }
});

test("excludes hidden, profile, and attachment content from response text", async () => {
  const pageUrl = "https://chatgpt.com/c/demo";
  const parsed = parser.parseLlmPage(await fixture("chatgpt", pageUrl), pageUrl);
  const serialized = JSON.stringify(parsed);

  assert.equal(serialized.includes("Visible assistant response"), true);
  assert.equal(serialized.includes("Hidden account text"), false);
  assert.equal(serialized.includes("Synthetic User"), false);
  assert.equal(serialized.includes("private-upload"), false);
});

test("supports fallback selector variants for every LLM", async () => {
  const examples = [
    ["chatgpt-alt", "https://chatgpt.com/c/demo"],
    ["claude-alt", "https://claude.ai/chat/demo"],
    ["gemini-alt", "https://gemini.google.com/app/demo"],
    ["perplexity-alt", "https://www.perplexity.ai/search/demo"],
    ["copilot-alt", "https://copilot.microsoft.com/chats/demo"],
  ];
  for (const [name, pageUrl] of examples) {
    const parsed = parser.parseLlmPage(await fixture(name, pageUrl), pageUrl);
    assert.equal(parsed.ok, true);
    assert.match(parsed.responses[0].text, /Fallback/);
    assert.notEqual(parsed.confidence, "high");
    assert.equal(parsed.health.degraded_count, 1);
  }
});

test("fails safely for malformed and unsupported pages", async () => {
  const pageUrl = "https://chatgpt.com/c/demo";
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        parser.parseLlmPage(await fixture("malformed", pageUrl), pageUrl),
      ),
    ),
    {
      ok: false,
      code: "conversation_root_missing",
      tool: "chatgpt",
    },
  );
  assert.equal(
    parser.parseLlmPage(
      await fixture("malformed", "https://example.com/"),
      "https://example.com/",
    ).code,
    "unsupported_llm_page",
  );
});
