export type VisualReferenceQuery = { id: string; label: string; query: string };
export function planVisualReferenceQueries(input?: { topic?: string; kind?: "game" | "app"; engine?: string; images?: boolean }): VisualReferenceQuery[];
