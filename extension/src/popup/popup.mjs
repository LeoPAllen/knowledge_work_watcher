const consentStatus = document.querySelector("#consent-status");
const captureStatus = document.querySelector("#capture-status");
const consentDot = document.querySelector("#consent-dot");
const captureDot = document.querySelector("#capture-dot");
const captureAction = document.querySelector("#capture-action");
const feedback = document.querySelector("#popup-status");

async function send(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) {
    throw new Error(response?.error ?? "Extension state request failed");
  }
  return response.state;
}

function render(state) {
  consentStatus.textContent = state.consent_accepted ? "Accepted" : "Not accepted";
  consentDot.dataset.state = state.consent_accepted ? "active" : "off";

  const labels = { active: "Active", paused: "Paused", off: "Off" };
  captureStatus.textContent = labels[state.capture_status];
  captureDot.dataset.state = state.capture_status;

  captureAction.hidden = state.capture_status === "off";
  if (state.capture_status === "active") {
    captureAction.textContent = "Pause capture";
    captureAction.dataset.action = "pause";
  } else if (state.capture_status === "paused") {
    captureAction.textContent = "Resume capture";
    captureAction.dataset.action = "resume";
  }
}

captureAction.addEventListener("click", async () => {
  captureAction.disabled = true;
  feedback.textContent = "";
  try {
    const action = captureAction.dataset.action;
    const state = await send({
      type: action === "pause" ? "pause_capture" : "resume_capture",
    });
    render(state);
    feedback.textContent =
      action === "pause" ? "Capture paused." : "Capture resumed.";
  } catch {
    feedback.textContent = "Could not update capture state.";
  } finally {
    captureAction.disabled = false;
  }
});

document.querySelector("#open-options").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

send({ type: "get_state" })
  .then(render)
  .catch(() => {
    consentStatus.textContent = "Unavailable";
    captureStatus.textContent = "Unavailable";
    feedback.textContent = "Could not read extension state.";
  });
