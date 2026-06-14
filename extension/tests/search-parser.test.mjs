import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

import { parseHTML } from "linkedom";

const testRoot = dirname(fileURLToPath(import.meta.url));
const parserSource = await readFile(
  resolve(testRoot, "../src/search/search-parser.js"),
  "utf8",
);
const context = { URL };
vm.runInNewContext(parserSource, context);
const parser = context.KWWSearchParser;

async function fixture(name, pageUrl) {
  const html = await readFile(
    resolve(testRoot, `fixtures/search/${name}.html`),
    "utf8",
  );
  const { document } = parseHTML(html);
  for (const link of document.querySelectorAll("a[href]")) {
    const rawHref = link.getAttribute("href");
    Object.defineProperty(link, "href", {
      configurable: true,
      value: new URL(rawHref, pageUrl).href,
    });
  }
  return document;
}

test("extracts Google query, snippets, URLs, and organic result metadata", async () => {
  const pageUrl = "https://www.google.com/search?q=knowledge+work";
  const document = await fixture("google", pageUrl);
  const result = parser.parseSearchPage(document, pageUrl);

  assert.equal(result.query, "knowledge work");
  assert.deepEqual(
    JSON.parse(JSON.stringify(result.results)),
    [
      {
        rank: 1,
        title: "Alpha research source",
        url: "https://developer.mozilla.org/en-US/docs/Web/API/URL?utm_source=test&lang=en",
        result_type: "organic",
        snippet: "Visible Google snippet for person@example.test.",
        selector_family: "fallback",
        confidence: "medium",
      },
      {
        rank: 2,
        title: "Documentation guide",
        url: "https://docs.python.org/3/library/urllib.parse.html",
        result_type: "organic",
        snippet: null,
        selector_family: "canonical",
        confidence: "low",
      },
    ],
  );
  assert.equal(JSON.stringify(result).includes("profile"), false);
});

test("extracts Bing and DuckDuckGo fixture results", async () => {
  const examples = [
    [
      "bing",
      "https://www.bing.com/search?q=research",
      "Synthetic paper",
    ],
    [
      "duckduckgo",
      "https://duckduckgo.com/?q=research",
      "Knowledge article",
    ],
  ];

  for (const [name, pageUrl, firstTitle] of examples) {
    const result = parser.parseSearchPage(
      await fixture(name, pageUrl),
      pageUrl,
    );
    assert.equal(result.ok, true);
    assert.equal(result.results.length, 2);
    assert.equal(result.results[0].title, firstTitle);
    assert.match(result.results[0].snippet, /Visible/);
    assert.equal(
      result.results.some((item) => item.title === "Synthetic ad"),
      false,
    );
  }
});

test("supports fallback selector variants for every search engine", async () => {
  for (const [name, pageUrl] of [
    ["google-alt", "https://www.google.com/search?q=research"],
    ["bing-alt", "https://www.bing.com/search?q=research"],
    ["duckduckgo-alt", "https://duckduckgo.com/?q=research"],
  ]) {
    const result = parser.parseSearchPage(await fixture(name, pageUrl), pageUrl);
    assert.equal(result.ok, true);
    assert.equal(result.results.length, 1);
    assert.match(result.results[0].snippet, /Fallback/);
    assert.equal(result.health.degraded_count, 1);
  }
});

test("fails closed for malformed and unsupported pages", async () => {
  const googleUrl = "https://www.google.com/search?q=synthetic";
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        parser.parseSearchPage(
          await fixture("malformed", googleUrl),
          googleUrl,
        ),
      ),
    ),
    {
      ok: false,
      code: "results_root_missing",
      engine: "google",
    },
  );
  assert.equal(
    parser.parseSearchPage(
      await fixture("malformed", "https://example.com/"),
      "https://example.com/",
    ).code,
    "unsupported_search_page",
  );
});

test("infers click rank only for recognized organic result anchors", async () => {
  const pageUrl = "https://duckduckgo.com/?q=research";
  const document = await fixture("duckduckgo", pageUrl);
  const links = document.querySelectorAll("a.result__a");

  assert.equal(parser.clickedResult(document, pageUrl, links[0]), null);
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(parser.clickedResult(document, pageUrl, links[1])),
    ),
    {
      engine: "duckduckgo",
      rank: 1,
      url: "https://en.wikipedia.org/wiki/Knowledge_worker?utm_medium=test",
    },
  );
});
