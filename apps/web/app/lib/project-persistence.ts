import type { GeneProject } from "./types";

const DATABASE = "gene-workspace";
const DATABASE_VERSION = 1;
const STORE = "snapshots";
const WORKSPACE_KEY = "workspace";

export type DurableProjectSnapshot = {
  projects: GeneProject[];
  activeProjectId: string;
  savedAt: string;
};

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB is unavailable in this browser."));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE);
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onerror = () => reject(request.error || new Error("Could not open durable project storage."));
    request.onblocked = () => reject(new Error("Durable project storage is blocked by another open GENE tab."));
  });
}

export async function readDurableProjectSnapshot(): Promise<DurableProjectSnapshot | null> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE, "readonly");
      const request = transaction.objectStore(STORE).get(WORKSPACE_KEY);
      request.onsuccess = () => {
        const value = request.result as DurableProjectSnapshot | undefined;
        if (!value || !Array.isArray(value.projects)) return resolve(null);
        resolve({
          projects: value.projects,
          activeProjectId: String(value.activeProjectId || ""),
          savedAt: String(value.savedAt || "")
        });
      };
      request.onerror = () => reject(request.error || new Error("Could not read durable project storage."));
    });
  } finally {
    database.close();
  }
}

export async function writeDurableProjectSnapshot(
  projects: GeneProject[],
  activeProjectId: string
): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE, "readwrite");
      transaction.objectStore(STORE).put({
        projects,
        activeProjectId,
        savedAt: new Date().toISOString()
      } satisfies DurableProjectSnapshot, WORKSPACE_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("Could not save durable project storage."));
      transaction.onabort = () => reject(transaction.error || new Error("Durable project storage transaction was aborted."));
    });
  } finally {
    database.close();
  }
}
