import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import {
  buildResearchBundle,
  buildSearchLinks,
  cleanQuery,
  filterPolyHaven,
  formatResearchNotes,
  hasValidImageSignature,
  keywords,
  musicSearchTerms,
  parseCommonsFiles,
  parseWikipediaPages
} from "../../lib/research-sources.mjs";
import { planVisualReferenceQueries, rankVisualReferenceResults } from "../../lib/visual-reference-planner.mjs";
import { hasToolApproval } from "../../lib/tool-permissions.mjs";

export const runtime = "nodejs";
export const maxDuration = 30;

const USER_AGENT = "GENE-Studio/2.0 (free game and app builder; contact via repository)";
let polyHavenCache: { at: number; data: Record<string, unknown> | null } | null = null;
const buckets = new Map<string, { count: number; resetAt: number }>();

/** Only these hosts are ever fetched for image bytes, so research can never be used to reach other servers. */
const IMAGE_HOSTS = new Set(["upload.wikimedia.org", "cdn.polyhaven.com"]);
const MAX_IMAGE_BYTES = 180_000;
const MAX_IMAGES_SENT = 4;

async function getJson(url: string, timeoutMs = 6_000): Promise<any | null> {
  try {
    const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" }, signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return null;
    return await response.json().catch(() => null);
  } catch {
    return null;
  }
}

async function googleSearch(query: string): Promise<{ items: any[]; configured: boolean; error?: string }> {
  const key = process.env.GOOGLE_CSE_API_KEY;
  const cx = process.env.GOOGLE_CSE_ID;
  if (!key || !cx) return { items: [], configured: false };
  try {
    const params = new URLSearchParams({ key, cx, q: query.slice(0, 240), num: "5" });
    const response = await fetch("https://www.googleapis.com/customsearch/v1?" + params.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(6_000)
    });
    if (!response.ok) return { items: [], configured: true, error: "Google Custom Search returned HTTP " + response.status };
    const data = await response.json().catch(() => null);
    return { items: Array.isArray(data?.items) ? data.items.slice(0, 5) : [], configured: true };
  } catch {
    return { items: [], configured: true, error: "Google Custom Search timed out or could not be reached" };
  }
}

async function wikipedia(query: string, host: string) {
  const url = "https://" + host + "/w/api.php?action=query&format=json&generator=search&gsrlimit=4&prop=extracts%7Cinfo%7Cpageimages&exintro=1&explaintext=1&exchars=700&inprop=url&piprop=thumbnail&pithumbsize=480&redirects=1&origin=*&gsrsearch=" + encodeURIComponent(query);
  return parseWikipediaPages(await getJson(url, 5_000), host);
}

async function commons(query: string, kind: "image" | "audio", limit: number) {
  const filter = kind === "audio" ? "filetype:audio" : "filetype:bitmap";
  const url = "https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=" + limit +
    "&gsrsearch=" + encodeURIComponent(query + " " + filter) +
    "&prop=imageinfo&iiprop=url%7Cmime%7Csize%7Csha1%7Cextmetadata&iiurlwidth=480&iiextmetadatafilter=LicenseShortName%7CArtist&origin=*";
  return parseCommonsFiles(await getJson(url, 6_000), kind);
}

async function polyHavenCatalog(): Promise<Record<string, unknown> | null> {
  if (polyHavenCache && Date.now() - polyHavenCache.at < 60 * 60 * 1000) return polyHavenCache.data;
  const data = await getJson("https://api.polyhaven.com/assets?t=models", 6_000);
  polyHavenCache = data && typeof data === "object"
    ? { at: Date.now(), data }
    : { at: Date.now() - 50 * 60 * 1000, data: null };
  return polyHavenCache.data;
}

/** Download a small thumbnail so GENE receives real pixels as a reference image. */
async function fetchImageData(image: { id: string; title: string; thumb: string }) {
  try {
    const url = new URL(image.thumb);
    if (url.protocol !== "https:" || !IMAGE_HOSTS.has(url.hostname)) return null;
    const response = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(5_000) });
    if (!response.ok) return null;
    const mimeType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(mimeType)) return null;
    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_IMAGE_BYTES) {
      await response.body?.cancel().catch(() => {});
      return null;
    }
    if (!response.body) return null;
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > MAX_IMAGE_BYTES) {
          await reader.cancel().catch(() => {});
          return null;
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    if (!totalBytes) return null;
    const bytes = Buffer.concat(chunks.map(chunk => Buffer.from(chunk)), totalBytes);
    if (!hasValidImageSignature(mimeType, bytes)) return null;
    return { id: image.id, name: image.title, mimeType, byteSize: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex"), dataBase64: bytes.toString("base64") };
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: { code: "BAD_JSON", message: "Request body must be valid JSON." } }, { status: 400 }); }
  if (!hasToolApproval(body, "research")) return NextResponse.json({ ok: false, error: { code: "TOOL_APPROVAL_REQUIRED", message: "Research did not run: GENE requires explicit approval for this exact research query." } }, { status: 403 });
  const topic = cleanQuery(body?.query);
  if (topic.length < 3) return NextResponse.json({ ok: false, error: { code: "QUERY_REQUIRED", message: "Describe what to research (at least a few letters)." } }, { status: 400 });
  const clientKey = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
  const now = Date.now();
  const bucket = buckets.get(clientKey);
  if (!bucket || bucket.resetAt <= now) buckets.set(clientKey, { count: 1, resetAt: now + 60_000 });
  else if (++bucket.count > 20) return NextResponse.json({ ok: false, error: { code: "GENE_RATE_LIMIT", message: "Research limit reached. Please wait a minute." } }, { status: 429 });

  const lowerTopic = topic.toLowerCase();
  // Normalize common spellings so game-specific research targets the real game.
  const researchIsGeometryDash = /\b(geo\s*dash|geodash|geometry\s*dash)\b/i.test(topic);
  const normalizedTopic = researchIsGeometryDash ? "Geometry Dash video game gameplay mechanics level editor" : topic;
  const searchText = researchIsGeometryDash ? normalizedTopic : (keywords(topic).slice(0, 7).join(" ") || topic);
  const arabic = /[؀-ۿ]/.test(topic);
  const wikiHost = arabic ? "ar.wikipedia.org" : "en.wikipedia.org";
  const wantsImages = body?.images !== false;
  const visualQueries = planVisualReferenceQueries({
    topic: normalizedTopic,
    kind: body?.kind === "app" ? "app" : "game",
    engine: typeof body?.engine === "string" ? body.engine : "auto",
    images: wantsImages
  });
  const wants3DModels = body?.engine === "webgl3d" || /\b(3d|three.?dimensional|voxel|low.?poly|blender|3d model|model pack)\b/i.test(lowerTopic);
  const wantsAudio = body?.kind !== "app" && !/\b(no music|silent|no audio|without sound)\b/i.test(lowerTopic);

  const isAppResearch = body?.kind === "app";
  const googleQuery = researchIsGeometryDash
    ? "Geometry Dash gameplay mechanics level editor rhythm platformer design"
    : isAppResearch
      ? normalizedTopic + " UI design interaction patterns accessibility official documentation"
      : normalizedTopic + " game design mechanics level design official documentation";
  const [wiki, catalog, visualImageSets, google, ...audioSets] = await Promise.all([
    wikipedia(searchText, wikiHost),
    wants3DModels ? polyHavenCatalog() : Promise.resolve(null),
    wantsImages ? Promise.all(visualQueries.map(async visual => (await commons(visual.query, "image", 3)).map(image => ({ ...image, category: visual.id, categoryLabel: visual.label })))) : Promise.resolve([]),
    googleSearch(googleQuery),
    ...(wantsAudio ? musicSearchTerms(topic).map(term => commons(term, "audio", 3)) : [])
  ]);
  const rawCommonsImages = (visualImageSets as any[][]).flat().filter((image, index, all) => all.findIndex(other => other.thumb === image.thumb || other.full === image.full) === index);
  const commonsImages = rankVisualReferenceResults(rawCommonsImages, normalizedTopic);
  const commonsAudio = audioSets.flat().filter((track: any, index: number, all: any[]) => all.findIndex(other => other.url === track.url) === index);
  const models = wants3DModels ? filterPolyHaven(catalog, topic, 6) : [];
  const links = buildSearchLinks(researchIsGeometryDash
    ? "Geometry Dash level design editor obstacles rhythm platformer gameplay"
    : isAppResearch
      ? topic + " interface UI design interaction patterns accessibility"
      : topic + " game design mechanics level design");


  const unavailable: string[] = [];
  if (!wiki.length) unavailable.push((arabic ? "Arabic " : "") + "Wikipedia returned nothing for this topic or could not be reached");
  if (!google.configured) unavailable.push("Google Custom Search is not configured; the research used available public sources instead");
  else if (google.error) unavailable.push(google.error);
  else if (!google.items.length) unavailable.push("Google Custom Search returned no web results for this query");
  if (wantsImages && !commonsImages.length) unavailable.push("Wikimedia Commons returned no licensed images for the selected art query");
  if (wants3DModels && !catalog) unavailable.push("the Poly Haven 3D model catalog could not be reached");

  const bundle = buildResearchBundle({ topic, wiki, commonsImages, commonsAudio, models, webResults: google.items, links, unavailable, createdAt: new Date().toISOString() } as any);
  // Apply relevance ranking to the actual bundle, not just the model-image shortlist.
  // This prevents unrelated thumbnails from being shown in the research UI as "references".
  bundle.images = rankVisualReferenceResults(bundle.images as any[], topic) as any;
  if (!wantsImages) bundle.images = [];
  if (researchIsGeometryDash) {
    bundle.facts = [
      ...bundle.facts,
      { title: "Core loop to study", extract: "Geometry Dash is a rhythm-based precision platformer: one-touch input, timed obstacle sequences, repeated attempts, practice/checkpoint options, and instant restart are central genre expectations. Build original level layouts and art.", url: "https://www.robtopgames.com/" },
      { title: "Level-design reference", extract: "Study beat-synchronized obstacle spacing, readable silhouettes, visual anticipation before jumps, difficulty curves, and short feedback loops. Do not copy proprietary levels, music, icons, or branding.", url: "https://www.robtopgames.com/" },
      { title: "Research priority", extract: "Prioritize playable mechanics, jump timing, collision fairness, restart speed, level progression, and original synthesized or properly licensed audio over unrelated image search results.", url: "https://www.robtopgames.com/" }
    ];
  }
  // The bundle is already relevance-ranked and filtered above; preserve that exact order.
  const imageCandidates = [...bundle.images];
  const imageData = wantsImages
    ? (await Promise.all(imageCandidates.slice(0, MAX_IMAGES_SENT + 2).map(fetchImageData))).filter(Boolean).slice(0, MAX_IMAGES_SENT)
    : [];

  return NextResponse.json({
    ok: true,
    topic,
    bundle,
    imageData,
    notes: formatResearchNotes(bundle),
    // Kept for older clients.
    sources: { wikipedia: wiki.length, google: bundle.webResults?.length || 0, polyhaven: models.length, images: bundle.images.length, audio: commonsAudio.length },
    models,
    links,
    partial: unavailable.length > 0
  });
}
