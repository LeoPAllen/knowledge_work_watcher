import { createEvent } from "../shared/event-schema.mjs";
import { createLocalQueue } from "../shared/local-queue.mjs";
import { createChromeStorageAdapter } from "../shared/storage.mjs";
import { createChromeStateStorage } from "../shared/config-storage.mjs";
import { createCaptureStateController } from "../shared/capture-state.mjs";
import { createNavigationTelemetry } from "./navigation-telemetry.mjs";
import { createSearchTelemetry } from "./search-telemetry.mjs";
import { createLlmTelemetry } from "./llm-telemetry.mjs";

const queue = createLocalQueue(createChromeStorageAdapter());
const extensionVersion = chrome.runtime.getManifest().version;
const controller = createCaptureStateController({
  storage: createChromeStateStorage(),
  queue,
  extensionVersion,
});
const telemetry = createNavigationTelemetry({
  stateController: controller,
  queue,
  extensionVersion,
  getWindowId: async (tabId) => (await chrome.tabs.get(tabId)).windowId,
});
const searchTelemetry = createSearchTelemetry({
  stateController: controller,
  queue,
  extensionVersion,
});
const llmTelemetry = createLlmTelemetry({
  stateController: controller,
  queue,
  extensionVersion,
});

function runTelemetry(handler) {
  handler().catch(() => {
    console.error("Knowledge Work Watcher could not process a telemetry signal.");
  });
}

chrome.tabs.onCreated.addListener((tab) => {
  runTelemetry(() => telemetry.onTabCreated(tab));
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  runTelemetry(() => telemetry.onTabActivated(activeInfo));
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  runTelemetry(() => telemetry.onTabUpdated(tabId, changeInfo));
});

chrome.webNavigation.onCommitted.addListener((details) => {
  runTelemetry(() => telemetry.onNavigationCommitted(details));
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  runTelemetry(() => telemetry.onWindowFocusChanged(windowId));
});

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  try {
    const state = await controller.getState();
    const event = createEvent({
      eventType: "extension_installed",
      extensionVersion,
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
  const searchActions = {
    get_capture_gate: async () => ({
      active: await searchTelemetry.isCaptureActive(),
    }),
    search_page_parsed: async () => {
      await searchTelemetry.onPageParsed(message.parsed, sender);
      return {};
    },
    search_result_clicked: async () => {
      await searchTelemetry.onResultClicked(message.clicked, sender);
      return {};
    },
    search_parser_error: async () => {
      await searchTelemetry.onParserError(message, sender);
      return {};
    },
    llm_page_parsed: async () => {
      await llmTelemetry.onPageParsed(message.parsed, sender);
      return {};
    },
    llm_parser_error: async () => {
      await llmTelemetry.onParserError(message, sender);
      return {};
    },
  };
  const searchAction = searchActions[message?.type];
  if (searchAction) {
    searchAction()
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

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
  "Knowledge Work Watcher initialized with consent-gated local navigation telemetry.",
);
