import { createEvent } from "../shared/event-schema.mjs";
import { createLocalQueue } from "../shared/local-queue.mjs";
import { createChromeStorageAdapter } from "../shared/storage.mjs";

const queue = createLocalQueue(createChromeStorageAdapter());
const countElement = document.querySelector("#queue-count");
const statusElement = document.querySelector("#debug-status");

function setStatus(message) {
  statusElement.textContent = message;
}

async function refreshCount() {
  const events = await queue.list();
  countElement.textContent = String(events.length);
  return events;
}

document.querySelector("#create-test-event").addEventListener("click", async () => {
  try {
    const event = createEvent({
      eventType: "queue_test_event",
      extensionVersion: chrome.runtime.getManifest().version,
      captureMode: "off",
      source: "debug",
      payload: { synthetic: true },
    });
    await queue.append(event);
    await refreshCount();
    setStatus("Synthetic test event added.");
  } catch {
    setStatus("Could not add the synthetic test event.");
  }
});

document.querySelector("#export-events").addEventListener("click", async () => {
  try {
    const events = await refreshCount();
    const blob = new Blob([JSON.stringify(events, null, 2)], {
      type: "application/json",
    });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = "knowledge-work-watcher-events.json";
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);
    setStatus(`Exported ${events.length} queued event(s).`);
  } catch {
    setStatus("Could not export the local queue.");
  }
});

document.querySelector("#clear-events").addEventListener("click", async () => {
  if (!window.confirm("Clear all locally queued events?")) {
    return;
  }

  try {
    await queue.clear();
    await refreshCount();
    setStatus("Local event queue cleared.");
  } catch {
    setStatus("Could not clear the local queue.");
  }
});

refreshCount().catch(() => {
  countElement.textContent = "Unavailable";
  setStatus("Could not read the local queue.");
});
