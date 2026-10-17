export function sanitizeSvg(input: string): { ok: true; svg: string; bytes: number; elements: number; shapes: number } | { ok: false; error: string };
export function safeArtName(value: string, fallback?: string): string;
