const STATE_STORAGE_KEY = "capture_state_v1";

export function createChromeStateStorage(storageArea = chrome.storage.local) {
  return {
    async read() {
      const result = await storageArea.get(STATE_STORAGE_KEY);
      return result[STATE_STORAGE_KEY] ?? null;
    },
    async write(state) {
      await storageArea.set({ [STATE_STORAGE_KEY]: state });
    },
  };
}

export function createMemoryStateStorage(initialState = null) {
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
