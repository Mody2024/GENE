export type FileChange = { path: string; status: "added" | "modified" | "removed"; added: number; removed: number };
export function diffLines(before: string, after: string): { added: number; removed: number };
export function summarizeChanges(before: Record<string, string>, after: Record<string, string>, paths?: string[]): FileChange[];
export function describeChanges(changes: FileChange[], limit?: number): string;
