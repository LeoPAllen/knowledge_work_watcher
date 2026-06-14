import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeSearchResultUrl,
  sanitizeSensitiveText,
} from "../src/shared/sensitive-data.mjs";

test("redacts sensitive text before applying the storage cap", () => {
  const result = sanitizeSensitiveText(
    `Email person@example.test token=synthetic-secret ${"x".repeat(20)}`,
    50,
  );
  assert.equal(result.redaction_applied, true);
  assert.equal(result.truncated, true);
  assert.equal(result.char_count_stored, 50);
  assert.doesNotMatch(result.text, /person@example|synthetic-secret/);
});

test("normalizes full URLs and removes tracking and credential parameters", () => {
  assert.equal(
    normalizeSearchResultUrl(
      "https://developer.mozilla.org/docs?utm_source=x&lang=en&auth_token=secret#part",
    ),
    "https://developer.mozilla.org/docs?lang=en",
  );
  assert.equal(
    normalizeSearchResultUrl("https://user:pass@example.com/private"),
    null,
  );
  assert.equal(normalizeSearchResultUrl("javascript:alert(1)"), null);
});
