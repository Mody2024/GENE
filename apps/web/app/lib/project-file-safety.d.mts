export type ProjectFilePathResult = { ok: true; path: string } | { ok: false; error: string };
export type ProjectPathInspection = {
  ok: boolean;
  invalid: Array<{ path: unknown; error: string }>;
  collisions: Array<{ path: string; duplicateOf: string }>;
};
export function normalizeProjectFilePath(value: unknown): ProjectFilePathResult;
export function inspectProjectFilePaths(paths: unknown[]): ProjectPathInspection;
