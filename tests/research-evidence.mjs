import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildResearchBundle, filterPolyHaven, formatResearchNotes, hasValidImageSignature, parseCommonsFiles, parseGoogleSearchResults } from "../apps/web/app/lib/research-sources.mjs";

const researchRoute = readFileSync(new URL("../apps/web/app/api/research/route.ts", import.meta.url), "utf8");
assert.match(researchRoute, /isAppResearch\s*\?\s*normalizedTopic \+ " UI design interaction patterns accessibility official documentation"/, "app research must query interface and interaction guidance instead of game mechanics");
assert.match(researchRoute, /isAppResearch\s*\?\s*topic \+ " interface UI design interaction patterns accessibility"/, "app research-library links must match app-building intent");
assert.match(researchRoute, /iiprop=url%7Cmime%7Csize%7Csha1%7Cextmetadata/, "Commons queries must actually request the size, dimensions and checksum exposed by asset candidates");
assert.match(researchRoute, /getReader\(\)/, "image reference downloads must stream instead of buffering an unbounded response");
assert.match(researchRoute, /totalBytes > MAX_IMAGE_BYTES/, "image reference downloads enforce the byte cap during streaming");
assert.match(researchRoute, /declaredLength > MAX_IMAGE_BYTES/, "oversized declared image responses are rejected before reading");
assert.equal(hasValidImageSignature("image/png", Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0x00])), true, "PNG signature is accepted");
assert.equal(hasValidImageSignature("image/jpeg", Uint8Array.from([0xff,0xd8,0xff,0xdb])), true, "JPEG signature is accepted");
assert.equal(hasValidImageSignature("image/gif", new TextEncoder().encode("GIF89a")), true, "GIF signature is accepted");
assert.equal(hasValidImageSignature("image/webp", new TextEncoder().encode("RIFFxxxxWEBP")), true, "WebP RIFF signature is accepted");
assert.equal(hasValidImageSignature("image/png", new TextEncoder().encode("not a PNG")), false, "HTML or arbitrary bytes cannot pass as a PNG");
assert.equal(hasValidImageSignature("image/jpeg", new TextEncoder().encode("<html>error</html>")), false, "HTML error pages cannot pass as JPEGs");
assert.equal(hasValidImageSignature("image/svg+xml", new TextEncoder().encode("<svg/>")), false, "untrusted SVG is not accepted as a raster model image payload");
assert.match(researchRoute, /hasValidImageSignature\(mimeType, bytes\)/, "downloaded image payloads must pass file-signature validation before reaching the model");

const topic = "Geometry Dash gameplay mechanics level editor";
const results = parseGoogleSearchResults({ items: [
  { title: "A gameplay guide to Geometry Dash", snippet: "Rhythm platformer mechanics, editor workflows and level design.", link: "https://example.org/geometry-dash-guide" },
  { title: "Cooking with vegetables", snippet: "A guide to roasting seasonal vegetables.", link: "https://food.example.org/vegetables" },
  { title: "Unsafe non-HTTPS", snippet: "Ignore this", link: "http://example.org/geometry-dash" },
  { title: "Missing snippet", link: "https://example.org/no-snippet" }
]}, topic, 5);
assert.equal(results.length, 1, "only complete HTTPS results with meaningful topic relevance should survive");
assert.ok(results[0].relevance >= 15, "weak or unrelated results should be filtered out");
assert.ok(!results.some(result => /vegetables/i.test(result.title)), "unrelated search results must not be shown as useful research");
assert.deepEqual(parseGoogleSearchResults({ items: [{ title: "Unrelated gardening", snippet: "Planting flowers", link: "https://example.org/garden" }] }, topic, 5), [], "a search with only unrelated hits should return no misleading evidence");
assert.match(results[0].url, /^https:\/\//);
assert.equal(results[0].source, "example.org");
assert.equal(results[0].resultType, "technical-evidence");
assert.equal(results[0].integrationState, "reference-only");
const deduplicated = parseGoogleSearchResults({ items: [
  { title: "Geometry Dash mechanics guide", snippet: "Geometry Dash gameplay timing and level editor mechanics.", link: "https://example.org/guide?utm_source=search" },
  { title: "Geometry Dash mechanics guide", snippet: "Geometry Dash gameplay timing and level editor mechanics.", link: "https://example.org/guide#section" },
  { title: "Geometry Dash level editor tutorial", snippet: "Geometry Dash editor and gameplay mechanics.", link: "https://example.org/editor" }
]}, topic, 5);
assert.equal(deduplicated.length, 2, "tracking parameters and URL fragments must not create duplicate research slots");

const commons = parseCommonsFiles({ query: { pages: { "1": { pageid: 1, title: "File:sample.png", index: 1, imageinfo: [{ url: "https://upload.wikimedia.org/sample.png", thumburl: "https://upload.wikimedia.org/sample-thumb.png", mime: "image/png", size: 12345, width: 640, height: 480, sha1: "0123456789abcdef0123456789abcdef01234567", descriptionurl: "https://commons.wikimedia.org/wiki/File:sample.png", extmetadata: { LicenseShortName: { value: "CC BY-SA 4.0" }, Artist: { value: "Sample Artist" } } }] } } } });
assert.equal(commons.length, 1);
assert.equal(commons[0].integrationState, "reference-only", "a research result is not silently treated as imported");
assert.equal(commons[0].licenseState, "source-declared-review-per-asset");
assert.equal(commons[0].downloadState, "candidate-not-imported", "a direct URL is not misrepresented as an imported project file");
assert.equal(commons[0].importReadiness.status, "review-required", "external asset candidates must be reviewed before integration");
assert.equal(commons[0].importReadiness.automaticImportImplemented, false, "research must not claim the not-yet-built importer is available");
assert.equal(commons[0].importReadiness.maxBytes, 15000000, "the planned importer exposes a bounded byte budget");
assert.equal(commons[0].importReadiness.fileSignatureMustBeValidated, true, "declared MIME alone is insufficient for safe asset import");
assert.equal(commons[0].downloadUrl, "https://upload.wikimedia.org/sample.png", "the source's actual download URL is preserved");
assert.equal(commons[0].mimeType, "image/png", "the source MIME type is preserved for future safe import validation");
assert.equal(commons[0].fileSizeBytes, 12345, "source byte size is preserved for import limits");
assert.equal(commons[0].width, 640, "source image width is preserved for compatibility checks");
assert.equal(commons[0].height, 480, "source image height is preserved for compatibility checks");
assert.equal(commons[0].sha1, "0123456789abcdef0123456789abcdef01234567", "a valid source checksum is normalized for integrity tracking");
assert.match(commons[0].attribution, /Sample Artist.*CC BY-SA 4.0/, "credit and license are available together for attribution");

const models = filterPolyHaven({ chair: { name: "Chair", tags: ["furniture"], categories: ["interior"] } }, "chair", 3);
assert.equal(models[0].licenseState, "source-declared-CC0");
assert.equal(models[0].integrationState, "catalog-reference", "catalog matches are not silently treated as downloaded assets");

const bundle = buildResearchBundle({
  topic,
  wiki: [{ title: "Rhythm platformer", extract: "A game genre.", url: "https://en.wikipedia.org/wiki/Rhythm_game", thumb: "https://upload.wikimedia.org/example-thumb.png" }],
  models: [{ id: "chair", name: "Chair", tags: ["furniture"], url: "https://polyhaven.com/a/chair" }],
  webResults: [
    { title: "Geometry Dash gameplay", snippet: "Timing and level editor", link: "https://example.org/gameplay" },
    { title: "Unrelated gardening", snippet: "Planting flowers", link: "https://example.org/garden" }
  ],
  links: [],
  unavailable: []
});
assert.equal(bundle.webResults.length, 1, "unrelated results are removed from the assembled research bundle");
assert.equal(bundle.webResults[0].integrationState, "reference-only");
assert.equal(bundle.facts[0].resultType, "encyclopedic-context");
assert.equal(bundle.facts[0].integrationState, "reference-only", "encyclopedic context is not an imported asset");
assert.ok(bundle.webResults[0].relevance >= 15, "the assembled bundle keeps only meaningful topic matches");
assert.equal(bundle.webResults.some(result => /gardening/i.test(result.title)), false, "unrelated hits must not reach the builder context");
const notes = formatResearchNotes(bundle);
assert.match(notes, /Web research \(ranked by topic relevance\)/);
assert.match(notes, /relevance \d+\/100/);
assert.ok(bundle.images.length > 0, "fixture includes a visual reference");
assert.match(notes, /reference-only images, not imported project assets/i);
assert.ok(bundle.models.length > 0, "fixture includes a model catalog reference");
assert.match(notes, /catalog matches \(Poly Haven; not imported\)/);
assert.match(notes, /catalog reference only, not downloaded or added to the project/i);
console.log("Research evidence tests passed (HTTPS filtering, relevance ranking, and builder notes).");

assert.match(researchRoute, /sha256: createHash\("sha256"\)\.update\(bytes\)\.digest\("hex"\)/, "the exact raster bytes sent to the model must have a traceable SHA-256 fingerprint");
assert.match(researchRoute, /byteSize: bytes\.byteLength/, "the exact downloaded payload size must be recorded");
