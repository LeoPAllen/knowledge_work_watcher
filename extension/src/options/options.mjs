import { hashParticipantId } from "../shared/participant-id.mjs";
import { permissionPatternForServer } from "../shared/upload-policy.mjs";

const countElement = document.querySelector("#queue-count");
const deadLetterCount = document.querySelector("#dead-letter-count");
const debugStatus = document.querySelector("#debug-status");
const pageStatus = document.querySelector("#options-status");
const participantInput = document.querySelector("#participant-id");
const participantStatus = document.querySelector("#participant-status");
const clearParticipantButton = document.querySelector("#clear-participant");
const serverUrlInput = document.querySelector("#server-url");
const authTokenInput = document.querySelector("#auth-token");
const authTokenStatus = document.querySelector("#auth-token-status");
const clearAuthTokenButton = document.querySelector("#clear-auth-token");
const uploadEnabledInput = document.querySelector("#upload-enabled");
const uploadStatus = document.querySelector("#upload-status");
const syncNowButton = document.querySelector("#sync-now");
const allowlistInput = document.querySelector("#allowlist");
const debugModeInput = document.querySelector("#debug-mode");
const consentStatus = document.querySelector("#consent-status");
const ambientInput = document.querySelector("#ambient-enabled");
const captureStatus = document.querySelector("#capture-status");
const pauseResumeButton = document.querySelector("#pause-resume");
const acceptButton = document.querySelector("#accept-consent");
const revokeButton = document.querySelector("#revoke-consent");
const createTestButton = document.querySelector("#create-test-event");
let currentState = null;

async function send(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) {
    throw new Error(response?.error ?? "Extension state request failed");
  }
  return response;
}

function renderState(state) {
  currentState = state;
  participantStatus.textContent = state.participant_id_configured
    ? "Configured; enter a new value only to replace it"
    : "Not configured";
  clearParticipantButton.disabled = !state.participant_id_configured;
  serverUrlInput.value = state.study_server_url;
  authTokenStatus.textContent = state.study_auth_token_configured
    ? "Configured; enter a new value only to replace it"
    : "Not configured";
  clearAuthTokenButton.disabled = !state.study_auth_token_configured;
  uploadEnabledInput.checked = state.upload_enabled;
  uploadEnabledInput.disabled = !state.consent_accepted;
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

function renderSync(sync) {
  const labels = {
    blocked: "Blocked by capture state",
    disabled: "Local only",
    error: "Needs attention",
    idle: "Idle",
    retry_wait: "Retry scheduled",
    succeeded: "Up to date",
    syncing: "Uploading",
  };
  uploadStatus.textContent = labels[sync.status] ?? "Unknown";
  if (sync.last_error) {
    uploadStatus.textContent += ` (${sync.last_error})`;
  }
  countElement.textContent = String(sync.queued_count);
  deadLetterCount.textContent = String(sync.dead_letter_count);
  syncNowButton.disabled =
    !currentState?.upload_enabled ||
    currentState.capture_status !== "active" ||
    !currentState.study_server_url ||
    !currentState.study_auth_token_configured ||
    sync.status === "syncing";
}

async function refreshCount() {
  const { events } = await send({ type: "list_events" });
  countElement.textContent = String(events.length);
  return events;
}

async function refreshDashboard() {
  const dashboard = await send({ type: "get_dashboard" });
  renderState(dashboard.state);
  renderSync(dashboard.sync);
  return dashboard;
}

document
  .querySelector("#configuration-form")
  .addEventListener("submit", async (event) => {
    event.preventDefault();
    pageStatus.textContent = "";

    try {
      const changes = {
        study_server_url: serverUrlInput.value.trim(),
        upload_enabled: uploadEnabledInput.checked,
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
      if (authTokenInput.value) {
        changes.study_auth_token = authTokenInput.value;
      }
      if (
        changes.upload_enabled &&
        !authTokenInput.value &&
        !currentState?.study_auth_token_configured
      ) {
        throw new Error("Study token is required");
      }

      const newPermission = changes.study_server_url
        ? permissionPatternForServer(changes.study_server_url)
        : null;
      const oldPermission = currentState?.study_server_url
        ? permissionPatternForServer(currentState.study_server_url)
        : null;
      if (
        changes.upload_enabled &&
        newPermission &&
        !(await chrome.permissions.request({ origins: [newPermission] }))
      ) {
        throw new Error("Server permission was not granted");
      }

      const { state } = await send({ type: "update_config", changes });
      if (
        oldPermission &&
        (!changes.upload_enabled || oldPermission !== newPermission)
      ) {
        await chrome.permissions.remove({ origins: [oldPermission] });
      }
      participantInput.value = "";
      authTokenInput.value = "";
      renderState(state);
      const { sync } = await send({ type: "get_dashboard" });
      renderSync(sync);
      pageStatus.textContent ||= state.upload_enabled
        ? "Configuration saved; upload is enabled."
        : "Configuration saved in local-only mode.";
    } catch {
      pageStatus.textContent = "Could not save local configuration.";
    }
  });

clearParticipantButton.addEventListener("click", async () => {
  pageStatus.textContent = "";
  try {
    const { state } = await send({
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
    renderState((await send({ type: "set_consent", accepted: true })).state);
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
    const permission = currentState?.study_server_url
      ? permissionPatternForServer(currentState.study_server_url)
      : null;
    renderState((await send({ type: "set_consent", accepted: false })).state);
    if (permission) {
      await chrome.permissions.remove({ origins: [permission] });
    }
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
      (await send({ type: "set_ambient", enabled: ambientInput.checked })).state,
    );
    pageStatus.textContent = ambientInput.checked
      ? "Ambient capture enabled; approved telemetry may be queued."
      : "Ambient capture state disabled.";
  } catch {
    try {
      renderState((await send({ type: "get_state" })).state);
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
      (await send({
        type: action === "pause" ? "pause_capture" : "resume_capture",
        source: "options",
      })).state,
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
    const { sync } = await send({ type: "create_test_event" });
    renderSync(sync);
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
    const { sync } = await send({ type: "clear_events" });
    renderSync(sync);
    debugStatus.textContent = "Local event queue cleared.";
  } catch {
    debugStatus.textContent = "Could not clear the local queue.";
  }
});

clearAuthTokenButton.addEventListener("click", async () => {
  pageStatus.textContent = "";
  try {
    const permission = currentState?.study_server_url
      ? permissionPatternForServer(currentState.study_server_url)
      : null;
    const { state } = await send({
      type: "update_config",
      changes: { study_auth_token: "", upload_enabled: false },
    });
    if (permission) {
      await chrome.permissions.remove({ origins: [permission] });
    }
    authTokenInput.value = "";
    renderState(state);
    renderSync((await send({ type: "get_dashboard" })).sync);
    pageStatus.textContent = "Study token removed; upload is disabled.";
  } catch {
    pageStatus.textContent = "Could not remove the study token.";
  }
});

syncNowButton.addEventListener("click", async () => {
  debugStatus.textContent = "Uploading queued events...";
  syncNowButton.disabled = true;
  try {
    renderSync((await send({ type: "sync_now" })).sync);
    debugStatus.textContent = "Upload attempt completed.";
  } catch {
    debugStatus.textContent = "Upload attempt failed safely.";
    await refreshDashboard();
  }
});

document
  .querySelector("#export-dead-letters")
  .addEventListener("click", async () => {
    try {
      const { dead_letters: records } = await send({
        type: "list_dead_letters",
      });
      const blob = new Blob([JSON.stringify(records, null, 2)], {
        type: "application/json",
      });
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = "knowledge-work-watcher-rejected-events.json";
      link.hidden = true;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);
      debugStatus.textContent = `Exported ${records.length} rejection record(s).`;
    } catch {
      debugStatus.textContent = "Could not export rejection records.";
    }
  });

document
  .querySelector("#clear-dead-letters")
  .addEventListener("click", async () => {
    if (!window.confirm("Clear all local rejection records?")) {
      return;
    }
    try {
      renderSync((await send({ type: "clear_dead_letters" })).sync);
      debugStatus.textContent = "Rejection records cleared.";
    } catch {
      debugStatus.textContent = "Could not clear rejection records.";
    }
  });

refreshDashboard()
  .catch(() => {
    countElement.textContent = "Unavailable";
    deadLetterCount.textContent = "Unavailable";
    pageStatus.textContent = "Could not read local extension state.";
  });
