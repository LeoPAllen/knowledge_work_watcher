import test from "node:test";
import assert from "node:assert/strict";

import { hashParticipantId } from "../src/shared/participant-id.mjs";

test("hashes a normalized participant ID without retaining the raw value", async () => {
  const hash = await hashParticipantId("  participant-001  ");

  assert.equal(hash.length, 64);
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.equal(hash, await hashParticipantId("participant-001"));
  assert.equal(hash.includes("participant"), false);
});

test("rejects an empty participant ID", async () => {
  await assert.rejects(hashParticipantId("   "), /must not be empty/);
});
