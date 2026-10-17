import { NextRequest, NextResponse } from "next/server";
import { buildSearchLinks, cleanQuery, filterPolyHaven, formatResearchNotes, keywords } from "../../lib/research-sources.mjs";

export const runtime = "nodejs";
export const maxDuration = 30;

const USER_AGENT = "GENE-Studio/2.0 (free game and app builder; contact via repository)";
let polyHavenCache: { at: number; data: Record<string, unknown> | null } | null = null;
const buckets = new Map<string, { count: number; resetAt: number }>();

async function wikipedia(query: string): Promise<Array<{ title: string; extract: string; url: string }>> {
  const url = "https://en.wikipedia.org/w/api.php?action=query&format=json&generator=search&gsrlimit=3&prop=extracts%7Cinfo&exintro=1&explaintext=1&exchars=700&inprop=url&redirects=1&gsrsearch=" + encodeURIComponent(query);
  try {
    const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" }, signal: AbortSignal.timeout(5_000) });
    if (!response.ok) return [];
    const data: any = await response.json().catch(() => null);
    const pages = Object.values(data?.query?.pages || {}) as Array<{ title?: string; extract?: string; fullurl?: string; index?: number }>;
    return pages
      .filter(page => typeof page.title === "string" && typeof page.extract === "string" && page.extract.trim())
      .sort((a, b) => (a.index || 0) - (b.index || 0))
      .map(page => ({ title: String(page.title), extract: String(page.extract), url: String(page.fullurl || "https://en.wikipedia.org/wiki/" + encodeURIComponent(String(page.title))) }));
  } catch {
    return [];
  }
}

async function polyHavenCatalog(): Promise<Record<string, unknown> | null> {
  if (polyHavenCache && Date.now() - polyHavenCache.at < 60 * 60 * 1000) return polyHavenCache.data;
  try {
    const response = await fetch("https://api.polyhaven.com/assets?t=models", { headers: { "User-Agent": USER_AGENT, Accept: "application/json" }, signal: AbortSignal.timeout(6_000) });
    if (!response.ok) { polyHavenCache = { at: Date.now() - 50 * 60 * 1000, data: null }; return null; }
    const data = await response.json().catch(() => null);
    polyHavenCache = { at: Date.now(), data: data && typeof data === "object" ? data : null };
    return polyHavenCache.data;
  } catch {
    polyHavenCache = { at: Date.now() - 50 * 60 * 1000, data: null };
    return null;
  }
}

export async function POST(request: NextRequest) {
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: { code: "BAD_JSON", message: "Request body must be valid JSON." } }, { status: 400 }); }
  const topic = cleanQuery(body?.query);
  if (topic.length < 3) return NextResponse.json({ ok: false, error: { code: "QUERY_REQUIRED", message: "Describe what to research (at least a few letters)." } }, { status: 400 });
  const clientKey = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
  const now = Date.now();
  const bucket = buckets.get(clientKey);
  if (!bucket || bucket.resetAt <= now) buckets.set(clientKey, { count: 1, resetAt: now + 60_000 });
  else if (++bucket.count > 20) return NextResponse.json({ ok: false, error: { code: "GENE_RATE_LIMIT", message: "Research limit reached. Please wait a minute." } }, { status: 429 });

  const words = keywords(topic);
  const wikiQuery = words.slice(0, 4).join(" ") || topic;
  const [wiki, catalog] = await Promise.all([wikipedia(wikiQuery), polyHavenCatalog()]);
  const models = filterPolyHaven(catalog, topic, 6);
  const links = buildSearchLinks(words.slice(0, 3).join(" ") || topic);
  const unreachable: string[] = [];
  if (!wiki.length) unreachable.push("Wikipedia returned nothing for this topic or could not be reached");
  if (!catalog) unreachable.push("the Poly Haven model catalog could not be reached");
  const notes = formatResearchNotes({
    topic,
    wiki,
    models,
    links,
    note: unreachable.length ? "Some live sources were unavailable (" + unreachable.join("; ") + "), so only the verified parts are listed." : ""
  });
  return NextResponse.json({
    ok: true,
    topic,
    sources: { wikipedia: wiki.length, polyhaven: models.length },
    models,
    links,
    notes,
    partial: unreachable.length > 0
  });
}
