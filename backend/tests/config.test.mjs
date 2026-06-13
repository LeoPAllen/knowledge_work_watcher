import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_MAX_PAYLOAD_BYTES,
  loadConfig,
} from "../src/config.mjs";

test("loads safe local defaults and environment overrides", () => {
  const defaults = loadConfig({
    KWW_STUDY_TOKEN: "synthetic-token-value",
  });
  assert.equal(defaults.host, "127.0.0.1");
  assert.equal(defaults.port, 3000);
  assert.equal(defaults.maxPayloadBytes, DEFAULT_MAX_PAYLOAD_BYTES);
  assert.equal(defaults.corsAllowedOrigin, null);

  const configured = loadConfig({
    KWW_STUDY_TOKEN: "synthetic-token-value",
    KWW_BIND_HOST: "0.0.0.0",
    KWW_PORT: "3100",
    KWW_STORAGE_PATH: "/tmp/synthetic-events.sqlite",
    KWW_MAX_PAYLOAD_BYTES: "4096",
    KWW_CORS_ALLOWED_ORIGIN: "chrome-extension://synthetic-extension-id",
  });
  assert.equal(configured.host, "0.0.0.0");
  assert.equal(configured.port, 3100);
  assert.equal(configured.storagePath, "/tmp/synthetic-events.sqlite");
  assert.equal(configured.maxPayloadBytes, 4096);
});

test("requires a study token and validates configuration limits", () => {
  assert.throws(() => loadConfig({}), /KWW_STUDY_TOKEN/);
  assert.throws(
    () => loadConfig({ KWW_STUDY_TOKEN: "short" }),
    /at least 16 characters/,
  );
  assert.throws(
    () =>
      loadConfig({
        KWW_STUDY_TOKEN: "synthetic-token-value",
        KWW_PORT: "70000",
      }),
    /KWW_PORT/,
  );
  assert.throws(
    () =>
      loadConfig({
        KWW_STUDY_TOKEN: "synthetic-token-value",
        KWW_MAX_PAYLOAD_BYTES: "100",
      }),
    /KWW_MAX_PAYLOAD_BYTES/,
  );
  assert.throws(
    () =>
      loadConfig({
        KWW_STUDY_TOKEN: "synthetic-token-value",
        KWW_CORS_ALLOWED_ORIGIN: "https://example.test",
      }),
    /chrome-extension/,
  );
});
