import assert from "node:assert/strict";
import test from "node:test";
import {
  batchEndpointForServer,
  normalizeStudyServerUrl,
  permissionPatternForServer,
} from "../src/shared/upload-policy.mjs";

test("requires HTTPS except for explicit loopback development hosts", () => {
  assert.equal(
    normalizeStudyServerUrl("https://study.example"),
    "https://study.example",
  );
  assert.equal(
    normalizeStudyServerUrl("http://localhost:3000"),
    "http://localhost:3000",
  );
  assert.equal(
    normalizeStudyServerUrl("http://127.0.0.1:3000/"),
    "http://127.0.0.1:3000",
  );
  assert.throws(
    () => normalizeStudyServerUrl("http://study.example"),
    /HTTPS origin/,
  );
  assert.throws(
    () => normalizeStudyServerUrl("https://study.example/path"),
    /HTTPS origin/,
  );
  assert.throws(
    () => normalizeStudyServerUrl("https://token@study.example"),
    /HTTPS origin/,
  );
});

test("derives exact runtime permission and batch endpoint", () => {
  assert.equal(
    permissionPatternForServer("https://study.example:8443"),
    "https://study.example/*",
  );
  assert.equal(
    permissionPatternForServer("http://localhost:3000"),
    "http://localhost/*",
  );
  assert.equal(
    batchEndpointForServer("https://study.example"),
    "https://study.example/v1/events/batch",
  );
});
