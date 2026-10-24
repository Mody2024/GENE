export const APPROVAL_TTL_MS: number;
export const GATED_TOOLS: Readonly<Record<string, string>>;
export function canonicalToolCall(tool: string, input: unknown): string;
export function stripToolApproval<T>(body: T): T;
export function describeToolCall(tool: string, input: unknown): { tool: string; label: string; detail: string; extras: string[] };
