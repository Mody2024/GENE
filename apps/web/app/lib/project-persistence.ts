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

/** Normalize untrusted browser data before it reaches workspace hydration. */
export function normalizeDurableProjectSnapshot(value: unknown): DurableProjectSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<DurableProjectSnapshot>;
  if (!Array.isArray(candidate.projects)) return null;
  const projects = candidate.projects.filter((item): item is GeneProject =>
    Boolean(item && typeof item === "object" && typeof item.id === "string" && item.id.trim())
  ).map(item => ({
    ...item,
    kind: item.kind === "app" || item.plan?.engine === "webapp" ? "app" as const : "game" as const,
    references: Array.isArray(item.references) ? item.references : [],
    versions: Array.isArray(item.versions) ? item.versions.slice(0, 8) : []
  }));
  return {
    projects: projects.slice(0, 8),
    activeProjectId: typeof candidate.activeProjectId === "string" ? candidate.activeProjectId : "",
    savedAt: typeof candidate.savedAt === "string" ? candidate.savedAt : ""
  };
}

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
        resolve(normalizeDurableProjectSnapshot(request.result));
      };
      request.onerror = () => reject(request.error || new Error("Could not read durable project storage."));
    });
  } finally {
    database.close();
  }
}

// IndexedDB transactions are asynchronous. Serialize workspace writes so a slower
// earlier open/transaction cannot finish after a newer snapshot and overwrite it.
let writeQueue: Promise<void> = Promise.resolve();

export function writeDurableProjectSnapshot(
  projects: GeneProject[],
  activeProjectId: string
): Promise<void> {
  const snapshot: DurableProjectSnapshot = {
    projects,
    activeProjectId,
    savedAt: new Date().toISOString()
  };
  const operation = writeQueue.catch(() => undefined).then(async () => {
    const database = await openDatabase();
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(STORE, "readwrite");
        transaction.objectStore(STORE).put(snapshot, WORKSPACE_KEY);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error || new Error("Could not save durable project storage."));
        transaction.onabort = () => reject(transaction.error || new Error("Durable project storage transaction was aborted."));
      });
    } finally {
      database.close();
    }
  });
  writeQueue = operation;
  return operation;
}
