const DB_NAME = "mozayk";
const DB_VERSION = 1;
const STORE = "draft";
const DRAFT_KEY = "current";

type DraftRecord = {
  json: string;
  savedAt: number;
};

let dbPromise: Promise<IDBDatabase> | null = null;

function getDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is not available."));
  }

  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE);
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onclose = () => {
          dbPromise = null;
        };
        resolve(db);
      };
      request.onerror = () => {
        dbPromise = null;
        reject(request.error ?? new Error("Could not open draft storage."));
      };
    });
  }

  return dbPromise;
}

export function draftJsonFromStoredValue(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const json = (value as DraftRecord).json;
  if (typeof json !== "string" || json.length === 0) return null;
  return json;
}

export async function readDraftJson(): Promise<string | null> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).get(DRAFT_KEY);
    request.onsuccess = () => {
      resolve(draftJsonFromStoredValue(request.result));
    };
    request.onerror = () => {
      reject(request.error ?? new Error("Could not read draft."));
    };
  });
}

export async function writeDraftJson(json: string): Promise<void> {
  const db = await getDb();
  const record: DraftRecord = { json, savedAt: Date.now() };
  return new Promise((resolve, reject) => {
    const request = db
      .transaction(STORE, "readwrite")
      .objectStore(STORE)
      .put(record, DRAFT_KEY);
    request.onsuccess = () => resolve();
    request.onerror = () => {
      reject(request.error ?? new Error("Could not write draft."));
    };
  });
}

export async function clearDraft(): Promise<void> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, "readwrite").objectStore(STORE).delete(DRAFT_KEY);
    request.onsuccess = () => resolve();
    request.onerror = () => {
      reject(request.error ?? new Error("Could not clear draft."));
    };
  });
}
