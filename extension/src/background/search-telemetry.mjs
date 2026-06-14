import { createEvent } from "../shared/event-schema.mjs";
import { classifyUrl } from "../shared/privacy-filter.mjs";
import { redactSearchQuery } from "../shared/query-redaction.mjs";
import {
  normalizeSearchResultUrl,
  sanitizeSensitiveText,
  SEARCH_SNIPPET_TEXT_LIMIT,
} from "../shared/sensitive-data.mjs";
import {
  expandedCaptureEnabled,
  STUDY_BUILD_POLICY,
} from "../shared/study-build-policy.mjs";
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
const PARSER_VERSION = 2;
const PARSER_NAME = "kww_search_visible_results";
const CONFIDENCE = new Set(["high", "medium", "low"]);
const SELECTOR_FAMILY = new Set([
  "canonical",
  "fallback",
  "semantic",
  "none",
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
  const healthSignatures = new Map();

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

  async function expandedResult(result) {
    const minimized = await minimizeResult(result);
    if (!minimized) {
      return null;
    }
    const snippet = sanitizeSensitiveText(
      result.snippet,
      SEARCH_SNIPPET_TEXT_LIMIT,
    );
    const normalizedUrl = normalizeSearchResultUrl(result.url);
    const classification = normalizedUrl
      ? classifyUrl(normalizedUrl).classification
      : "invalid";
    return {
      minimized,
      snippet,
      fullUrl: classification === "allowed" ? normalizedUrl : null,
      selectorFamily: SELECTOR_FAMILY.has(result.selector_family)
        ? result.selector_family
        : "none",
      confidence: CONFIDENCE.has(result.confidence)
        ? result.confidence
        : "low",
    };
  }

  return {
    async isCaptureActive() {
      return isActive(await stateController.getTelemetryContext());
    },

    async onPageParsed(parsed, sender) {
      const scoped = await contextFor(sender, parsed?.engine);
      if (!scoped || parsed?.parser_version !== PARSER_VERSION) {
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
      const expanded = [];
      for (const result of Array.isArray(parsed.results) ? parsed.results : []) {
        const processed = await expandedResult(result);
        if (processed) {
          results.push(processed.minimized);
          expanded.push(processed);
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
      if (expandedCaptureEnabled(scoped.context)) {
        for (const item of expanded) {
          const metadata = {
            capture_profile: STUDY_BUILD_POLICY.capture_profile,
            parser_name: PARSER_NAME,
            parser_version: PARSER_VERSION,
            source_domain: scoped.page.hostname,
            capture_method: "visible_dom_text",
            selector_family: item.selectorFamily,
            confidence: item.confidence,
          };
          if (item.snippet) {
            await append(scoped.context, "search_snippet_observed", {
              ...common,
              search_engine: parsed.engine,
              ...metadata,
              rank: item.minimized.rank,
              title: item.minimized.title,
              destination_hostname: item.minimized.destination_hostname,
              destination_url_hash: item.minimized.destination_url_hash,
              result_type: item.minimized.result_type,
              snippet_text: item.snippet.text,
              char_count_original: item.snippet.char_count_original,
              char_count_stored: item.snippet.char_count_stored,
              truncated: item.snippet.truncated,
              redaction_applied: item.snippet.redaction_applied,
            });
          }
          if (item.fullUrl) {
            await append(
              scoped.context,
              "search_result_full_url_observed",
              {
                ...common,
                search_engine: parsed.engine,
                ...metadata,
                rank: item.minimized.rank,
                destination_hostname: item.minimized.destination_hostname,
                destination_url_hash: item.minimized.destination_url_hash,
                destination_url: item.fullUrl,
                result_type: item.minimized.result_type,
                full_url_storage_enabled: true,
              },
            );
          }
        }
      }

      const health = parsed.health ?? {};
      const missingCount = Number.isInteger(health.missing_snippet_count)
        ? health.missing_snippet_count
        : 0;
      const degradedCount = Number.isInteger(health.degraded_count)
        ? health.degraded_count
        : 0;
      const healthKey = `${scoped.context.session_id}:${common.page_url_hash}`;
      const healthSignature = JSON.stringify([
        missingCount,
        degradedCount,
        health.parsed_count,
        parsed.selector_family,
        parsed.confidence,
      ]);
      if (
        (missingCount > 0 || degradedCount > 0) &&
        healthSignatures.get(healthKey) !== healthSignature
      ) {
        await append(scoped.context, "parser_degraded", {
          capture_profile: STUDY_BUILD_POLICY.capture_profile,
          parser_kind: "search",
          parser_name: PARSER_NAME,
          parser_version: PARSER_VERSION,
          source_domain: scoped.page.hostname,
          capture_method: "visible_dom_text",
          selector_family: SELECTOR_FAMILY.has(parsed.selector_family)
            ? parsed.selector_family
            : "none",
          confidence: CONFIDENCE.has(parsed.confidence)
            ? parsed.confidence
            : "low",
          degradation_code:
            missingCount > 0 ? "missing_snippet" : "fallback_selector",
          parsed_count: Number.isInteger(health.parsed_count)
            ? health.parsed_count
            : results.length,
          missing_count: missingCount,
        });
        healthSignatures.set(healthKey, healthSignature);
      }
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
        message.parserVersion !== PARSER_VERSION
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
        parser_kind: "search",
        search_engine: engine,
        parser_stage: "parse",
        error_code: message.code,
        parser_version: PARSER_VERSION,
      });
    },
  };
}
