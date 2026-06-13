import {
  batchEndpointForServer,
  permissionPatternForServer,
} from "../shared/upload-policy.mjs";
import { DEFAULT_SYNC_STATE } from "../shared/sync-state.mjs";

export const UPLOAD_ALARM_NAME = "knowledge-work-watcher-upload-retry";
export const DEFAULT_UPLOAD_BATCH_SIZE = 50;
export const DEFAULT_UPLOAD_BATCH_BYTES = 200 * 1024;
export const DEFAULT_UPLOAD_TIMEOUT_MS = 30_000;
const BASE_RETRY_MS = 30_000;
const MAX_RETRY_MS = 30 * 60_000;

function selectBatch(events, limit, byteLimit) {
  const selected = [];
  for (const event of events.slice(0, limit)) {
    const candidate = [...selected, event];
    if (
      new TextEncoder().encode(JSON.stringify({ events: candidate })).length >
      byteLimit
    ) {
      break;
    }
    selected.push(event);
  }
  return selected;
}

function validateBatchResponse(body, batch) {
  if (
    typeof body !== "object" ||
    body === null ||
    !Array.isArray(body.results) ||
    body.results.length !== batch.length ||
    !Number.isInteger(body.accepted) ||
    !Number.isInteger(body.rejected) ||
    body.accepted + body.rejected !== batch.length
  ) {
    throw new TypeError("invalid_batch_response");
  }

  const seen = new Set();
  return body.results.map((result) => {
    if (
      typeof result !== "object" ||
      result === null ||
      !Number.isInteger(result.index) ||
      result.index < 0 ||
      result.index >= batch.length ||
      seen.has(result.index) ||
      typeof result.accepted !== "boolean"
    ) {
      throw new TypeError("invalid_batch_response");
    }
    seen.add(result.index);
    const event = batch[result.index];
    if (result.accepted) {
      if (result.event_id !== event.event_id) {
        throw new TypeError("invalid_batch_response");
      }
      return { event, accepted: true, reason: null };
    }
    if (
      typeof result.reason !== "string" ||
      !/^[a-z0-9_]{1,64}$/.test(result.reason)
    ) {
      throw new TypeError("invalid_batch_response");
    }
    return { event, accepted: false, reason: result.reason };
  });
}

function retryDelay(failures) {
  return Math.min(BASE_RETRY_MS * 2 ** (failures - 1), MAX_RETRY_MS);
}

export function createUploadSync({
  stateController,
  queue,
  syncStateStorage,
  fetchImpl = fetch,
  alarms = chrome.alarms,
  permissions = chrome.permissions,
  now = () => Date.now(),
  batchSize = DEFAULT_UPLOAD_BATCH_SIZE,
  batchBytes = DEFAULT_UPLOAD_BATCH_BYTES,
  requestTimeoutMs = DEFAULT_UPLOAD_TIMEOUT_MS,
}) {
  let running = null;

  async function writeState(changes) {
    const current = await syncStateStorage.read();
    const next = { ...DEFAULT_SYNC_STATE, ...current, ...changes };
    await syncStateStorage.write(next);
    return next;
  }

  async function fail(errorCode, { retry = true } = {}) {
    const current = await syncStateStorage.read();
    const failures = (current.consecutive_failures ?? 0) + 1;
    const nextRetryAt = retry ? now() + retryDelay(failures) : null;
    if (retry) {
      await alarms.create(UPLOAD_ALARM_NAME, { when: nextRetryAt });
    } else {
      await alarms.clear(UPLOAD_ALARM_NAME);
    }
    return writeState({
      status: retry ? "retry_wait" : "error",
      consecutive_failures: failures,
      next_retry_at: nextRetryAt,
      last_error: errorCode,
      last_accepted: 0,
      last_rejected: 0,
    });
  }

  async function run() {
    let context = await stateController.getUploadContext();
    if (
      !context.consent_accepted ||
      !context.ambient_enabled ||
      context.paused ||
      !context.upload_enabled
    ) {
      await alarms.clear(UPLOAD_ALARM_NAME);
      return writeState({
        status: context.upload_enabled ? "blocked" : "disabled",
        next_retry_at: null,
        last_error: null,
      });
    }
    if (!context.study_server_url || !context.study_auth_token) {
      return fail("configuration_incomplete", { retry: false });
    }

    const permission = permissionPatternForServer(context.study_server_url);
    if (!(await permissions.contains({ origins: [permission] }))) {
      return fail("permission_missing", { retry: false });
    }

    let totalAccepted = 0;
    let totalRejected = 0;
    await writeState({
      status: "syncing",
      last_attempt_at: new Date(now()).toISOString(),
      last_error: null,
    });

    for (;;) {
      context = await stateController.getUploadContext();
      if (
        !context.consent_accepted ||
        !context.ambient_enabled ||
        context.paused ||
        !context.upload_enabled
      ) {
        await alarms.clear(UPLOAD_ALARM_NAME);
        return writeState({
          status: context.upload_enabled ? "blocked" : "disabled",
          next_retry_at: null,
          last_error: null,
          last_accepted: totalAccepted,
          last_rejected: totalRejected,
        });
      }
      const events = await queue.list();
      if (events.length === 0) {
        break;
      }
      const batch = selectBatch(events, batchSize, batchBytes);
      if (batch.length === 0) {
        return fail("event_too_large", { retry: false });
      }

      let response;
      const abortController = new AbortController();
      const timeout = setTimeout(
        () => abortController.abort(),
        requestTimeoutMs,
      );
      try {
        response = await fetchImpl(
          batchEndpointForServer(context.study_server_url),
          {
            method: "POST",
            headers: {
              authorization: `Bearer ${context.study_auth_token}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({ events: batch }),
            signal: abortController.signal,
          },
        );
      } catch {
        return fail("network_error");
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        if ([401, 403, 413].includes(response.status)) {
          return fail(
            response.status === 401
              ? "unauthorized"
              : response.status === 403
                ? "origin_not_allowed"
                : "payload_too_large",
            { retry: false },
          );
        }
        return fail(`http_${response.status}`, {
          retry: response.status === 429 || response.status >= 500,
        });
      }

      let results;
      try {
        results = validateBatchResponse(await response.json(), batch);
      } catch {
        return fail("invalid_server_response");
      }

      const removeEventIds = [];
      const deadLetters = [];
      const rejectedAt = new Date(now()).toISOString();
      for (const result of results) {
        if (result.accepted || result.reason === "duplicate_event_id") {
          removeEventIds.push(result.event.event_id);
          totalAccepted += 1;
        } else {
          removeEventIds.push(result.event.event_id);
          deadLetters.push({
            event_id: result.event.event_id,
            event_type: result.event.event_type,
            reason: result.reason,
            rejected_at: rejectedAt,
          });
          totalRejected += 1;
        }
      }
      try {
        await queue.settle({ removeEventIds, deadLetters });
      } catch {
        return fail("queue_changed", { retry: false });
      }
    }

    await alarms.clear(UPLOAD_ALARM_NAME);
    return writeState({
      status: "succeeded",
      consecutive_failures: 0,
      next_retry_at: null,
      last_success_at: new Date(now()).toISOString(),
      last_error: null,
      last_accepted: totalAccepted,
      last_rejected: totalRejected,
    });
  }

  function syncNow() {
    if (!running) {
      running = run().finally(() => {
        running = null;
      });
    }
    return running;
  }

  return {
    syncNow,
    requestSync() {
      void syncStateStorage
        .read()
        .then((state) => {
          if (
            state.status === "error" ||
            (state.next_retry_at && state.next_retry_at > now())
          ) {
            return null;
          }
          return syncNow();
        })
        .catch(() => {});
    },

    async getStatus() {
      const [state, events, deadLetters] = await Promise.all([
        syncStateStorage.read(),
        queue.list(),
        queue.listDeadLetters(),
      ]);
      return {
        ...DEFAULT_SYNC_STATE,
        ...state,
        queued_count: events.length,
        dead_letter_count: deadLetters.length,
      };
    },
  };
}
