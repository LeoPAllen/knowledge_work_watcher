import { createEvent } from "../shared/event-schema.mjs";
import { classifyUrl } from "../shared/privacy-filter.mjs";
import { redactSearchQuery } from "../shared/query-redaction.mjs";
import {
  hashAllowedUrl,
  pseudonymizeBrowserId,
} from "../shared/telemetry-identifiers.mjs";

const SEARCH_PAGES = Object.freeze({
  google: { hostname: "www.google.com", paths: ["/search"] },
  bing: { hostname: "www.bing.com", paths: ["/search"] },
  duckduckgo: { hostname: "duckduckgo.com", paths: ["/", "/html/"] },
});
const ERROR_CODES = new Set([
  "unsupported_search_page",
  "results_root_missing",
  "parse_failed",
]);

function isActive(context) {
  return context.capture_status === "active" && context.session_id !== null;
}

function validatedSearchPage(senderUrl, claimedEngine) {
  try {
    const url = new URL(senderUrl);
    const expected = SEARCH_PAGES[claimedEngine];
    if (
      !expected ||
      url.protocol !== "https:" ||
      url.hostname !== expected.hostname ||
      !expected.paths.includes(url.pathname)
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

function safeTitle(value) {
  if (typeof value !== "string") {
    return null;
  }
  const redacted = redactSearchQuery(value);
  return redacted.redacted ? null : redacted.query?.slice(0, 300) ?? null;
}

function destinationAllowed(input) {
  const result = classifyUrl(input);
  return (
    result.classification === "allowed" ||
    (result.classification === "unsupported" &&
      result.reason === "not_allowlisted")
  );
}

export function createSearchTelemetry({
  stateController,
  queue,
  extensionVersion,
  hashUrl = hashAllowedUrl,
  pseudonymize = pseudonymizeBrowserId,
}) {
  async function contextFor(sender, engine) {
    const context = await stateController.getTelemetryContext();
    const page = validatedSearchPage(sender.url, engine);
    if (
      !isActive(context) ||
      !page ||
      !Number.isInteger(sender.tab?.id) ||
      !Number.isInteger(sender.tab?.windowId)
    ) {
      return null;
    }
    return { context, page };
  }

  async function pageContext(context, page, sender, timestamp) {
    return {
      page_url_hash: await hashUrl(page.href),
      search_hostname: page.hostname,
      tab_id: await pseudonymize(context.session_id, "tab", sender.tab.id),
      window_id: await pseudonymize(
        context.session_id,
        "window",
        sender.tab.windowId,
      ),
      browser_timestamp: timestamp,
    };
  }

  async function append(context, eventType, payload) {
    const current = await stateController.getTelemetryContext();
    if (!isActive(current) || current.session_id !== context.session_id) {
      return;
    }
    await queue.append(
      createEvent({
        eventType,
        extensionVersion,
        captureMode: "ambient",
        source: "search_parser",
        participantIdHash: context.participant_id_hash,
        sessionId: context.session_id,
        payload,
      }),
    );
  }

  async function minimizeResult(result) {
    if (
      !Number.isInteger(result?.rank) ||
      result.rank < 1 ||
      !["organic", "ad", "ai", "other", "unknown"].includes(
        result.result_type,
      ) ||
      !destinationAllowed(result.url)
    ) {
      return null;
    }
    const title = safeTitle(result.title);
    if (!title) {
      return null;
    }
    const destination = new URL(result.url);
    return {
      rank: result.rank,
      title,
      destination_hostname: destination.hostname.toLowerCase(),
      destination_url_hash: await hashUrl(destination.href),
      result_type: result.result_type,
    };
  }

  return {
    async isCaptureActive() {
      return isActive(await stateController.getTelemetryContext());
    },

    async onPageParsed(parsed, sender) {
      const scoped = await contextFor(sender, parsed?.engine);
      if (!scoped || parsed?.parser_version !== 1) {
        return;
      }
      const timestamp = Date.now();
      const common = await pageContext(
        scoped.context,
        scoped.page,
        sender,
        timestamp,
      );
      const redacted = redactSearchQuery(scoped.page.searchParams.get("q"));
      await append(scoped.context, "search_query_observed", {
        ...common,
        search_engine: parsed.engine,
        query: redacted.query,
        query_redacted: redacted.redacted,
        redaction_reason: redacted.reason,
      });

      const results = [];
      for (const result of Array.isArray(parsed.results) ? parsed.results : []) {
        const minimized = await minimizeResult(result);
        if (minimized) {
          results.push(minimized);
        }
        if (results.length === 20) {
          break;
        }
      }
      await append(scoped.context, "search_results_exposed", {
        ...common,
        search_engine: parsed.engine,
        results,
      });
    },

    async onResultClicked(clicked, sender) {
      const scoped = await contextFor(sender, clicked?.engine);
      if (
        !scoped ||
        !Number.isInteger(clicked.rank) ||
        clicked.rank < 1 ||
        !destinationAllowed(clicked.url)
      ) {
        return;
      }
      const destination = new URL(clicked.url);
      await append(scoped.context, "search_result_clicked", {
        ...(await pageContext(
          scoped.context,
          scoped.page,
          sender,
          Date.now(),
        )),
        search_engine: clicked.engine,
        clicked_rank: clicked.rank,
        destination_hostname: destination.hostname.toLowerCase(),
        destination_url_hash: await hashUrl(destination.href),
      });
    },

    async onParserError(message, sender) {
      const engine = (() => {
        try {
          const url = new URL(sender.url);
          return Object.entries(SEARCH_PAGES).find(
            ([, config]) => config.hostname === url.hostname,
          )?.[0];
        } catch {
          return null;
        }
      })();
      const scoped = await contextFor(sender, engine);
      if (
        !scoped ||
        message.stage !== "parse" ||
        !ERROR_CODES.has(message.code) ||
        message.parserVersion !== 1
      ) {
        return;
      }
      await append(scoped.context, "parser_error", {
        ...(await pageContext(
          scoped.context,
          scoped.page,
          sender,
          Date.now(),
        )),
        search_engine: engine,
        parser_stage: "parse",
        error_code: message.code,
        parser_version: 1,
      });
    },
  };
}
