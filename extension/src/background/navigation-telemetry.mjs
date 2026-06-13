import { createEvent } from "../shared/event-schema.mjs";
import { classifyUrl } from "../shared/privacy-filter.mjs";
import {
  hashAllowedUrl,
  pseudonymizeBrowserId,
} from "../shared/telemetry-identifiers.mjs";

function isActive(context) {
  return context.capture_status === "active" && context.session_id !== null;
}

function hostnameFor(input) {
  return new URL(input).hostname.toLowerCase().replace(/\.$/, "");
}

export function createNavigationTelemetry({
  stateController,
  queue,
  extensionVersion,
  getWindowId,
  classify = classifyUrl,
  hashUrl = hashAllowedUrl,
  pseudonymize = pseudonymizeBrowserId,
}) {
  const tabContexts = new Map();
  const pendingCreated = new Map();
  const activeTabs = new Map();
  let focusedWindowId = null;

  async function append(context, eventType, payload) {
    const current = await stateController.getTelemetryContext();
    if (!isActive(current) || current.session_id !== context.session_id) {
      return;
    }
    const event = createEvent({
      eventType,
      extensionVersion,
      captureMode: "ambient",
      source: "telemetry",
      participantIdHash: context.participant_id_hash,
      sessionId: context.session_id,
      payload,
    });
    await queue.append(event);
  }

  async function getActiveContext() {
    const context = await stateController.getTelemetryContext();
    return isActive(context) ? context : null;
  }

  async function makePageContext(context, url, tabId, windowId, timestamp) {
    return {
      url_hash: await hashUrl(url),
      hostname: hostnameFor(url),
      tab_id: await pseudonymize(context.session_id, "tab", tabId),
      window_id: await pseudonymize(context.session_id, "window", windowId),
      browser_timestamp: timestamp,
    };
  }

  async function appendSkip(context, signalType, result) {
    await append(context, "capture_skipped", {
      signal_type: signalType,
      classification: result.classification,
      reason: result.reason,
      category: result.category,
    });
  }

  function knownPage(tabId, context) {
    const known = tabContexts.get(tabId);
    return known?.sessionId === context.session_id ? known.page : null;
  }

  return {
    async onTabCreated(tab) {
      const context = await getActiveContext();
      if (context && Number.isInteger(tab.id) && Number.isInteger(tab.windowId)) {
        pendingCreated.set(tab.id, {
          sessionId: context.session_id,
          windowId: tab.windowId,
          timestamp: Date.now(),
        });
      }
    },

    async onTabActivated({ tabId, windowId }) {
      const context = await getActiveContext();
      if (!context) {
        return;
      }
      activeTabs.set(windowId, tabId);
      const known = knownPage(tabId, context);
      if (known) {
        await append(context, "tab_activated", {
          ...known,
          browser_timestamp: Date.now(),
        });
      }
    },

    async onTabUpdated(tabId, changeInfo) {
      if (!["loading", "complete"].includes(changeInfo.status)) {
        return;
      }
      const context = await getActiveContext();
      const known = context ? knownPage(tabId, context) : null;
      if (context && known) {
        await append(context, "tab_updated", {
          ...known,
          browser_timestamp: Date.now(),
          status: changeInfo.status,
        });
      }
    },

    async onNavigationCommitted(details) {
      if (details.frameId !== 0) {
        return;
      }
      const context = await getActiveContext();
      if (!context) {
        return;
      }

      const classification = classify(details.url, {
        customAllowlist: context.allowlist,
      });
      if (classification.classification !== "allowed") {
        tabContexts.delete(details.tabId);
        pendingCreated.delete(details.tabId);
        await appendSkip(context, "navigation_committed", classification);
        return;
      }

      const windowId = await getWindowId(details.tabId);
      const pageContext = await makePageContext(
        context,
        details.url,
        details.tabId,
        windowId,
        details.timeStamp,
      );
      tabContexts.set(details.tabId, {
        sessionId: context.session_id,
        page: pageContext,
      });

      const created = pendingCreated.get(details.tabId);
      pendingCreated.delete(details.tabId);
      if (created?.sessionId === context.session_id) {
        await append(context, "tab_created", {
          ...pageContext,
          window_id: await pseudonymize(
            context.session_id,
            "window",
            created.windowId,
          ),
          browser_timestamp: created.timestamp,
        });
      }

      await append(context, "navigation_committed", {
        ...pageContext,
        transition_type: details.transitionType ?? "unknown",
        transition_qualifiers: details.transitionQualifiers ?? [],
      });
    },

    async onWindowFocusChanged(windowId) {
      const context = await getActiveContext();
      if (!context) {
        return;
      }

      if (windowId === -1) {
        const previousTab = activeTabs.get(focusedWindowId);
        const known = knownPage(previousTab, context);
        if (known) {
          await append(context, "window_focus_changed", {
            ...known,
            browser_timestamp: Date.now(),
            focused: false,
          });
        }
        focusedWindowId = null;
        return;
      }

      focusedWindowId = windowId;
      const known = knownPage(activeTabs.get(windowId), context);
      if (known) {
        await append(context, "window_focus_changed", {
          ...known,
          browser_timestamp: Date.now(),
          focused: true,
        });
      }
    },
  };
}
