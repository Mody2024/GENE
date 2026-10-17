export function maskSource(src: string): string;
export function isCollectionName(name: string): boolean;
export function repairUninitializedCollections(src: string): { source: string; fixes: string[] };
export type ScriptFinding = { path: string; name: string; line: number; kind: "undeclared" | "out-of-scope"; message: string };
export function analyzeProjectScripts(
  files: Array<{ path: string; content: string }>,
  options?: { scopeChecks?: boolean }
): { repaired: Array<{ path: string; content: string }>; fixes: string[]; errors: ScriptFinding[] };
