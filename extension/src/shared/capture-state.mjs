import { createEvent } from "./event-schema.mjs";
import { normalizeStudyServerUrl } from "./upload-policy.mjs";

export const DEFAULT_CAPTURE_STATE = Object.freeze({
  participant_id_hash: null,
  study_server_url: "",
  study_auth_token: "",
  upload_enabled: false,
  consent_accepted: false,
  ambient_enabled: false,
  paused: false,
  session_id: null,
  allowlist: [],
  debug_mode: false,
});

const STATE_FIELDS = new Set(Object.keys(DEFAULT_CAPTURE_STATE));
const ALLOWED_CONFIG_FIELDS = new Set([
  "participant_id_hash",
  "study_server_url",
  "study_auth_token",
  "upload_enabled",
  "allowlist",
  "debug_mode",
]);

function isSha256(value) {
  return value === null || (typeof value === "string" && /^[a-f0-9]{64}$/.test(value));
}

function isValidStudyServerUrl(value) {
  try {
    normalizeStudyServerUrl(value);
    return true;
  } catch {
    return false;
  }
}

function validateState(state) {
  if (
    typeof state !== "object" ||
    state === null ||
    Array.isArray(state) ||
    !Object.keys(state).every((field) => STATE_FIELDS.has(field))
  ) {
    throw new TypeError("capture state has an invalid shape");
  }

  if (!isSha256(state.participant_id_hash)) {
    throw new TypeError("participant_id_hash must be null or SHA-256");
  }
  if (!isValidStudyServerUrl(state.study_server_url)) {
    throw new TypeError("study_server_url must be HTTPS or loopback HTTP");
  }
  if (
    typeof state.study_auth_token !== "string" ||
    (state.study_auth_token !== "" && state.study_auth_token.length < 16)
  ) {
    throw new TypeError("study_auth_token must be empty or at least 16 characters");
  }
  if (
    typeof state.consent_accepted !== "boolean" ||
    typeof state.ambient_enabled !== "boolean" ||
    typeof state.paused !== "boolean" ||
    typeof state.upload_enabled !== "boolean" ||
    typeof state.debug_mode !== "boolean"
  ) {
    throw new TypeError("capture state flags must be boolean");
  }
  if (
    state.session_id !== null &&
    (typeof state.session_id !== "string" || !state.session_id)
  ) {
    throw new TypeError("session_id must be null or a non-empty string");
  }
  if (
    !Array.isArray(state.allowlist) ||
    !state.allowlist.every((domain) => typeof domain === "string" && domain)
  ) {
    throw new TypeError("allowlist must contain non-empty strings");
  }
  if (!state.consent_accepted && (state.ambient_enabled || state.paused)) {
    throw new TypeError("capture cannot be enabled or paused without consent");
  }
  if (!state.ambient_enabled && state.paused) {
    throw new TypeError("capture cannot be paused when ambient mode is disabled");
  }
  if (!state.ambient_enabled && state.session_id !== null) {
    throw new TypeError("session_id requires ambient mode");
  }

  return state;
}

export function getCaptureStatus(state) {
  if (!state.consent_accepted || !state.ambient_enabled) {
    return "off";
  }
  return state.paused ? "paused" : "active";
}

function captureModeFor(state) {
  const status = getCaptureStatus(state);
  return status === "active" ? "ambient" : status;
}

function publicState(state) {
  return {
    participant_id_configured: state.participant_id_hash !== null,
    study_server_url: state.study_server_url,
    study_auth_token_configured: state.study_auth_token !== "",
    upload_enabled: state.upload_enabled,
    consent_accepted: state.consent_accepted,
    ambient_enabled: state.ambient_enabled,
    paused: state.paused,
    allowlist: [...state.allowlist],
    debug_mode: state.debug_mode,
    capture_status: getCaptureStatus(state),
  };
}

export function createCaptureStateController({
  storage,
  queue,
  extensionVersion,
  createSessionId = () => crypto.randomUUID(),
}) {
  let pendingWrite = Promise.resolve();

  function runExclusive(operation) {
    const result = pendingWrite.then(operation, operation);
    pendingWrite = result.catch(() => {});
    return result;
  }

  async function readState() {
    const stored = await storage.read();
    if (stored === null) {
      return structuredClone(DEFAULT_CAPTURE_STATE);
    }
    return structuredClone(
      validateState({ ...DEFAULT_CAPTURE_STATE, ...stored }),
    );
  }

  async function appendStateEvent(state, eventType, source, payload = {}) {
    const event = createEvent({
      eventType,
      extensionVersion,
      captureMode: captureModeFor(state),
      source,
      participantIdHash: state.participant_id_hash,
      sessionId: state.session_id,
      payload,
    });
    await queue.append(event);
  }

  async function persistThenLog(nextState, eventType, source, payload = {}) {
    validateState(nextState);
    await storage.write(nextState);
    try {
      await appendStateEvent(nextState, eventType, source, payload);
      return { ...publicState(nextState), event_logging_failed: false };
    } catch {
      return { ...publicState(nextState), event_logging_failed: true };
    }
  }

  return {
    async getState() {
      await pendingWrite;
      return publicState(await readState());
    },

    async getTelemetryContext() {
      await pendingWrite;
      const state = await readState();
      return {
        capture_status: getCaptureStatus(state),
        participant_id_hash: state.participant_id_hash,
        session_id: state.session_id,
        allowlist: [...state.allowlist],
      };
    },

    async getUploadContext() {
      await pendingWrite;
      const state = await readState();
      return {
        capture_status: getCaptureStatus(state),
        consent_accepted: state.consent_accepted,
        ambient_enabled: state.ambient_enabled,
        paused: state.paused,
        upload_enabled: state.upload_enabled,
        study_server_url: state.study_server_url,
        study_auth_token: state.study_auth_token,
      };
    },

    async updateConfig(changes, source = "options") {
      return runExclusive(async () => {
        if ("study_server_url" in changes) {
          changes = {
            ...changes,
            study_server_url: normalizeStudyServerUrl(changes.study_server_url),
          };
        }
        const changedFields = Object.keys(changes);
        if (
          changedFields.length === 0 ||
          !changedFields.every((field) => ALLOWED_CONFIG_FIELDS.has(field))
        ) {
          throw new TypeError("configuration contains unsupported fields");
        }

        const state = await readState();
        const effectiveChanges = Object.fromEntries(
          Object.entries(changes).filter(([field, value]) => {
            if (field === "allowlist") {
              return JSON.stringify(value) !== JSON.stringify(state[field]);
            }
            return value !== state[field];
          }),
        );
        const effectiveFields = Object.keys(effectiveChanges);
        if (effectiveFields.length === 0) {
          return publicState(state);
        }

        const nextState = { ...state, ...structuredClone(effectiveChanges) };
        return persistThenLog(nextState, "config_changed", source, {
          changed_fields: effectiveFields,
        });
      });
    },

    async setConsent(consentAccepted, source = "options") {
      return runExclusive(async () => {
        if (typeof consentAccepted !== "boolean") {
          throw new TypeError("consent state must be boolean");
        }

        const state = await readState();
        const nextState = consentAccepted
          ? { ...state, consent_accepted: true }
          : {
              ...state,
              consent_accepted: false,
              ambient_enabled: false,
              paused: false,
              upload_enabled: false,
              session_id: null,
            };
        return persistThenLog(nextState, "consent_changed", source, {
          consent_granted: consentAccepted,
        });
      });
    },

    async setAmbientEnabled(enabled, source = "options") {
      return runExclusive(async () => {
        if (typeof enabled !== "boolean") {
          throw new TypeError("ambient state must be boolean");
        }

        const state = await readState();
        if (enabled && !state.consent_accepted) {
          throw new Error("consent is required before enabling ambient capture");
        }

        const nextState = enabled
          ? {
              ...state,
              ambient_enabled: true,
              paused: false,
              session_id: state.session_id ?? createSessionId(),
            }
          : {
              ...state,
              ambient_enabled: false,
              paused: false,
              session_id: null,
            };
        validateState(nextState);
        await storage.write(nextState);
        return publicState(nextState);
      });
    },

    async pause(source = "popup") {
      return runExclusive(async () => {
        const state = await readState();
        if (getCaptureStatus(state) !== "active") {
          throw new Error("capture must be active before it can be paused");
        }
        return persistThenLog(
          { ...state, paused: true },
          "capture_paused",
          source,
        );
      });
    },

    async resume(source = "popup") {
      return runExclusive(async () => {
        const state = await readState();
        if (getCaptureStatus(state) !== "paused") {
          throw new Error("capture must be paused before it can be resumed");
        }
        return persistThenLog(
          { ...state, paused: false },
          "capture_resumed",
          source,
        );
      });
    },
  };
}
