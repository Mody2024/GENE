import type {
  BuildCheckpoint,
  BuildRun,
  BuildTask,
  BuildTaskKind,
  GeneProject,
} from "./types";

export type BuildIntent = {
  projectId: string;
  now?: string;
  prototypeMinutes?: number;
  fullGameMinutes?: number;
  tasks: Array<{
    id: string;
    title: string;
    kind: BuildTaskKind;
    dependsOn?: string[];
    files?: string[];
    acceptance: string[];
  }>;
  prototypeObjectives?: string[];
  fullGameContent?: string[];
};

const isoNow = (value?: string) => value ?? new Date().toISOString();

export function createBuildRun(intent: BuildIntent): BuildRun {
  const ids = new Set(intent.tasks.map((task) => task.id));
  if (ids.size !== intent.tasks.length) throw new Error("Build task IDs must be unique.");
  for (const task of intent.tasks) {
    for (const dependency of task.dependsOn ?? []) {
      if (!ids.has(dependency)) throw new Error(`Task "${task.id}" depends on missing task "${dependency}".`);
      if (dependency === task.id) throw new Error(`Task "${task.id}" cannot depend on itself.`);
    }
  }
  assertAcyclic(intent.tasks.map((task) => ({ id: task.id, dependsOn: task.dependsOn ?? [] })));
  const now = isoNow(intent.now);
  const tasks: BuildTask[] = intent.tasks.map((task) => ({
    id: task.id,
    title: task.title,
    kind: task.kind,
    status: "queued",
    dependsOn: task.dependsOn ?? [],
    attempts: 0,
    files: task.files ?? [],
    acceptance: task.acceptance,
  }));
  return {
    id: `build-${intent.projectId}-${Date.parse(now).toString(36)}`,
    status: "planning",
    planRevision: 1,
    tasks,
    checkpoints: [],
    startedAt: now,
    updatedAt: now,
    userChangeQueue: [],
    prototype: {
      targetMinutes: typeof intent.prototypeMinutes === "number" && intent.prototypeMinutes > 0 ? intent.prototypeMinutes : undefined,
      estimatedMinutes: 0,
      ready: false,
      completedObjectives: intent.prototypeObjectives ?? [],
    },
    fullGame: {
      targetMinutes: typeof intent.fullGameMinutes === "number" && intent.fullGameMinutes > 0 ? intent.fullGameMinutes : undefined,
      estimatedMinutes: 0,
      contentTargets: intent.fullGameContent ?? [],
      acceptance: [
        "Full-game content is distinct from the prototype content budget",
        "A complete progression path and ending exist",
        "The main gameplay loop and completion conditions are validated",
      ],
    },
  };
}

function assertAcyclic(tasks: Array<{ id: string; dependsOn: string[] }>) {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) throw new Error(`Build task dependency cycle detected at "${id}".`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of byId.get(id)?.dependsOn ?? []) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const task of tasks) visit(task.id);
}

export function getReadyTasks(run: BuildRun): BuildTask[] {
  const status = new Map(run.tasks.map((task) => [task.id, task.status]));
  if (run.status === "paused" || run.status === "needs-input" || run.status === "completed" || run.status === "failed") return [];
  return run.tasks.filter((task) =>
    task.status === "queued" &&
    task.dependsOn.every((dependency) => status.get(dependency) === "passed")
  );
}

export function setTaskStatus(
  run: BuildRun,
  taskId: string,
  status: BuildTask["status"],
  now?: string,
  error?: string,
): BuildRun {
  const target = run.tasks.find((task) => task.id === taskId);
  if (!target) throw new Error(`Unknown build task "${taskId}".`);
  if (target.status !== status) {
    const allowedNext: Record<BuildTask["status"], BuildTask["status"][]> = {
      queued: ["running", "blocked", "skipped"],
      running: ["queued", "passed", "failed", "blocked"],
      passed: [],
      failed: ["queued"],
      blocked: ["queued"],
      skipped: [],
    };
    if (!allowedNext[target.status].includes(status)) {
      throw new Error(`Invalid task status transition for "${taskId}": ${target.status} → ${status}.`);
    }
  }
  if (status === "running" && !getReadyTasks(run).some((task) => task.id === taskId) && target.status !== "running") {
    throw new Error(`Task "${taskId}" is not ready; its dependencies must pass first.`);
  }
  const tasks = run.tasks.map((task) => task.id !== taskId ? task : ({
    ...task,
    status,
    attempts: status === "running" && task.status !== "running" ? task.attempts + 1 : task.attempts,
    lastError: status === "failed" || status === "blocked" ? error ?? task.lastError : undefined,
  }));
  // "skipped" is not proof of acceptance: until the task model explicitly marks
  // optional work, every planned task must pass before the run can be completed.
  const allPassed = tasks.length > 0 && tasks.every((task) => task.status === "passed");
  return {
    ...run,
    tasks,
    activeTaskId: status === "running" ? taskId : (run.activeTaskId === taskId ? undefined : run.activeTaskId),
    status: allPassed ? "completed" : status === "failed" ? "recovering" : status === "blocked" || status === "skipped" ? "needs-input" : "running",
    updatedAt: isoNow(now),
    lastError: status === "failed" || status === "blocked" ? error ?? run.lastError : undefined,
  };
}

function retainRecentCheckpoints(checkpoints: BuildCheckpoint[], maxCount = 8, maxSnapshotChars = 1_500_000): BuildCheckpoint[] {
  const retained: BuildCheckpoint[] = [];
  let totalChars = 0;
  // Walk newest-first so the latest recovery point is never discarded just to fit the budget.
  for (const checkpoint of checkpoints.slice().reverse()) {
    const snapshotChars = Object.values(checkpoint.lastKnownGoodFiles).reduce((total, source) => total + source.length, 0);
    if (retained.length >= maxCount) break;
    if (retained.length > 0 && totalChars + snapshotChars > maxSnapshotChars) break;
    retained.push(checkpoint);
    totalChars += snapshotChars;
  }
  return retained.reverse();
}

export function checkpointBuild(
  run: BuildRun,
  files: Record<string, string>,
  validation: { passed: string[]; failed: string[] },
  reason: BuildCheckpoint["reason"],
  recoveryNote: string,
  now?: string,
): BuildRun {
  const fileManifest = Object.fromEntries(
    Object.entries(files).map(([path, source]) => [path, hashText(source)]),
  );
  const checkpoint: BuildCheckpoint = {
    id: `cp-${run.id}-${run.checkpoints.length + 1}`,
    createdAt: isoNow(now),
    reason,
    planRevision: run.planRevision,
    completedTaskIds: run.tasks.filter((task) => task.status === "passed").map((task) => task.id),
    activeTaskId: run.activeTaskId,
    fileManifest,
    lastKnownGoodFiles: { ...files },
    validation: { passed: [...validation.passed], failed: [...validation.failed] },
    recoveryNote,
  };
  return {
    ...run,
    // Keep a bounded recovery history: every checkpoint may contain a full source snapshot.
    checkpoints: retainRecentCheckpoints([...run.checkpoints, checkpoint]),
    updatedAt: isoNow(now),
    status: reason === "user-interruption" ? "paused" : run.status,
  };
}

export function queueUserChange(run: BuildRun, request: string, now?: string): BuildRun {
  const trimmed = request.trim();
  if (!trimmed) return run;
  const next = {
    ...run,
    userChangeQueue: [...run.userChangeQueue, trimmed],
    planRevision: run.planRevision + 1,
    status: "paused" as const,
    updatedAt: isoNow(now),
  };
  return next;
}

export function resumeBuild(run: BuildRun, now?: string): BuildRun {
  if (run.status === "completed") throw new Error("A completed build cannot be resumed; create a new run or revise its plan.");
  const tasks = run.tasks.map((task) => task.status === "running" ? { ...task, status: "queued" as const } : task);
  return {
    ...run,
    tasks,
    status: "running",
    activeTaskId: undefined,
    updatedAt: isoNow(now),
  };
}

export function recoverFromCheckpoint(
  run: BuildRun,
  checkpointId?: string,
  now?: string,
): { run: BuildRun; files: Record<string, string> } {
  const checkpoint = checkpointId
    ? run.checkpoints.find((item) => item.id === checkpointId)
    : run.checkpoints[run.checkpoints.length - 1];
  if (!checkpoint) throw new Error("No checkpoint is available for recovery.");
  const completed = new Set(checkpoint.completedTaskIds);
  return {
    run: {
      ...run,
      tasks: run.tasks.map((task) => ({
        ...task,
        status: completed.has(task.id) ? "passed" : "queued",
        lastError: undefined,
      })),
      status: "recovering",
      activeTaskId: undefined,
      updatedAt: isoNow(now),
      lastError: undefined,
    },
    files: { ...checkpoint.lastKnownGoodFiles },
  };
}

export function attachBuildRun(project: GeneProject, run: BuildRun): GeneProject {
  return { ...project, buildRun: run, updatedAt: run.updatedAt };
}

function hashText(value: string): string {
  // Stable, deterministic, non-cryptographic fingerprint for change detection.
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
