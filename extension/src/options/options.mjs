import { createEvent } from "../shared/event-schema.mjs";
import { createLocalQueue } from "../shared/local-queue.mjs";
import { hashParticipantId } from "../shared/participant-id.mjs";
import { createChromeStorageAdapter } from "../shared/storage.mjs";

const queue = createLocalQueue(createChromeStorageAdapter());
const countElement = document.querySelector("#queue-count");
const debugStatus = document.querySelector("#debug-status");
const pageStatus = document.querySelector("#options-status");
const participantInput = document.querySelector("#participant-id");
const participantStatus = document.querySelector("#participant-status");
const clearParticipantButton = document.querySelector("#clear-participant");
const serverUrlInput = document.querySelector("#server-url");
const allowlistInput = document.querySelector("#allowlist");
const debugModeInput = document.querySelector("#debug-mode");
const consentStatus = document.querySelector("#consent-status");
const ambientInput = document.querySelector("#ambient-enabled");
const captureStatus = document.querySelector("#capture-status");
const pauseResumeButton = document.querySelector("#pause-resume");
const acceptButton = document.querySelector("#accept-consent");
const revokeButton = document.querySelector("#revoke-consent");
const createTestButton = document.querySelector("#create-test-event");

async function send(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) {
    throw new Error(response?.error ?? "Extension state request failed");
  }
  return response.state;
}

function renderState(state) {
  participantStatus.textContent = state.participant_id_configured
    ? "Configured; enter a new value only to replace it"
    : "Not configured";
  clearParticipantButton.disabled = !state.participant_id_configured;
  serverUrlInput.value = state.study_server_url;
  allowlistInput.value = state.allowlist.join("\n");
  debugModeInput.checked = state.debug_mode;
  createTestButton.disabled = !state.debug_mode;
  consentStatus.textContent = state.consent_accepted ? "Accepted" : "Not accepted";
  acceptButton.disabled = state.consent_accepted;
  revokeButton.disabled = !state.consent_accepted;
  ambientInput.checked = state.ambient_enabled;
  ambientInput.disabled = !state.consent_accepted;

  const labels = { active: "Active", paused: "Paused", off: "Off" };
  captureStatus.textContent = labels[state.capture_status];
  pauseResumeButton.hidden = state.capture_status === "off";
  pauseResumeButton.textContent =
    state.capture_status === "paused" ? "Resume capture" : "Pause capture";
  pauseResumeButton.dataset.action =
    state.capture_status === "paused" ? "resume" : "pause";

  if (state.event_logging_failed) {
    pageStatus.textContent =
      "State changed, but the local event could not be queued.";
  }
}

async function refreshCount() {
  const events = await queue.list();
  countElement.textContent = String(events.length);
  return events;
}

document
  .querySelector("#configuration-form")
  .addEventListener("submit", async (event) => {
    event.preventDefault();
    pageStatus.textContent = "";

    try {
      const changes = {
        study_server_url: serverUrlInput.value.trim(),
        allowlist: allowlistInput.value
          .split("\n")
          .map((domain) => domain.trim().toLowerCase())
          .filter(Boolean),
        debug_mode: debugModeInput.checked,
      };

      if (participantInput.value.trim()) {
        changes.participant_id_hash = await hashParticipantId(
          participantInput.value,
        );
      }

      const state = await send({ type: "update_config", changes });
      participantInput.value = "";
      renderState(state);
      await refreshCount();
      pageStatus.textContent ||= "Local configuration saved.";
    } catch {
      pageStatus.textContent = "Could not save local configuration.";
    }
  });

clearParticipantButton.addEventListener("click", async () => {
  pageStatus.textContent = "";
  try {
    const state = await send({
      type: "update_config",
      changes: { participant_id_hash: null },
    });
    participantInput.value = "";
    renderState(state);
    await refreshCount();
    pageStatus.textContent ||= "Participant ID removed from local state.";
  } catch {
    pageStatus.textContent = "Could not clear the participant ID.";
  }
});

acceptButton.addEventListener("click", async () => {
  pageStatus.textContent = "";
  try {
    renderState(await send({ type: "set_consent", accepted: true }));
    await refreshCount();
    pageStatus.textContent ||= "Placeholder consent accepted locally.";
  } catch {
    pageStatus.textContent = "Could not update consent.";
  }
});

revokeButton.addEventListener("click", async () => {
  if (!window.confirm("Revoke consent and stop ambient capture locally?")) {
    return;
  }

  pageStatus.textContent = "";
  try {
    renderState(await send({ type: "set_consent", accepted: false }));
    await refreshCount();
    pageStatus.textContent ||= "Consent revoked; ambient capture is off.";
  } catch {
    pageStatus.textContent = "Could not revoke consent.";
  }
});

ambientInput.addEventListener("change", async () => {
  pageStatus.textContent = "";
  try {
    renderState(
      await send({ type: "set_ambient", enabled: ambientInput.checked }),
    );
    pageStatus.textContent = ambientInput.checked
      ? "Ambient capture state enabled. No browsing data is collected."
      : "Ambient capture state disabled.";
  } catch {
    try {
      renderState(await send({ type: "get_state" }));
    } catch {
      // Keep the error message useful even when state cannot be re-read.
    }
    pageStatus.textContent = "Could not update ambient capture state.";
  }
});

pauseResumeButton.addEventListener("click", async () => {
  pageStatus.textContent = "";
  try {
    const action = pauseResumeButton.dataset.action;
    renderState(
      await send({
        type: action === "pause" ? "pause_capture" : "resume_capture",
        source: "options",
      }),
    );
    await refreshCount();
    pageStatus.textContent ||=
      action === "pause" ? "Capture paused." : "Capture resumed.";
  } catch {
    pageStatus.textContent = "Could not update capture state.";
  }
});

createTestButton.addEventListener("click", async () => {
  try {
    const state = await send({ type: "get_state" });
    const event = createEvent({
      eventType: "queue_test_event",
      extensionVersion: chrome.runtime.getManifest().version,
      captureMode:
        state.capture_status === "active" ? "ambient" : state.capture_status,
      source: "debug",
      payload: { synthetic: true },
    });
    await queue.append(event);
    await refreshCount();
    debugStatus.textContent = "Synthetic test event added.";
  } catch {
    debugStatus.textContent = "Could not add the synthetic test event.";
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
    debugStatus.textContent = `Exported ${events.length} queued event(s).`;
  } catch {
    debugStatus.textContent = "Could not export the local queue.";
  }
});

document.querySelector("#clear-events").addEventListener("click", async () => {
  if (!window.confirm("Clear all locally queued events?")) {
    return;
  }

  try {
    await queue.clear();
    await refreshCount();
    debugStatus.textContent = "Local event queue cleared.";
  } catch {
    debugStatus.textContent = "Could not clear the local queue.";
  }
});

Promise.all([send({ type: "get_state" }), refreshCount()])
  .then(([state]) => renderState(state))
  .catch(() => {
    countElement.textContent = "Unavailable";
    pageStatus.textContent = "Could not read local extension state.";
  });
