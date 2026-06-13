const QUEUE_STORAGE_KEY = "local_event_queue_v1";
const DEAD_LETTER_STORAGE_KEY = "event_dead_letter_queue_v1";

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

export function createChromeDeadLetterStorage(
  storageArea = chrome.storage.local,
) {
  return {
    async read() {
      const result = await storageArea.get(DEAD_LETTER_STORAGE_KEY);
      return result[DEAD_LETTER_STORAGE_KEY] ?? [];
    },
    async write(records) {
      await storageArea.set({
        [DEAD_LETTER_STORAGE_KEY]: structuredClone(records),
      });
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

export function createMemoryDeadLetterStorage(initialRecords = []) {
  let records = structuredClone(initialRecords);
  return {
    async read() {
      return structuredClone(records);
    },
    async write(nextRecords) {
      records = structuredClone(nextRecords);
    },
  };
}
