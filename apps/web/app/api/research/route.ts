import { NextRequest, NextResponse } from "next/server";
import {
  buildResearchBundle,
  buildSearchLinks,
  cleanQuery,
  filterPolyHaven,
  formatResearchNotes,
  keywords,
  musicSearchTerms,
  parseCommonsFiles,
  parseWikipediaPages
} from "../../lib/research-sources.mjs";

export const runtime = "nodejs";
export const maxDuration = 30;

const USER_AGENT = "GENE-Studio/2.0 (free game and app builder; contact via repository)";
let polyHavenCache: { at: number; data: Record<string, unknown> | null } | null = null;
const buckets = new Map<string, { count: number; resetAt: number }>();

/** Only these hosts are ever fetched for image bytes, so research can never be used to reach other servers. */
const IMAGE_HOSTS = new Set(["upload.wikimedia.org", "cdn.polyhaven.com"]);
const MAX_IMAGE_BYTES = 180_000;
const MAX_IMAGES_SENT = 3;

async function getJson(url: string, timeoutMs = 6_000): Promise<any | null> {
  try {
    const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" }, signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return null;
    return await response.json().catch(() => null);
  } catch {
    return null;
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
    "&prop=imageinfo&iiprop=url%7Cmime%7Cextmetadata&iiurlwidth=480&iiextmetadatafilter=LicenseShortName%7CArtist&origin=*";
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
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) return null;
    return { id: image.id, name: image.title, mimeType, dataBase64: bytes.toString("base64") };
  } catch {
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
  const searchText = words.slice(0, 5).join(" ") || topic;
  const lowerTopic = topic.toLowerCase();
  const arabic = /[؀-ۿ]/.test(topic);
  const wikiHost = arabic ? "ar.wikipedia.org" : "en.wikipedia.org";
  const wantsImages = body?.images !== false;
  const wants3DModels = /\b(3d|three.?dimensional|voxel|low.?poly|blender|3d model|model pack)\b/i.test(lowerTopic);
  const wantsCharacterArt = /\b(character|player sprite|hero sprite|enemy|npc|creature|character design|sprite sheet)\b/i.test(lowerTopic);
  const wantsAudio = !/\b(no music|silent|no audio|without sound)\b/i.test(lowerTopic);
  const assetQuery = wantsCharacterArt
    ? topic + " 2D game character sprite"
    : /\b(background|environment|world|level|landscape|scene|tileset|terrain)\b/i.test(lowerTopic)
      ? topic + " game environment background"
      : topic + " game level art environment";

  const [wiki, catalog, commonsImages, ...audioSets] = await Promise.all([
    wikipedia(searchText, wikiHost),
    wants3DModels ? polyHavenCatalog() : Promise.resolve(null),
    wantsImages ? commons(assetQuery, "image", 6) : Promise.resolve([]),
    ...(wantsAudio ? musicSearchTerms(topic).map(term => commons(term, "audio", 3)) : [])
  ]);
  const commonsAudio = audioSets.flat().filter((track: any, index: number, all: any[]) => all.findIndex(other => other.url === track.url) === index);
  const models = wants3DModels ? filterPolyHaven(catalog, topic, 6) : [];
  const links = buildSearchLinks(wantsCharacterArt ? topic + " game sprite" : topic + " 2D game design");

  const unavailable: string[] = [];
  if (!wiki.length) unavailable.push((arabic ? "Arabic " : "") + "Wikipedia returned nothing for this topic or could not be reached");
  if (wantsImages && !commonsImages.length) unavailable.push("Wikimedia Commons returned no licensed images for the selected art query");
  if (wants3DModels && !catalog) unavailable.push("the Poly Haven 3D model catalog could not be reached");

  const bundle = buildResearchBundle({ topic, wiki, commonsImages, commonsAudio, models, links, unavailable, createdAt: new Date().toISOString() });
  const imageData = wantImages
    ? (await Promise.all(bundle.images.slice(0, MAX_IMAGES_SENT + 2).map(fetchImageData))).filter(Boolean).slice(0, MAX_IMAGES_SENT)
    : [];

  return NextResponse.json({
    ok: true,
    topic,
    bundle,
    imageData,
    notes: formatResearchNotes(bundle),
    // Kept for older clients.
    sources: { wikipedia: wiki.length, polyhaven: models.length, images: bundle.images.length, audio: commonsAudio.length },
    models,
    links,
    partial: unavailable.length > 0
  });
}
