export type ProjectKind = "game" | "app";
export type Mode = "plan" | "build";
export type Thinking = "fast" | "balanced" | "deep";
export type ChatMessage = { id: string; role: "user" | "assistant" | "system"; content: string; createdAt: string; kind?: "question" | "plan" | "build" | "error"; retry?: { prompt: string; operation: string } };
export type Question = {
  id: string;
  text: string;
  why?: string;
  choices?: string[];
  /** The option GENE suggests; shown with a badge. */
  recommended?: string;
  /** Allow several choices before continuing. */
  multi?: boolean;
  /** 1-based position and total, for the interview progress bar. */
  step?: number;
  total?: number;
};
export type ArtAssetPlanItem = { id: string; kind: "sprite" | "background" | "icon" | "logo"; prompt: string };
/** Approved design document derived from the interview answers and plan (see lib/design-doc.ts). */
export type DesignDoc = {
  version: 1;
  title: string;
  pitch: string;
  genre: string;
  audience: string;
  platform: string;
  camera: string;
  controls: string;
  pillars: string[];
  coreLoop: string[];
  content: { scope: string; levels: number; progression: string };
  art: { style: string; palette: string[] };
  audio: { mood: string; notes: string };
  scope: { prototypeMinutes: number; fullMinutes: number };
  milestones: string[];
  risks: string[];
  /** Genre-specific research checklist included in the approved plan sent to the model. */
  researchBrief: string[];
  assetPlan: ArtAssetPlanItem[];
  createdAt: string;
};
export type GamePlan = { title: string; summary: string; kind?: ProjectKind; engine: "canvas2d" | "webgl3d" | "webapp"; tasks: string[]; mechanics: string[]; performanceBudget: { targetFps: number; maxEnemies: number; maxObjects: number; maxParticles: number } };
export type BuildVersion = { number: number; label: string; files: Record<string, string>; createdAt: string; testSummary: string };
export type ReferenceFile = { id: string; name: string; mimeType: string; kind: "image" | "text"; dataBase64?: string; textContent?: string; size: number };
export type GeneProject = {
  id: string;
  name: string;
  kind?: ProjectKind;
  /** User-selected engine for a new project; reused by planning, generation and the scene editor. */
  preferredEngine?: GamePlan["engine"];
  initialPrompt: string;
  mode: Mode;
  thinking: Thinking;
  messages: ChatMessage[];
  answers: Record<string, string>;
  question?: Question | null;
  plan?: GamePlan | null;
  files: Record<string, string>;
  versions: BuildVersion[];
  activeFile: string;
  references: ReferenceFile[];
  updatedAt: string;
  buildRun?: BuildRun | null;
  livingPreview?: LivingBuildPreview | null;
};
/** Durable execution records used by the GENE 1.4 Flash build coordinator. */
export type BuildTaskStatus = "queued" | "running" | "passed" | "failed" | "blocked" | "skipped";
export type BuildTaskKind = "research" | "design" | "scaffold" | "implement" | "integrate" | "test" | "repair" | "package";
export type BuildTask = {
  id: string;
  title: string;
  kind: BuildTaskKind;
  status: BuildTaskStatus;
  dependsOn: string[];
  attempts: number;
  files: string[];
  acceptance: string[];
  lastError?: string;
};
export type CheckpointReason = "task-complete" | "prototype-ready" | "user-interruption" | "repair-failed" | "phase-complete" | "manual";
export type BuildCheckpoint = {
  id: string;
  createdAt: string;
  reason: CheckpointReason;
  planRevision: number;
  completedTaskIds: string[];
  activeTaskId?: string;
  fileManifest: Record<string, string>;
  lastKnownGoodFiles: Record<string, string>;
  validation: { passed: string[]; failed: string[] };
  recoveryNote: string;
};
export type BuildRunStatus = "planning" | "running" | "paused" | "needs-input" | "recovering" | "completed" | "failed";
export type BuildRun = {
  id: string;
  status: BuildRunStatus;
  planRevision: number;
  tasks: BuildTask[];
  checkpoints: BuildCheckpoint[];
  activeTaskId?: string;
  startedAt: string;
  updatedAt: string;
  userChangeQueue: string[];
  prototype?: { targetMinutes?: number; estimatedMinutes: number; ready: boolean; completedObjectives: string[] };
  fullGame?: { targetMinutes?: number; estimatedMinutes: number; contentTargets: string[]; acceptance: string[] };
  lastError?: string;
};
export type LivingPreviewStatus = "not-started" | "booting" | "playable" | "stale" | "error";
export type LivingBuildPreview = {
  status: LivingPreviewStatus;
  lastKnownGoodVersion?: number;
  startedAt?: string;
  updatedAt: string;
  runtimeErrors: string[];
  currentObjectives: string[];
  canContinuePlaying: boolean;
};
export type PatchOperation =
  | { op: "replace_exact"; path: string; expected: string; replacement: string }
  | { op: "replace_range"; path: string; startLine: number; endLine: number; replacement: string }
  | { op: "add_file"; path: string; content: string }
  | { op: "delete_file"; path: string }
  | { op: "rename_file"; path: string; newPath: string }
  | { op: "apply_diff"; path: string; patch: string };

export type AgentResponse = {
  reply: string;
  question?: Question | null;
  plan?: GamePlan | null;
  files?: Array<{ path: string; content: string }>;
  complete?: boolean;
  needsUserDecision?: boolean;
  aiMode?: "gemini" | "fallback";
  tests?: { passed: string[]; failed: string[] };
};