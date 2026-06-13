import { createEvent } from "../shared/event-schema.mjs";
import { createLocalQueue } from "../shared/local-queue.mjs";
import { createChromeStorageAdapter } from "../shared/storage.mjs";

const queue = createLocalQueue(createChromeStorageAdapter());

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  try {
    const event = createEvent({
      eventType: "extension_installed",
      extensionVersion: chrome.runtime.getManifest().version,
      captureMode: "off",
      source: "service_worker",
      payload: { reason },
    });

    await queue.append(event);
    console.info("Knowledge Work Watcher installation event queued locally.");
  } catch {
    console.error("Knowledge Work Watcher could not queue installation metadata.");
  }
});

console.info("Knowledge Work Watcher service worker initialized; capture is off.");
