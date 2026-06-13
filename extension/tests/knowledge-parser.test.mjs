import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

import { parseHTML } from "linkedom";

const testRoot = dirname(fileURLToPath(import.meta.url));
const source = await readFile(
  resolve(testRoot, "../src/knowledge/knowledge-parser.js"),
  "utf8",
);
const context = { URL };
vm.runInNewContext(source, context);
const parser = context.KWWKnowledgeParser;

async function fixture(name) {
  const html = await readFile(
    resolve(testRoot, `fixtures/knowledge/${name}.html`),
    "utf8",
  );
  return parseHTML(html).document;
}

test("extracts Stack Overflow question and answer metadata without bodies", async () => {
  const parsed = parser.parseKnowledgePage(
    await fixture("stackoverflow"),
    "https://stackoverflow.com/questions/123/synthetic-question",
    "https://www.google.com/search?q=synthetic",
  );
  assert.equal(parsed.ok, true);
  assert.equal(parsed.question.question_id, "123");
  assert.equal(parsed.question.score, 42);
  assert.deepEqual([...parsed.question.tags], ["javascript", "privacy"]);
  assert.deepEqual(JSON.parse(JSON.stringify(parsed.answers)), [
    { answer_id: "456", accepted: true, score: 17 },
    { answer_id: "789", accepted: false, score: 3 },
  ]);
  assert.equal(parsed.referrer_category, "external");
  assert.equal(JSON.stringify(parsed).includes("question body"), false);
  assert.equal(JSON.stringify(parsed).includes("answer body"), false);
});

test("extracts only public GitHub repository URL metadata", async () => {
  const pageUrl = "https://github.com/example/project/issues/12";
  const parsed = parser.parseKnowledgePage(
    await fixture("github-public"),
    pageUrl,
  );
  assert.equal(parsed.ok, true);
  assert.deepEqual(JSON.parse(JSON.stringify(parsed.repository)), {
    owner: "example",
    repository: "project",
    file_path: null,
    issue_number: 12,
    pull_request_number: null,
    visibility: "public",
  });
  assert.equal(parsed.page_type, "issue");
  assert.equal(JSON.stringify(parsed).includes("Issue body"), false);
  assert.equal(JSON.stringify(parsed).includes("code body"), false);
});

test("fails closed for private or ambiguous GitHub repositories", async () => {
  const parsed = parser.parseKnowledgePage(
    await fixture("github-private"),
    "https://github.com/private-owner/private-repo",
  );
  assert.equal(parsed.ok, false);
  assert.equal(parsed.code, "private_or_ambiguous_repo");
  assert.equal(JSON.stringify(parsed).includes("Private repository"), false);
});

test("extracts docs, package, and Wikipedia headings without page text", async () => {
  const examples = [
    [
      "mdn",
      "https://developer.mozilla.org/en-US/docs/Web/API/URL",
      "documentation",
      null,
    ],
    [
      "npm",
      "https://www.npmjs.com/package/synthetic-package",
      "package",
      "synthetic-package",
    ],
    [
      "wikipedia",
      "https://en.wikipedia.org/wiki/Knowledge_worker",
      "article",
      null,
    ],
  ];
  for (const [name, pageUrl, pageType, packageName] of examples) {
    const parsed = parser.parseKnowledgePage(await fixture(name), pageUrl);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.page_type, pageType);
    assert.equal(parsed.package_name, packageName);
    assert.equal(parsed.headings.length > 0, true);
    assert.equal(JSON.stringify(parsed).includes("Full "), false);
    assert.equal(JSON.stringify(parsed).includes("README body"), false);
  }
});

test("unknown and malformed pages fail safely", async () => {
  assert.equal(
    parser.parseKnowledgePage(
      await fixture("malformed"),
      "https://example.com/",
    ).code,
    "unsupported_knowledge_page",
  );
  assert.equal(
    parser.parseKnowledgePage(
      await fixture("malformed"),
      "https://developer.mozilla.org/en-US/docs/Test",
    ).code,
    "knowledge_root_missing",
  );
});
