export type VisualReferenceQuery = { id: string; label: string; query: string };
export function planVisualReferenceQueries(input?: { topic?: string; kind?: "game" | "app"; engine?: string; images?: boolean }): VisualReferenceQuery[];
export type RankedVisualReference = { id?: string; title?: string; category?: string; relevanceScore: number; [key: string]: unknown };
export function rankVisualReferenceResults(images: Array<Record<string, unknown>>, topic: string): RankedVisualReference[];
