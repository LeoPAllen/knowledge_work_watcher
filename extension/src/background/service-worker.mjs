import { createEvent } from "../shared/event-schema.mjs";
import { createLocalQueue } from "../shared/local-queue.mjs";
import {
  createChromeDeadLetterStorage,
  createChromeStorageAdapter,
} from "../shared/storage.mjs";
import { createChromeStateStorage } from "../shared/config-storage.mjs";
import { createChromeSyncStateStorage } from "../shared/sync-state.mjs";
import { createCaptureStateController } from "../shared/capture-state.mjs";
import { createNavigationTelemetry } from "./navigation-telemetry.mjs";
import { createSearchTelemetry } from "./search-telemetry.mjs";
import { createLlmTelemetry } from "./llm-telemetry.mjs";
import { createKnowledgeTelemetry } from "./knowledge-telemetry.mjs";
import {
  createUploadSync,
  UPLOAD_ALARM_NAME,
} from "./upload-sync.mjs";

const rawQueue = createLocalQueue(createChromeStorageAdapter(), {
  deadLetterStorage: createChromeDeadLetterStorage(),
});
let uploadSync;
const queue = {
  async append(event) {
    const count = await rawQueue.append(event);
    uploadSync?.requestSync();
    return count;
  },
  list: () => rawQueue.list(),
  clear: () => rawQueue.clear(),
  settle: (settlement) => rawQueue.settle(settlement),
  listDeadLetters: () => rawQueue.listDeadLetters(),
  clearDeadLetters: () => rawQueue.clearDeadLetters(),
};
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
const knowledgeTelemetry = createKnowledgeTelemetry({
  stateController: controller,
  queue,
  extensionVersion,
});
uploadSync = createUploadSync({
  stateController: controller,
  queue,
  syncStateStorage: createChromeSyncStateStorage(),
});
uploadSync.requestSync();

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

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === UPLOAD_ALARM_NAME) {
    uploadSync.requestSync();
  }
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
  const parserActions = {
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
    knowledge_page_parsed: async () => {
      await knowledgeTelemetry.onPageParsed(message.parsed, sender);
      return {};
    },
    knowledge_parser_error: async () => {
      await knowledgeTelemetry.onParserError(message, sender);
      return {};
    },
  };
  const parserAction = parserActions[message?.type];
  if (parserAction) {
    parserAction()
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  const source = sender.url?.includes("/popup/") ? "popup" : "options";
  const actions = {
    get_state: async () => ({ state: await controller.getState() }),
    get_dashboard: async () => ({
      state: await controller.getState(),
      sync: await uploadSync.getStatus(),
    }),
    update_config: async () => {
      const state = await controller.updateConfig(message.changes, source);
      void uploadSync.syncNow().catch(() => {});
      return { state };
    },
    set_consent: async () => {
      const state = await controller.setConsent(message.accepted, source);
      uploadSync.requestSync();
      return { state };
    },
    set_ambient: async () => {
      const state = await controller.setAmbientEnabled(message.enabled, source);
      uploadSync.requestSync();
      return { state };
    },
    pause_capture: async () => {
      const state = await controller.pause(source);
      uploadSync.requestSync();
      return { state };
    },
    resume_capture: async () => {
      const state = await controller.resume(source);
      uploadSync.requestSync();
      return { state };
    },
    sync_now: async () => {
      await uploadSync.syncNow();
      return { sync: await uploadSync.getStatus() };
    },
    list_events: async () => ({ events: await queue.list() }),
    clear_events: async () => {
      await queue.clear();
      return { sync: await uploadSync.getStatus() };
    },
    list_dead_letters: async () => ({
      dead_letters: await queue.listDeadLetters(),
    }),
    clear_dead_letters: async () => {
      await queue.clearDeadLetters();
      return { sync: await uploadSync.getStatus() };
    },
    create_test_event: async () => {
      const state = await controller.getState();
      const event = createEvent({
        eventType: "queue_test_event",
        extensionVersion,
        captureMode:
          state.capture_status === "active" ? "ambient" : state.capture_status,
        source: "debug",
        payload: { synthetic: true },
      });
      await queue.append(event);
      return { sync: await uploadSync.getStatus() };
    },
  };
  const action = actions[message?.type];

  if (!action) {
    return false;
  }

  action()
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});

console.info(
  "Knowledge Work Watcher initialized with consent-gated local navigation telemetry.",
);
