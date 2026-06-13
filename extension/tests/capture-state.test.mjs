import test from "node:test";
import assert from "node:assert/strict";

import {
  createCaptureStateController,
  getCaptureStatus,
} from "../src/shared/capture-state.mjs";
import { createMemoryStateStorage } from "../src/shared/config-storage.mjs";

function createRecordingQueue({ fail = false } = {}) {
  const events = [];
  return {
    events,
    async append(event) {
      if (fail) {
        throw new Error("queue unavailable");
      }
      events.push(structuredClone(event));
    },
  };
}

function createController(storage, queue = createRecordingQueue()) {
  return {
    controller: createCaptureStateController({
      storage,
      queue,
      extensionVersion: "0.1.0",
      createSessionId: () => "session-1",
    }),
    queue,
  };
}

test("defaults to not consented with capture off", async () => {
  const { controller } = createController(createMemoryStateStorage());
  const state = await controller.getState();

  assert.equal(state.consent_accepted, false);
  assert.equal(state.ambient_enabled, false);
  assert.equal(state.paused, false);
  assert.equal(state.capture_status, "off");
  assert.equal(state.upload_enabled, false);
  assert.equal(state.study_auth_token_configured, false);
});

test("cannot enable ambient capture before consent", async () => {
  const { controller } = createController(createMemoryStateStorage());

  await assert.rejects(
    controller.setAmbientEnabled(true),
    /consent is required/,
  );
  assert.equal((await controller.getState()).capture_status, "off");
});

test("queues pause and resume events with matching capture modes", async () => {
  const { controller, queue } = createController(createMemoryStateStorage());

  await controller.setConsent(true);
  await controller.setAmbientEnabled(true);
  assert.equal((await controller.getState()).capture_status, "active");

  await controller.pause();
  assert.equal((await controller.getState()).capture_status, "paused");

  await controller.resume();
  assert.equal((await controller.getState()).capture_status, "active");

  assert.deepEqual(
    queue.events.map((event) => [event.event_type, event.capture_mode]),
    [
      ["consent_changed", "off"],
      ["capture_paused", "paused"],
      ["capture_resumed", "ambient"],
    ],
  );
});

test("revoking consent disables capture and queues consent change", async () => {
  const storage = createMemoryStateStorage();
  const { controller, queue } = createController(storage);

  await controller.setConsent(true);
  await controller.updateConfig({
    study_auth_token: "synthetic-study-token",
    upload_enabled: true,
  });
  await controller.setAmbientEnabled(true);
  const state = await controller.setConsent(false);
  const stored = await storage.read();

  assert.equal(state.capture_status, "off");
  assert.equal(stored.consent_accepted, false);
  assert.equal(stored.ambient_enabled, false);
  assert.equal(stored.paused, false);
  assert.equal(stored.upload_enabled, false);
  assert.equal(stored.session_id, null);
  assert.deepEqual(queue.events.at(-1).payload, { consent_granted: false });
});

test("keeps study tokens private while exposing upload readiness", async () => {
  const { controller } = createController(createMemoryStateStorage());
  const state = await controller.updateConfig({
    study_server_url: "http://localhost:3000",
    study_auth_token: "synthetic-study-token",
    upload_enabled: true,
  });

  assert.equal(state.study_server_url, "http://localhost:3000");
  assert.equal(state.study_auth_token_configured, true);
  assert.equal(state.upload_enabled, true);
  assert.equal("study_auth_token" in state, false);
  assert.equal(
    (await controller.getUploadContext()).study_auth_token,
    "synthetic-study-token",
  );
});

test("state persists across controller recreation", async () => {
  const storage = createMemoryStateStorage();
  const first = createController(storage).controller;

  await first.updateConfig({
    participant_id_hash: "a".repeat(64),
    study_server_url: "https://study.invalid",
    allowlist: ["example.invalid"],
    debug_mode: true,
  });
  await first.setConsent(true);
  await first.setAmbientEnabled(true);
  await first.pause();

  const second = createController(storage).controller;
  const state = await second.getState();

  assert.equal(state.participant_id_configured, true);
  assert.equal(state.study_server_url, "https://study.invalid");
  assert.deepEqual(state.allowlist, ["example.invalid"]);
  assert.equal(state.debug_mode, true);
  assert.equal(state.capture_status, "paused");
});

test("telemetry context exposes gates and pseudonymous identifiers only", async () => {
  const storage = createMemoryStateStorage();
  const { controller } = createController(storage);
  await controller.updateConfig({
    participant_id_hash: "c".repeat(64),
    allowlist: ["example.invalid"],
  });
  await controller.setConsent(true);
  await controller.setAmbientEnabled(true);

  assert.deepEqual(await controller.getTelemetryContext(), {
    capture_status: "active",
    participant_id_hash: "c".repeat(64),
    session_id: "session-1",
    allowlist: ["example.invalid"],
  });
});

test("rejects unsafe study server URLs", async () => {
  const { controller } = createController(createMemoryStateStorage());

  await assert.rejects(
    controller.updateConfig({
      study_server_url: "https://user:secret@study.invalid",
    }),
    /HTTPS origin or an HTTP loopback origin/,
  );
});

test("allows the participant hash to be removed locally", async () => {
  const storage = createMemoryStateStorage();
  const { controller } = createController(storage);

  await controller.updateConfig({ participant_id_hash: "b".repeat(64) });
  const state = await controller.updateConfig({ participant_id_hash: null });

  assert.equal(state.participant_id_configured, false);
  assert.equal((await storage.read()).participant_id_hash, null);
});

test("privacy-stop state persists even when event logging fails", async () => {
  const storage = createMemoryStateStorage();
  const working = createController(storage).controller;
  await working.setConsent(true);
  await working.setAmbientEnabled(true);

  const failing = createController(
    storage,
    createRecordingQueue({ fail: true }),
  ).controller;
  const paused = await failing.pause();
  const revoked = await failing.setConsent(false);

  assert.equal(paused.capture_status, "paused");
  assert.equal(paused.event_logging_failed, true);
  assert.equal(revoked.capture_status, "off");
  assert.equal(revoked.event_logging_failed, true);
  assert.equal((await storage.read()).consent_accepted, false);
});

test("capture status is derived from consent, ambient, and pause flags", () => {
  assert.equal(
    getCaptureStatus({
      consent_accepted: true,
      ambient_enabled: true,
      paused: false,
    }),
    "active",
  );
  assert.equal(
    getCaptureStatus({
      consent_accepted: true,
      ambient_enabled: true,
      paused: true,
    }),
    "paused",
  );
});
