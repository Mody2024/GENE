export type FailureKind = "config" | "provider-unavailable" | "rate-limit" | "provider-busy" | "timeout" | "network" | "bad-output" | "conflict" | "validation" | "runtime" | "unknown";
export type FailureClass = { kind: FailureKind; retryable: boolean; autoFix: boolean; title: string };
export function classifyFailure(message: unknown, code?: unknown, status?: unknown): FailureClass;
export function backoffMs(kind: FailureKind, attempt: number): number;
export function retryGuidance(kind: FailureKind, failure: unknown, attempt: number): string;
export function repairTargetsFor(message: unknown, stagePaths?: string[]): string[];
