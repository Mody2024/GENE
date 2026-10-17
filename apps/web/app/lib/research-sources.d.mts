export type SearchLink = { id: string; label: string; kind: string; license: string; url: string };
export type PolyHavenMatch = { id: string; name: string; tags: string[]; score: number; url: string; license: string };
export function cleanQuery(value: string): string;
export function keywords(value: string): string[];
export function buildSearchLinks(query: string): SearchLink[];
export function filterPolyHaven(catalog: unknown, query: string, limit?: number): PolyHavenMatch[];
export function formatResearchNotes(input: {
  topic: string;
  wiki?: Array<{ title: string; extract: string; url: string }>;
  models?: PolyHavenMatch[];
  links?: SearchLink[];
  note?: string;
}): string;
