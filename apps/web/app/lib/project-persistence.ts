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
    let settled = false;
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE);
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      // A blocked open may later succeed after this promise has rejected. Close that
      // late connection rather than leaking a handle that can block future upgrades.
      if (settled) {
        database.close();
        return;
      }
      settled = true;
      resolve(database);
    };
    request.onerror = () => {
      if (settled) return;
      settled = true;
      reject(request.error || new Error("Could not open durable project storage."));
    };
    request.onblocked = () => {
      if (settled) return;
      settled = true;
      reject(new Error("Durable project storage is blocked by another open GENE tab."));
    };
  });
}

export async function readDurableProjectSnapshot(): Promise<DurableProjectSnapshot | null> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE, "readonly");
      const request = transaction.objectStore(STORE).get(WORKSPACE_KEY);
      let result: DurableProjectSnapshot | null = null;
      let requestFinished = false;
      request.onsuccess = () => {
        result = normalizeDurableProjectSnapshot(request.result);
        requestFinished = true;
      };
      request.onerror = () => reject(request.error || new Error("Could not read durable project storage."));
      // Resolve only after the transaction commits. A successful request alone does
      // not prove the containing transaction completed successfully.
      transaction.oncomplete = () => {
        if (requestFinished) resolve(result);
        else reject(new Error("Durable project read completed without a result."));
      };
      transaction.onerror = () => reject(transaction.error || new Error("Could not complete durable project read."));
      transaction.onabort = () => reject(transaction.error || new Error("Durable project read transaction was aborted."));
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
          const savedAt = new Date().toISOString();
          const snapshot = normalizeDurableProjectSnapshot({
            projects: projects.filter(project => !deletedProjectIds.has(project.id)),
            activeProjectId,
            savedAt,
            deletedProjectIds: [...deletedProjectIds].slice(-500)
          });
          if (!snapshot) {
            transaction.abort();
            reject(new Error("Could not normalize the workspace before saving."));
            return;
          }
          // Never persist an active ID that does not exist in the bounded snapshot.
          if (!snapshot.projects.some(project => project.id === snapshot.activeProjectId)) {
            snapshot.activeProjectId = snapshot.projects[0]?.id || "";
          }
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

export type ReconciledWorkspace = {
  projects: GeneProject[];
  activeProjectId: string;
};

/** Reconcile legacy localStorage projects with the durable snapshot deterministically. */
export function reconcileDurableProjectWorkspace(
  localProjectsValue: unknown,
  localActiveProjectId: string,
  durableValue: unknown
): ReconciledWorkspace {
  const local = normalizeDurableProjectSnapshot({
    projects: Array.isArray(localProjectsValue) ? localProjectsValue : [],
    activeProjectId: localActiveProjectId,
    savedAt: "",
    deletedProjectIds: []
  });
  const durable = normalizeDurableProjectSnapshot(durableValue);
  const localProjects = local?.projects || [];
  const deletedIds = new Set(durable?.deletedProjectIds || []);
  const localProjectsAllowed = localProjects.filter(project => !deletedIds.has(project.id));
  const durableProjects = (durable?.projects || []).filter(project => !deletedIds.has(project.id));
  const byId = new Map<string, GeneProject>();

  // Start with durable data, then let an equal-or-newer local copy win.
  for (const project of durableProjects) byId.set(project.id, project);
  for (const project of localProjectsAllowed) {
    const previous = byId.get(project.id);
    if (!previous) {
      byId.set(project.id, project);
      continue;
    }
    const localTime = Date.parse(project.updatedAt || "");
    const durableTime = Date.parse(previous.updatedAt || "");
    if (
      (Number.isFinite(localTime) && (!Number.isFinite(durableTime) || localTime >= durableTime)) ||
      (!Number.isFinite(localTime) && !Number.isFinite(durableTime))
    ) byId.set(project.id, project);
  }

  const localOrder = localProjectsAllowed.map(project => project.id);
  const projects = [...byId.values()].sort((a, b) => {
    const ai = localOrder.indexOf(a.id);
    const bi = localOrder.indexOf(b.id);
    if (ai >= 0 && bi >= 0) return ai - bi;
    if (ai >= 0) return -1;
    if (bi >= 0) return 1;
    const aTime = Date.parse(a.updatedAt || "");
    const bTime = Date.parse(b.updatedAt || "");
    return (Number.isFinite(bTime) ? bTime : -Infinity) - (Number.isFinite(aTime) ? aTime : -Infinity);
  }).slice(0, 8);

  const activeProjectId = [
    local?.activeProjectId,
    durable?.activeProjectId
  ].find(candidate => Boolean(candidate) && projects.some(project => project.id === candidate)) || projects[0]?.id || "";

  return { projects, activeProjectId };
}
