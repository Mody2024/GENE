import type { GeneProject } from "./types";

const DATABASE = "gene-workspace";
const DATABASE_VERSION = 1;
const STORE = "snapshots";
const WORKSPACE_KEY = "workspace";

export type DurableProjectSnapshot = {
  projects: GeneProject[];
  activeProjectId: string;
  savedAt: string;
  deletedProjectIds: string[];
};

/** Normalize untrusted browser data before it reaches workspace hydration. */
export function normalizeDurableProjectSnapshot(value: unknown): DurableProjectSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<DurableProjectSnapshot>;
  if (!Array.isArray(candidate.projects)) return null;
  const deletedProjectIds = Array.isArray(candidate.deletedProjectIds)
    ? [...new Set(candidate.deletedProjectIds.filter((id): id is string => typeof id === "string" && id.trim()).map(id => id.slice(0, 256)))].slice(-500)
    : [];
  const deleted = new Set(deletedProjectIds);
  const seen = new Set<string>();
  const projects = candidate.projects.filter((item): item is GeneProject =>
    Boolean(item && typeof item === "object" && typeof item.id === "string" && item.id.trim() && item.id.length <= 256)
  ).filter(item => {
    if (deleted.has(item.id) || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  }).slice(0, 8).map(item => ({
    ...item,
    kind: item.kind === "app" || item.plan?.engine === "webapp" ? "app" as const : "game" as const,
    references: Array.isArray(item.references) ? item.references.slice(0, 100) : [],
    versions: Array.isArray(item.versions) ? item.versions.slice(0, 8) : []
  }));
  const requestedActiveId = typeof candidate.activeProjectId === "string" ? candidate.activeProjectId.slice(0, 256) : "";
  return {
    projects,
    activeProjectId: projects.some(project => project.id === requestedActiveId) ? requestedActiveId : "",
    savedAt: typeof candidate.savedAt === "string" && candidate.savedAt.length <= 64 ? candidate.savedAt : "",
    deletedProjectIds
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
  activeProjectId: string,
  deletedProjectId?: string
): Promise<void> {
  const operation = writeQueue.catch(() => undefined).then(async () => {
    const database = await openDatabase();
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(STORE, "readwrite");
        const store = transaction.objectStore(STORE);
        const previousRequest = store.get(WORKSPACE_KEY);
        previousRequest.onsuccess = () => {
          const previous = normalizeDurableProjectSnapshot(previousRequest.result);
          const deletedProjectIds = new Set(previous?.deletedProjectIds || []);
          if (deletedProjectId) deletedProjectIds.add(deletedProjectId);
          // A later save must not erase deletion history; only an explicit restore flow
          // should ever remove a tombstone.
          const snapshot: DurableProjectSnapshot = {
            projects: projects.filter(project => !deletedProjectIds.has(project.id)),
            activeProjectId: deletedProjectIds.has(activeProjectId) ? "" : activeProjectId,
            savedAt: new Date().toISOString(),
            deletedProjectIds: [...deletedProjectIds].slice(-500)
          };
          store.put(snapshot, WORKSPACE_KEY);
        };
        previousRequest.onerror = () => reject(previousRequest.error || new Error("Could not read previous durable snapshot."));
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

/** Merge a recovered snapshot without reviving deleted or duplicate project IDs. */
export function mergeDurableProjectSnapshots(
  currentValue: unknown,
  recoveredValue: unknown
): DurableProjectSnapshot | null {
  const current = normalizeDurableProjectSnapshot(currentValue);
  const recovered = normalizeDurableProjectSnapshot(recoveredValue);
  if (!current && !recovered) return null;
  if (!current) return recovered;
  if (!recovered) return current;

  const deletedProjectIds = [...new Set([
    ...current.deletedProjectIds,
    ...recovered.deletedProjectIds
  ])].slice(-500);
  const deleted = new Set(deletedProjectIds);
  const merged = new Map<string, GeneProject>();

  // Prefer current workspace state; recovered snapshots fill missing IDs only.
  for (const project of current.projects) {
    if (!deleted.has(project.id)) merged.set(project.id, project);
  }
  for (const project of recovered.projects) {
    if (!deleted.has(project.id) && !merged.has(project.id)) merged.set(project.id, project);
  }
  const projects = [...merged.values()].slice(0, 8);
  const activeProjectId = [current.activeProjectId, recovered.activeProjectId]
    .find(candidate => Boolean(candidate) && projects.some(project => project.id === candidate)) || "";
  const currentTime = Date.parse(current.savedAt);
  const recoveredTime = Date.parse(recovered.savedAt);
  const savedAt = Number.isFinite(currentTime) && Number.isFinite(recoveredTime)
    ? new Date(Math.max(currentTime, recoveredTime)).toISOString()
    : Number.isFinite(currentTime)
      ? current.savedAt
      : Number.isFinite(recoveredTime)
        ? recovered.savedAt
        : "";

  return { projects, activeProjectId, savedAt, deletedProjectIds };
}
