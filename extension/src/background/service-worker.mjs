import { createEvent } from "../shared/event-schema.mjs";
import { createLocalQueue } from "../shared/local-queue.mjs";
import { createChromeStorageAdapter } from "../shared/storage.mjs";
import { createChromeStateStorage } from "../shared/config-storage.mjs";
import { createCaptureStateController } from "../shared/capture-state.mjs";

const queue = createLocalQueue(createChromeStorageAdapter());
const controller = createCaptureStateController({
  storage: createChromeStateStorage(),
  queue,
  extensionVersion: chrome.runtime.getManifest().version,
});

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  try {
    const state = await controller.getState();
    const event = createEvent({
      eventType: "extension_installed",
      extensionVersion: chrome.runtime.getManifest().version,
      captureMode:
        state.capture_status === "active" ? "ambient" : state.capture_status,
      source: "service_worker",
      payload: { reason },
    });

    await queue.append(event);
    console.info("Knowledge Work Watcher installation event queued locally.");
  } catch {
    console.error("Knowledge Work Watcher could not queue installation metadata.");
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const source = sender.url?.includes("/popup/") ? "popup" : "options";
  const actions = {
    get_state: () => controller.getState(),
    update_config: () => controller.updateConfig(message.changes, source),
    set_consent: () => controller.setConsent(message.accepted, source),
    set_ambient: () => controller.setAmbientEnabled(message.enabled, source),
    pause_capture: () => controller.pause(source),
    resume_capture: () => controller.resume(source),
  };
  const action = actions[message?.type];

  if (!action) {
    return false;
  }

  action()
    .then((state) => sendResponse({ ok: true, state }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});

console.info(
  "Knowledge Work Watcher state controller initialized; browsing capture is absent.",
);
