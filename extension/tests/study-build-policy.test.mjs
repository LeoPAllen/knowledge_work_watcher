import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  expandedCaptureEnabled,
  STUDY_BUILD_POLICY,
} from "../src/shared/study-build-policy.mjs";

test("study build always enables all expanded fields for active configured capture", () => {
  assert.deepEqual(STUDY_BUILD_POLICY, {
    capture_profile: "study_expanded",
    llm_response_text: true,
    search_snippets: true,
    search_full_urls: true,
  });
  assert.equal(
    expandedCaptureEnabled({
      capture_status: "active",
      participant_id_hash: "a".repeat(64),
      session_id: "session-1",
    }),
    true,
  );
  for (const capture_status of ["off", "paused"]) {
    assert.equal(
      expandedCaptureEnabled({
        capture_status,
        participant_id_hash: "a".repeat(64),
        session_id: "session-1",
      }),
      false,
    );
  }
  assert.equal(
    expandedCaptureEnabled({
      capture_status: "active",
      participant_id_hash: null,
      session_id: "session-1",
    }),
    false,
  );
});

test("popup and options contain disclosure but no granular sensitive toggles", async () => {
  const ui = `${await readFile("extension/src/options/options.html", "utf8")}
${await readFile("extension/src/popup/popup.html", "utf8")}`;
  assert.match(ui, /Study build captures LLM assistant response text/i);
  assert.match(ui, /external study consent flow/i);
  assert.doesNotMatch(
    ui,
    /id="(?:capture-)?(?:llm-response|search-snippet|search-full-url)/i,
  );
});
