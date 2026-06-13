const QUEUE_STORAGE_KEY = "local_event_queue_v1";

export function createChromeStorageAdapter(storageArea = chrome.storage.local) {
  return {
    async read() {
      const result = await storageArea.get(QUEUE_STORAGE_KEY);
      return result[QUEUE_STORAGE_KEY] ?? [];
    },
    async write(events) {
      await storageArea.set({ [QUEUE_STORAGE_KEY]: events });
    },
  };
}

export function createMemoryStorageAdapter(initialEvents = []) {
  let events = structuredClone(initialEvents);

  return {
    async read() {
      return structuredClone(events);
    },
    async write(nextEvents) {
      events = structuredClone(nextEvents);
    },
  };
}
