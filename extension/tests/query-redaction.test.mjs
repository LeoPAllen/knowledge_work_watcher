import test from "node:test";
import assert from "node:assert/strict";

import { redactSearchQuery } from "../src/shared/query-redaction.mjs";

test("retains ordinary normalized synthetic queries", () => {
  assert.deepEqual(redactSearchQuery("  knowledge   work tools "), {
    query: "knowledge work tools",
    redacted: false,
    reason: null,
  });
});

test("redacts emails, phone numbers, and obvious secrets", () => {
  const examples = [
    ["contact person@example.test", "email"],
    ["call +1 (202) 555-0100", "phone"],
    ["api_key=synthetic-secret-value", "secret"],
    ["sk-synthetic123456789", "secret"],
  ];
  for (const [query, reason] of examples) {
    assert.deepEqual(redactSearchQuery(query), {
      query: null,
      redacted: true,
      reason,
    });
  }
});
