export type CatalogEntry = { id: string; context: number; score: number };
export function isZeroPrice(value: unknown): boolean;
export function scoreModel(id: string, context: number): number;
export function parseFreeCatalog(payload: unknown): CatalogEntry[];
export function extractJsonObjectText(text: string): string | null;
export function classifyProviderFailure(status: number, detail: string): "unavailable" | "paid" | "rate" | "auth" | "server" | "other";

export function describeProviderError(data: unknown): string;
