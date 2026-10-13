import type { GeneProject } from "./types";

export type CanonicalProjectMemory = {
  schemaVersion: 1;
  project: { id: string; name: string; kind: "game" | "app"; goal: string };
  confirmedDecisions: Array<{ key: string; value: string }>;
  currentPlan: null | {
    title: string;
    summary: string;
    engine: string;
    tasks: string[];
    mechanics: string[];
    performanceBudget: GeneProject["plan"] extends infer P ? P extends { performanceBudget: infer B } ? B : never : never;
  };
  source: { activeFile: string; filePaths: string[]; currentVersion: number; fileCount: number };
  build: null | {
    status: string;
    planRevision: number;
    activeTask?: string;
    passedTasks: number;
    unfinishedTasks: number;
    latestCheckpoint?: { id: string; reason: string; passedChecks: number; failedChecks: number };
    lastError?: string;
  };
};

const compact = (value: unknown, max = 600) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export function buildCanonicalProjectMemory(project: GeneProject): CanonicalProjectMemory {
  const plan = project.plan;
  const run = project.buildRun;
  const tasks = run?.tasks ?? [];
  const checkpoints = run?.checkpoints ?? [];
  const latest = checkpoints[checkpoints.length - 1];
  const decisions = Object.entries(project.answers ?? {})
    .filter(([key, value]) => compact(key, 120) && compact(value, 400))
    .slice(-16)
    .map(([key, value]) => ({ key: compact(key, 120), value: compact(value, 400) }));
  return {
    schemaVersion: 1,
    project: {
      id: compact(project.id, 120),
      name: compact(project.name, 160),
      kind: project.kind === "app" ? "app" : "game",
      goal: compact(project.initialPrompt, 1000)
    },
    confirmedDecisions: decisions,
    currentPlan: plan ? {
      title: compact(plan.title, 180),
      summary: compact(plan.summary, 800),
      engine: plan.engine,
      tasks: plan.tasks.slice(0, 16).map(task => compact(task, 240)),
      mechanics: plan.mechanics.slice(0, 16).map(item => compact(item, 200)),
      performanceBudget: plan.performanceBudget
    } : null,
    source: {
      activeFile: compact(project.activeFile, 240),
      filePaths: Object.keys(project.files ?? {}).slice(0, 100),
      currentVersion: project.versions?.[0]?.number ?? 0,
      fileCount: Object.keys(project.files ?? {}).length
    },
    build: run ? {
      status: run.status,
      planRevision: run.planRevision,
      activeTask: run.activeTaskId,
      passedTasks: tasks.filter(task => task.status === "passed").length,
      unfinishedTasks: tasks.filter(task => !["passed", "skipped"].includes(task.status)).length,
      latestCheckpoint: latest ? {
        id: latest.id,
        reason: latest.reason,
        passedChecks: latest.validation.passed.length,
        failedChecks: latest.validation.failed.length
      } : undefined,
      lastError: compact(run.lastError, 500) || undefined
    } : null
  };
}

/** Compact memory for the model; never dump all source files or the entire transcript here. */
export function formatCanonicalProjectMemory(project: GeneProject): string {
  return JSON.stringify(buildCanonicalProjectMemory(project));
}
