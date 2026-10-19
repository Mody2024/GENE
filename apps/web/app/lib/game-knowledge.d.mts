export type GameKnowledgeEntry = {
  id: string; title: string; pattern: string; examples: string[]; engine: string; loop: string;
  mechanics: string[]; feel: string[]; models: string; sfx: string[]; pitfalls: string[];
  music: { mood: string; bpm: number; scale: string; instruments: string; notes: string };
};
export type MusicStyle = { genre: string; mood: string; bpm: number; scale: string; instruments: string; notes: string; sfx: string[]; source: string; reference: string };
export const GAME_KNOWLEDGE: GameKnowledgeEntry[];
export const GENE_CAPABILITIES: string[];
export function matchGameKnowledge(text: string, limit?: number): GameKnowledgeEntry[];
export function musicStylesFor(text: string, limit?: number): MusicStyle[];
export function formatBrain(text: string, options?: { limit?: number; maxChars?: number }): string;
