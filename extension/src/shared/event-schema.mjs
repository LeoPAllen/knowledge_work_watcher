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
]);

export const CAPTURE_MODES = Object.freeze(["off", "paused", "ambient"]);

const SOURCES = new Set([
  "service_worker",
  "options",
  "popup",
  "debug",
  "telemetry",
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

const PAGE_CONTEXT_FIELDS = new Set([
  "url_hash",
  "hostname",
  "tab_id",
  "window_id",
  "browser_timestamp",
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
