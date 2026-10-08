export type GeneMode = "plan" | "build";
export type GeneThinking = "fast" | "balanced" | "deep";

export type ProjectIntent = {
  genre?: string;
  camera?: string;
  platform?: string;
  multiplayer?: string;
  artStyle?: string;
  mechanics?: string[];
  scope?: string;
};

export type InterviewState = {
  known: Record<string, unknown>;
  blocking: string[];
  optional: string[];
  asked: string[];
  answers: Record<string, string>;
};

export type AgentAction =
  | { type: "read_file"; path: string }
  | { type: "write_file"; path: string; content: string }
  | { type: "patch_file"; path: string; search: string; replace: string }
  | { type: "run_test"; name: string }
  | { type: "build" }
  | { type: "checkpoint"; label: string };

export type BuildEvidence = {
  filesWritten: string[];
  testsPassed: string[];
  testsFailed: string[];
  runtimeStarted: boolean;
  firstFrameRendered: boolean;
  performance: { targetFps: number; measuredFps?: number; drawCalls?: number; triangles?: number };
};
