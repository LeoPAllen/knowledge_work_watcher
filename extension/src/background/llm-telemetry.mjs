import { createEvent } from "../shared/event-schema.mjs";
import { classifyUrl } from "../shared/privacy-filter.mjs";
import { redactText } from "../shared/query-redaction.mjs";
import {
  LLM_RESPONSE_TEXT_LIMIT,
  sanitizeSensitiveText,
} from "../shared/sensitive-data.mjs";
import {
  expandedCaptureEnabled,
  STUDY_BUILD_POLICY,
} from "../shared/study-build-policy.mjs";
import {
  hashAllowedUrl,
  pseudonymizeBrowserId,
  pseudonymizeConversationId,
} from "../shared/telemetry-identifiers.mjs";

const LLM_HOSTS = Object.freeze({
  chatgpt: ["chatgpt.com"],
  claude: ["claude.ai"],
  gemini: ["gemini.google.com"],
  perplexity: ["perplexity.ai", "www.perplexity.ai"],
  copilot: ["copilot.microsoft.com"],
});
const ERROR_CODES = new Set([
  "unsupported_llm_page",
  "conversation_root_missing",
  "parse_failed",
]);
const PARSER_VERSION = 2;
const PARSER_NAME = "kww_llm_visible_text";
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

function validatedPage(senderUrl, tool) {
  try {
    const url = new URL(senderUrl);
    return (
      url.protocol === "https:" &&
      LLM_HOSTS[tool]?.includes(url.hostname) &&
      classifyUrl(url.href).classification === "allowed"
        ? url
        : null
    );
  } catch {
    return null;
  }
}

function destinationAllowed(input) {
  const result = classifyUrl(input);
  return (
    result.classification === "allowed" ||
    (result.classification === "unsupported" &&
      result.reason === "not_allowlisted")
  );
}

function safeModelName(value) {
  const redacted = redactText(value);
  return redacted.redacted ? null : redacted.query?.slice(0, 100) ?? null;
}

export function createLlmTelemetry({
  stateController,
  queue,
  extensionVersion,
  hashUrl = hashAllowedUrl,
  pseudonymize = pseudonymizeBrowserId,
  pseudonymizeConversation = pseudonymizeConversationId,
}) {
  const observed = new Map();

  async function scopedContext(sender, tool) {
    const context = await stateController.getTelemetryContext();
    const page = validatedPage(sender.url, tool);
    if (
      !isActive(context) ||
      !page ||
      !Number.isInteger(sender.tab?.id) ||
      !Number.isInteger(sender.tab?.windowId)
    ) {
      return null;
    }
    const conversationId = await pseudonymizeConversation(
      context.session_id,
      tool,
      page.pathname,
    );
    return { context, page, conversationId };
  }

  async function common(scoped, sender, tool, timestamp) {
    return {
      page_url_hash: await hashUrl(scoped.page.href),
      llm_hostname: scoped.page.hostname,
      tab_id: await pseudonymize(
        scoped.context.session_id,
        "tab",
        sender.tab.id,
      ),
      window_id: await pseudonymize(
        scoped.context.session_id,
        "window",
        sender.tab.windowId,
      ),
      conversation_id: scoped.conversationId,
      browser_timestamp: timestamp,
      llm_tool: tool,
    };
  }

  async function append(context, eventType, payload) {
    const current = await stateController.getTelemetryContext();
    if (!isActive(current) || current.session_id !== context.session_id) {
      return false;
    }
    await queue.append(
      createEvent({
        eventType,
        extensionVersion,
        captureMode: "ambient",
        source: "llm_parser",
        participantIdHash: context.participant_id_hash,
        sessionId: context.session_id,
        payload,
      }),
    );
    return true;
  }

  async function minimizeSources(urls) {
    const sources = [];
    for (const input of Array.isArray(urls) ? urls : []) {
      if (!destinationAllowed(input)) {
        continue;
      }
      const url = new URL(input);
      sources.push({
        destination_hostname: url.hostname.toLowerCase(),
        destination_url_hash: await hashUrl(url.href),
      });
      if (sources.length === 20) {
        break;
      }
    }
    return sources;
  }

  return {
    async isCaptureActive() {
      return isActive(await stateController.getTelemetryContext());
    },

    async onPageParsed(parsed, sender) {
      const scoped = await scopedContext(sender, parsed?.tool);
      if (!scoped || parsed?.parser_version !== PARSER_VERSION) {
        return;
      }
      const key = `${scoped.context.session_id}:${scoped.conversationId}`;
      const stored = observed.get(key) ?? {
        promptCount: 0,
        responseCount: 0,
        responseTextSignatures: new Map(),
        sourceSignatures: new Map(),
        metadataSignature: null,
        healthSignature: null,
      };
      const previous = {
        ...stored,
        responseTextSignatures: new Map(stored.responseTextSignatures),
        sourceSignatures: new Map(stored.sourceSignatures),
      };
      const modelName = safeModelName(parsed.model_name);
      const timestamp = Date.now();
      const base = await common(scoped, sender, parsed.tool, timestamp);

      const prompts = Array.isArray(parsed.prompts) ? parsed.prompts : [];
      for (const prompt of prompts) {
        if (
          !Number.isInteger(prompt?.prompt_index) ||
          prompt.prompt_index <= previous.promptCount
        ) {
          continue;
        }
        const redacted = redactText(prompt.text);
        if (
          !(await append(scoped.context, "llm_prompt_observed", {
            ...base,
            model_name: modelName,
            prompt_index: prompt.prompt_index,
            prompt_text: redacted.query,
            prompt_redacted: redacted.redacted,
            redaction_reason: redacted.reason,
          }))
        ) {
          return;
        }
      }

      const responses = Array.isArray(parsed.responses) ? parsed.responses : [];
      let totalSources = 0;
      for (const response of responses) {
        if (!Number.isInteger(response?.response_index)) {
          continue;
        }
        const sources = await minimizeSources(response.source_urls);
        totalSources += sources.length;
        if (response.response_index > previous.responseCount) {
          if (
            !(await append(scoped.context, "llm_response_observed", {
              ...base,
              model_name: modelName,
              response_index: response.response_index,
              response_text_captured: false,
              source_count: sources.length,
            }))
          ) {
            return;
          }
        }
        const responseText = sanitizeSensitiveText(
          response.text,
          LLM_RESPONSE_TEXT_LIMIT,
        );
        const selectorFamily = SELECTOR_FAMILY.has(response.selector_family)
          ? response.selector_family
          : "none";
        const confidence = CONFIDENCE.has(response.confidence)
          ? response.confidence
          : "low";
        const responseTextSignature = responseText
          ? JSON.stringify([response.response_index, responseText])
          : null;
        if (
          expandedCaptureEnabled(scoped.context) &&
          responseText &&
          previous.responseTextSignatures.get(response.response_index) !==
            responseTextSignature
        ) {
          if (
            !(await append(
              scoped.context,
              "llm_response_text_observed",
              {
                ...base,
                model_name: modelName,
                response_index: response.response_index,
                response_text: responseText.text,
                char_count_original: responseText.char_count_original,
                char_count_stored: responseText.char_count_stored,
                truncated: responseText.truncated,
                redaction_applied: responseText.redaction_applied,
                capture_profile: STUDY_BUILD_POLICY.capture_profile,
                parser_name: PARSER_NAME,
                parser_version: PARSER_VERSION,
                source_domain: scoped.page.hostname,
                capture_method: "visible_dom_text",
                selector_family: selectorFamily,
                confidence,
              },
            ))
          ) {
            return;
          }
          previous.responseTextSignatures.set(
            response.response_index,
            responseTextSignature,
          );
        }
        const signature = JSON.stringify(sources);
        if (
          sources.length > 0 &&
          previous.sourceSignatures.get(response.response_index) !== signature
        ) {
          if (
            !(await append(scoped.context, "llm_source_links_exposed", {
              ...base,
              model_name: modelName,
              response_index: response.response_index,
              sources,
            }))
          ) {
            return;
          }
          previous.sourceSignatures.set(response.response_index, signature);
        }
      }

      const metadataSignature = JSON.stringify([
        prompts.length,
        responses.length,
        totalSources,
        modelName,
      ]);
      if (metadataSignature !== previous.metadataSignature) {
        if (
          !(await append(scoped.context, "llm_interaction_metadata", {
            ...base,
            model_name: modelName,
            prompt_count: prompts.length,
            response_count: responses.length,
            source_count: totalSources,
            parser_version: PARSER_VERSION,
          }))
        ) {
          return;
        }
      }
      const health = parsed.health ?? {};
      const missingCount = Number.isInteger(health.missing_response_text_count)
        ? health.missing_response_text_count
        : 0;
      const degradedCount = Number.isInteger(health.degraded_count)
        ? health.degraded_count
        : 0;
      const healthSignature = JSON.stringify([
        missingCount,
        degradedCount,
        health.parsed_count,
        parsed.selector_family,
        parsed.confidence,
      ]);
      if (
        (missingCount > 0 || degradedCount > 0) &&
        healthSignature !== previous.healthSignature
      ) {
        await append(scoped.context, "parser_degraded", {
          capture_profile: STUDY_BUILD_POLICY.capture_profile,
          parser_kind: "llm",
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
            missingCount > 0
              ? "missing_response_text"
              : "fallback_selector",
          parsed_count: Number.isInteger(health.parsed_count)
            ? health.parsed_count
            : responses.length,
          missing_count: missingCount,
        });
      }
      observed.set(key, {
        promptCount: Math.max(
          previous.promptCount,
          ...prompts.map((prompt) => prompt.prompt_index ?? 0),
        ),
        responseCount: Math.max(
          previous.responseCount,
          ...responses.map((response) => response.response_index ?? 0),
        ),
        responseTextSignatures: previous.responseTextSignatures,
        sourceSignatures: previous.sourceSignatures,
        metadataSignature,
        healthSignature,
      });
    },

    async onParserError(message, sender) {
      let tool = null;
      try {
        const hostname = new URL(sender.url).hostname;
        tool = Object.entries(LLM_HOSTS).find(([, hosts]) =>
          hosts.includes(hostname),
        )?.[0];
      } catch {
        return;
      }
      const scoped = await scopedContext(sender, tool);
      if (
        !scoped ||
        message.stage !== "parse" ||
        !ERROR_CODES.has(message.code) ||
        message.parserVersion !== PARSER_VERSION
      ) {
        return;
      }
      await append(scoped.context, "parser_error", {
        ...(await common(scoped, sender, tool, Date.now())),
        model_name: null,
        parser_kind: "llm",
        parser_stage: "parse",
        error_code: message.code,
        parser_version: PARSER_VERSION,
      });
    },
  };
}
