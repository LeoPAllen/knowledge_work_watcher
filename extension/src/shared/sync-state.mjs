const SYNC_STATE_KEY = "upload_sync_state_v1";

export const DEFAULT_SYNC_STATE = Object.freeze({
  status: "idle",
  consecutive_failures: 0,
  next_retry_at: null,
  last_attempt_at: null,
  last_success_at: null,
  last_error: null,
  last_accepted: 0,
  last_rejected: 0,
});

export function createChromeSyncStateStorage(
  storageArea = chrome.storage.local,
) {
  return {
    async read() {
      const result = await storageArea.get(SYNC_STATE_KEY);
      return structuredClone(result[SYNC_STATE_KEY] ?? DEFAULT_SYNC_STATE);
    },
    async write(state) {
      await storageArea.set({ [SYNC_STATE_KEY]: structuredClone(state) });
    },
  };
}

export function createMemorySyncStateStorage(
  initialState = DEFAULT_SYNC_STATE,
) {
  let state = structuredClone(initialState);
  return {
    async read() {
      return structuredClone(state);
    },
    async write(nextState) {
      state = structuredClone(nextState);
    },
  };
}
