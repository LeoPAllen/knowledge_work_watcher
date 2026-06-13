import test from "node:test";
import assert from "node:assert/strict";

import { createNavigationTelemetry } from "../src/background/navigation-telemetry.mjs";

function createHarness(overrides = {}) {
  const events = [];
  let context = {
    capture_status: "active",
    participant_id_hash: "a".repeat(64),
    session_id: "session-1",
    allowlist: [],
    ...overrides,
  };
  const telemetry = createNavigationTelemetry({
    stateController: {
      async getTelemetryContext() {
        return structuredClone(context);
      },
    },
    queue: {
      async append(event) {
        events.push(structuredClone(event));
      },
    },
    extensionVersion: "0.1.0",
    getWindowId: async () => 2,
    hashUrl: async () => "b".repeat(64),
    pseudonymize: async (_session, kind, value) =>
      `${kind}_${String(value).repeat(64).slice(0, 64)}`,
  });
  return {
    events,
    telemetry,
    setContext(next) {
      context = { ...context, ...next };
    },
  };
}

const allowedNavigation = {
  frameId: 0,
  tabId: 1,
  url: "https://en.wikipedia.org/wiki/Knowledge_worker?secret=query#private",
  timeStamp: 100,
  transitionType: "link",
  transitionQualifiers: ["forward_back"],
};

test("does not capture when consent state is off or paused", async () => {
  for (const captureStatus of ["off", "paused"]) {
    const { events, telemetry } = createHarness({
      capture_status: captureStatus,
      session_id: captureStatus === "off" ? null : "session-1",
    });
    await telemetry.onNavigationCommitted(allowedNavigation);
    assert.deepEqual(events, []);
  }
});

test("captures minimized allowlisted navigation and structural events", async () => {
  const { events, telemetry } = createHarness();
  await telemetry.onTabCreated({ id: 1, windowId: 2 });
  await telemetry.onNavigationCommitted(allowedNavigation);
  await telemetry.onTabActivated({ tabId: 1, windowId: 2 });
  await telemetry.onTabUpdated(1, { status: "complete" });

  assert.deepEqual(
    events.map((event) => event.event_type),
    ["tab_created", "navigation_committed", "tab_activated", "tab_updated"],
  );
  const navigation = events[1];
  assert.equal(navigation.payload.hostname, "en.wikipedia.org");
  assert.equal(navigation.payload.url_hash, "b".repeat(64));
  assert.equal(navigation.payload.tab_id, `tab_${"1".repeat(64)}`);
  assert.equal(navigation.payload.window_id, `window_${"2".repeat(64)}`);
  assert.equal(navigation.payload.transition_type, "link");
  assert.equal(JSON.stringify(events).includes("secret"), false);
  assert.equal(JSON.stringify(events).includes("Knowledge_worker"), false);
});

test("records window focus only when an allowed active tab is known", async () => {
  const { events, telemetry } = createHarness();
  await telemetry.onWindowFocusChanged(2);
  await telemetry.onNavigationCommitted(allowedNavigation);
  await telemetry.onTabActivated({ tabId: 1, windowId: 2 });
  await telemetry.onWindowFocusChanged(2);
  await telemetry.onWindowFocusChanged(-1);

  assert.deepEqual(
    events.map((event) => event.event_type),
    [
      "navigation_committed",
      "tab_activated",
      "window_focus_changed",
      "window_focus_changed",
    ],
  );
  assert.deepEqual(
    events.slice(-2).map((event) => event.payload.focused),
    [true, false],
  );
});

test("denied and unknown URLs produce URL-free skip events", async () => {
  const examples = [
    ["https://mail.google.com/mail/u/0/", "denied", "webmail"],
    ["https://public.example/private/path?q=secret", "unsupported", null],
  ];

  for (const [url, classification, category] of examples) {
    const { events, telemetry } = createHarness();
    await telemetry.onNavigationCommitted({ ...allowedNavigation, url });
    assert.equal(events.length, 1);
    assert.equal(events[0].event_type, "capture_skipped");
    assert.deepEqual(events[0].payload, {
      signal_type: "navigation_committed",
      classification,
      reason:
        classification === "denied" ? "denied_domain" : "not_allowlisted",
      category,
    });
    assert.equal(JSON.stringify(events).includes(url), false);
    assert.equal(JSON.stringify(events).includes("secret"), false);
  }
});

test("invalid URLs fail closed without leaking input", async () => {
  const { events, telemetry } = createHarness();
  await telemetry.onNavigationCommitted({
    ...allowedNavigation,
    url: "participant-secret",
  });

  assert.equal(events[0].payload.classification, "invalid");
  assert.equal(JSON.stringify(events).includes("participant-secret"), false);
});

test("ignores subframe navigation", async () => {
  const { events, telemetry } = createHarness();
  await telemetry.onNavigationCommitted({ ...allowedNavigation, frameId: 1 });
  assert.deepEqual(events, []);
});

test("revoked state takes effect between browser signals", async () => {
  const { events, telemetry, setContext } = createHarness();
  await telemetry.onNavigationCommitted(allowedNavigation);
  setContext({ capture_status: "off", session_id: null });
  await telemetry.onTabActivated({ tabId: 1, windowId: 2 });
  assert.equal(events.length, 1);
});

test("does not reuse tab context across ambient sessions", async () => {
  const { events, telemetry, setContext } = createHarness();
  await telemetry.onNavigationCommitted(allowedNavigation);
  setContext({ session_id: "session-2" });
  await telemetry.onTabActivated({ tabId: 1, windowId: 2 });
  assert.equal(events.length, 1);
});

test("does not append when capture is revoked during URL minimization", async () => {
  const events = [];
  let active = true;
  const telemetry = createNavigationTelemetry({
    stateController: {
      async getTelemetryContext() {
        return {
          capture_status: active ? "active" : "off",
          participant_id_hash: "a".repeat(64),
          session_id: active ? "session-1" : null,
          allowlist: [],
        };
      },
    },
    queue: {
      async append(event) {
        events.push(event);
      },
    },
    extensionVersion: "0.1.0",
    getWindowId: async () => 2,
    hashUrl: async () => {
      active = false;
      return "b".repeat(64);
    },
    pseudonymize: async (_session, kind, value) =>
      `${kind}_${String(value).repeat(64).slice(0, 64)}`,
  });

  await telemetry.onNavigationCommitted(allowedNavigation);
  assert.deepEqual(events, []);
});
