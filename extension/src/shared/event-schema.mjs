export const SCHEMA_VERSION = 1;

export const EVENT_TYPES = Object.freeze([
  "extension_installed",
  "consent_changed",
  "capture_paused",
  "capture_resumed",
  "config_changed",
  "queue_test_event",
  "tab_created",
  "tab_activated",
  "tab_updated",
  "navigation_committed",
  "window_focus_changed",
  "capture_skipped",
  "search_query_observed",
  "search_results_exposed",
  "search_result_clicked",
  "llm_prompt_observed",
  "llm_response_observed",
  "llm_source_links_exposed",
  "llm_interaction_metadata",
  "parser_error",
]);

export const CAPTURE_MODES = Object.freeze(["off", "paused", "ambient"]);

const SOURCES = new Set([
  "service_worker",
  "options",
  "popup",
  "debug",
  "telemetry",
  "search_parser",
  "llm_parser",
]);
const CONFIG_FIELDS = new Set([
  "participant_id_hash",
  "study_server_url",
  "allowlist",
  "debug_mode",
]);
const EVENT_TYPE_SET = new Set(EVENT_TYPES);
const CAPTURE_MODE_SET = new Set(CAPTURE_MODES);
const ENVELOPE_FIELDS = new Set([
  "event_id",
  "schema_version",
  "event_type",
  "created_at",
  "participant_id_hash",
  "session_id",
  "extension_version",
  "capture_mode",
  "source",
  "payload",
]);

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isNullableString(value) {
  return value === null || isNonEmptyString(value);
}

function isNullableParticipantHash(value) {
  return value === null || (typeof value === "string" && /^[a-f0-9]{64}$/.test(value));
}

function isPlainObject(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function hasOnlyFields(value, allowedFields) {
  return Object.keys(value).every((field) => allowedFields.has(field));
}

function isIsoTimestamp(value) {
  return (
    isNonEmptyString(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}

function isSha256(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function isFiniteTimestamp(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isHostname(value) {
  return (
    isNonEmptyString(value) &&
    /^[a-z0-9.-]+$/.test(value) &&
    !value.startsWith(".") &&
    !value.endsWith(".")
  );
}

function isBrowserPseudonym(value, kind) {
  return (
    typeof value === "string" &&
    new RegExp(`^${kind}_[a-f0-9]{64}$`).test(value)
  );
}

const SEARCH_ENGINES = new Set(["google", "bing", "duckduckgo"]);
const LLM_TOOLS = new Set([
  "chatgpt",
  "claude",
  "gemini",
  "perplexity",
  "copilot",
]);
const RESULT_TYPES = new Set(["organic", "ad", "ai", "other", "unknown"]);
const REDACTION_REASONS = new Set(["email", "phone", "secret", "missing"]);

const PAGE_CONTEXT_FIELDS = new Set([
  "url_hash",
  "hostname",
  "tab_id",
  "window_id",
  "browser_timestamp",
]);

const SEARCH_CONTEXT_FIELDS = new Set([
  "page_url_hash",
  "search_hostname",
  "tab_id",
  "window_id",
  "browser_timestamp",
]);

const LLM_CONTEXT_FIELDS = new Set([
  "page_url_hash",
  "llm_hostname",
  "tab_id",
  "window_id",
  "conversation_id",
  "browser_timestamp",
  "llm_tool",
  "model_name",
]);

function validatePageContext(payload, extraFields = new Set()) {
  const allowedFields = new Set([...PAGE_CONTEXT_FIELDS, ...extraFields]);
  return (
    hasOnlyFields(payload, allowedFields) &&
    isSha256(payload.url_hash) &&
    isHostname(payload.hostname) &&
    isBrowserPseudonym(payload.tab_id, "tab") &&
    isBrowserPseudonym(payload.window_id, "window") &&
    isFiniteTimestamp(payload.browser_timestamp)
  );
}

function validateSearchContext(payload, extraFields = new Set()) {
  const allowedFields = new Set([...SEARCH_CONTEXT_FIELDS, ...extraFields]);
  return (
    hasOnlyFields(payload, allowedFields) &&
    isSha256(payload.page_url_hash) &&
    isHostname(payload.search_hostname) &&
    isBrowserPseudonym(payload.tab_id, "tab") &&
    isBrowserPseudonym(payload.window_id, "window") &&
    isFiniteTimestamp(payload.browser_timestamp) &&
    SEARCH_ENGINES.has(payload.search_engine)
  );
}

function validateSearchResult(result) {
  return (
    isPlainObject(result) &&
    hasOnlyFields(
      result,
      new Set([
        "rank",
        "title",
        "destination_hostname",
        "destination_url_hash",
        "result_type",
      ]),
    ) &&
    Number.isInteger(result.rank) &&
    result.rank > 0 &&
    isNonEmptyString(result.title) &&
    result.title.length <= 300 &&
    isHostname(result.destination_hostname) &&
    isSha256(result.destination_url_hash) &&
    RESULT_TYPES.has(result.result_type)
  );
}

function validateLlmContext(payload, extraFields = new Set()) {
  const allowedFields = new Set([...LLM_CONTEXT_FIELDS, ...extraFields]);
  return (
    hasOnlyFields(payload, allowedFields) &&
    isSha256(payload.page_url_hash) &&
    isHostname(payload.llm_hostname) &&
    isBrowserPseudonym(payload.tab_id, "tab") &&
    isBrowserPseudonym(payload.window_id, "window") &&
    typeof payload.conversation_id === "string" &&
    /^conversation_[a-f0-9]{64}$/.test(payload.conversation_id) &&
    isFiniteTimestamp(payload.browser_timestamp) &&
    LLM_TOOLS.has(payload.llm_tool) &&
    (payload.model_name === null ||
      (isNonEmptyString(payload.model_name) && payload.model_name.length <= 100))
  );
}

function validateSource(source) {
  return (
    isPlainObject(source) &&
    hasOnlyFields(
      source,
      new Set(["destination_hostname", "destination_url_hash"]),
    ) &&
    isHostname(source.destination_hostname) &&
    isSha256(source.destination_url_hash)
  );
}

function validateParserError(payload) {
  if (payload.parser_kind === "search") {
    return (
      validateSearchContext(
        payload,
        new Set([
          "parser_kind",
          "search_engine",
          "parser_stage",
          "error_code",
          "parser_version",
        ]),
      ) &&
      payload.parser_stage === "parse" &&
      [
        "unsupported_search_page",
        "results_root_missing",
        "parse_failed",
      ].includes(payload.error_code) &&
      payload.parser_version === 1
    );
  }
  if (payload.parser_kind === "llm") {
    return (
      validateLlmContext(
        payload,
        new Set([
          "parser_kind",
          "parser_stage",
          "error_code",
          "parser_version",
        ]),
      ) &&
      payload.parser_stage === "parse" &&
      [
        "unsupported_llm_page",
        "conversation_root_missing",
        "parse_failed",
      ].includes(payload.error_code) &&
      payload.parser_version === 1
    );
  }
  return false;
}

function validatePayload(eventType, payload) {
  if (!isPlainObject(payload)) {
    return false;
  }

  switch (eventType) {
    case "extension_installed":
      return (
        hasOnlyFields(payload, new Set(["reason"])) &&
        ["install", "update", "chrome_update", "shared_module_update"].includes(
          payload.reason,
        )
      );
    case "consent_changed":
      return (
        hasOnlyFields(payload, new Set(["consent_granted"])) &&
        typeof payload.consent_granted === "boolean"
      );
    case "capture_paused":
    case "capture_resumed":
      return Object.keys(payload).length === 0;
    case "config_changed":
      return (
        hasOnlyFields(payload, new Set(["changed_fields"])) &&
        Array.isArray(payload.changed_fields) &&
        payload.changed_fields.every((field) => CONFIG_FIELDS.has(field))
      );
    case "queue_test_event":
      return (
        hasOnlyFields(payload, new Set(["synthetic"])) &&
        payload.synthetic === true
      );
    case "tab_created":
    case "tab_activated":
      return validatePageContext(payload);
    case "tab_updated":
      return (
        validatePageContext(payload, new Set(["status"])) &&
        ["loading", "complete"].includes(payload.status)
      );
    case "navigation_committed":
      return (
        validatePageContext(
          payload,
          new Set(["transition_type", "transition_qualifiers"]),
        ) &&
        isNonEmptyString(payload.transition_type) &&
        Array.isArray(payload.transition_qualifiers) &&
        payload.transition_qualifiers.every(isNonEmptyString)
      );
    case "window_focus_changed":
      return (
        validatePageContext(payload, new Set(["focused"])) &&
        typeof payload.focused === "boolean"
      );
    case "capture_skipped":
      return (
        hasOnlyFields(
          payload,
          new Set(["signal_type", "classification", "reason", "category"]),
        ) &&
        isNonEmptyString(payload.signal_type) &&
        [
          "denied",
          "private_or_sensitive",
          "unsupported",
          "invalid",
        ].includes(payload.classification) &&
        isNonEmptyString(payload.reason) &&
        isNullableString(payload.category)
      );
    case "search_query_observed":
      return (
        validateSearchContext(
          payload,
          new Set([
            "search_engine",
            "query",
            "query_redacted",
            "redaction_reason",
          ]),
        ) &&
        (payload.query === null ||
          (isNonEmptyString(payload.query) && payload.query.length <= 500)) &&
        typeof payload.query_redacted === "boolean" &&
        (payload.redaction_reason === null ||
          REDACTION_REASONS.has(payload.redaction_reason)) &&
        (payload.query_redacted
          ? payload.query === null &&
            ["email", "phone", "secret"].includes(payload.redaction_reason)
          : payload.query === null
            ? payload.redaction_reason === "missing"
            : payload.redaction_reason === null)
      );
    case "search_results_exposed":
      return (
        validateSearchContext(
          payload,
          new Set(["search_engine", "results"]),
        ) &&
        Array.isArray(payload.results) &&
        payload.results.length <= 20 &&
        payload.results.every(validateSearchResult)
      );
    case "search_result_clicked":
      return (
        validateSearchContext(
          payload,
          new Set([
            "search_engine",
            "clicked_rank",
            "destination_hostname",
            "destination_url_hash",
          ]),
        ) &&
        Number.isInteger(payload.clicked_rank) &&
        payload.clicked_rank > 0 &&
        isHostname(payload.destination_hostname) &&
        isSha256(payload.destination_url_hash)
      );
    case "llm_prompt_observed":
      return (
        validateLlmContext(
          payload,
          new Set([
            "prompt_index",
            "prompt_text",
            "prompt_redacted",
            "redaction_reason",
          ]),
        ) &&
        Number.isInteger(payload.prompt_index) &&
        payload.prompt_index > 0 &&
        (payload.prompt_text === null ||
          (isNonEmptyString(payload.prompt_text) &&
            payload.prompt_text.length <= 500)) &&
        typeof payload.prompt_redacted === "boolean" &&
        (payload.prompt_redacted
          ? payload.prompt_text === null &&
            ["email", "phone", "secret"].includes(payload.redaction_reason)
          : payload.prompt_text === null
            ? payload.redaction_reason === "missing"
            : payload.redaction_reason === null)
      );
    case "llm_response_observed":
      return (
        validateLlmContext(
          payload,
          new Set([
            "response_index",
            "response_text_captured",
            "source_count",
          ]),
        ) &&
        Number.isInteger(payload.response_index) &&
        payload.response_index > 0 &&
        payload.response_text_captured === false &&
        Number.isInteger(payload.source_count) &&
        payload.source_count >= 0 &&
        payload.source_count <= 20
      );
    case "llm_source_links_exposed":
      return (
        validateLlmContext(
          payload,
          new Set(["response_index", "sources"]),
        ) &&
        Number.isInteger(payload.response_index) &&
        payload.response_index > 0 &&
        Array.isArray(payload.sources) &&
        payload.sources.length > 0 &&
        payload.sources.length <= 20 &&
        payload.sources.every(validateSource)
      );
    case "llm_interaction_metadata":
      return (
        validateLlmContext(
          payload,
          new Set([
            "prompt_count",
            "response_count",
            "source_count",
            "parser_version",
          ]),
        ) &&
        ["prompt_count", "response_count", "source_count"].every(
          (field) => Number.isInteger(payload[field]) && payload[field] >= 0,
        ) &&
        payload.parser_version === 1
      );
    case "parser_error":
      return validateParserError(payload);
    default:
      return false;
  }
}

export function validateEvent(event) {
  const errors = [];

  if (!isPlainObject(event)) {
    return { valid: false, errors: ["event must be a plain object"] };
  }

  if (!hasOnlyFields(event, ENVELOPE_FIELDS)) {
    errors.push("event contains unsupported fields");
  }

  if (!isNonEmptyString(event.event_id)) {
    errors.push("event_id must be a non-empty string");
  }

  if (event.schema_version !== SCHEMA_VERSION) {
    errors.push(`schema_version must be ${SCHEMA_VERSION}`);
  }

  if (!EVENT_TYPE_SET.has(event.event_type)) {
    errors.push("event_type is not supported");
  }

  if (!isIsoTimestamp(event.created_at)) {
    errors.push("created_at must be an ISO 8601 UTC timestamp");
  }

  if (!isNullableParticipantHash(event.participant_id_hash)) {
    errors.push("participant_id_hash must be null or a lowercase SHA-256 hex value");
  }

  if (!isNullableString(event.session_id)) {
    errors.push("session_id must be null or a non-empty string");
  }

  if (!isNonEmptyString(event.extension_version)) {
    errors.push("extension_version must be a non-empty string");
  }

  if (!CAPTURE_MODE_SET.has(event.capture_mode)) {
    errors.push("capture_mode is not supported");
  }

  if (!SOURCES.has(event.source)) {
    errors.push("source is not supported");
  }

  if (!validatePayload(event.event_type, event.payload)) {
    errors.push("payload is invalid for event_type");
  }

  return { valid: errors.length === 0, errors };
}

export function createEvent({
  eventType,
  extensionVersion,
  captureMode = "off",
  source,
  participantIdHash = null,
  sessionId = null,
  payload = {},
  eventId = crypto.randomUUID(),
  createdAt = new Date().toISOString(),
}) {
  const event = {
    event_id: eventId,
    schema_version: SCHEMA_VERSION,
    event_type: eventType,
    created_at: createdAt,
    participant_id_hash: participantIdHash,
    session_id: sessionId,
    extension_version: extensionVersion,
    capture_mode: captureMode,
    source,
    payload,
  };
  const result = validateEvent(event);

  if (!result.valid) {
    throw new TypeError(`Invalid event: ${result.errors.join("; ")}`);
  }

  return event;
}
