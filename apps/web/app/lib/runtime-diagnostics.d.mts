export const PROBE_INIT_SCRIPT: string;
export type RuntimeContract = { kind?: "game" | "app"; engine?: string; requiresMotion?: boolean; requiresInput?: boolean; textGame?: boolean; expectsAudio?: boolean; expectsSpriteAnimation?: boolean };
export type RuntimeCheck = { id: string; status: "pass" | "warn" | "fail"; detail: string };
export type RuntimeVerdict = { verdict: "playable" | "not-playable" | "audio-only-ghost"; checks: RuntimeCheck[]; reasons: string[]; unverified: string[] };
export function looksLikeSpriteSheet(image: { w: number; h: number } | null | undefined): boolean;
export function classifyRuntime(report: any, contract?: RuntimeContract): RuntimeVerdict;
