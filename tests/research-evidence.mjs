import assert from "node:assert/strict";
import { buildResearchBundle, filterPolyHaven, formatResearchNotes, parseCommonsFiles, parseGoogleSearchResults } from "../apps/web/app/lib/research-sources.mjs";

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
assert.equal(new Set(deduplicated.map(item => { const url = new URL(item.url); url.hash = ""; for (const key of Array.from(url.searchParams.keys())) if (/^(utm_.+|fbclid|gclid|mc_cid|mc_eid|ref_src)$/i.test(key)) url.searchParams.delete(key); return url.toString().replace(/\\/$/, "").toLowerCase(); })).size, 2, "deduplicated output contains distinct canonical article URLs");

const commons = parseCommonsFiles({ query: { pages: { "1": { pageid: 1, title: "File:sample.png", index: 1, imageinfo: [{ url: "https://upload.wikimedia.org/sample.png", thumburl: "https://upload.wikimedia.org/sample-thumb.png", mime: "image/png", descriptionurl: "https://commons.wikimedia.org/wiki/File:sample.png", extmetadata: { LicenseShortName: { value: "CC BY-SA 4.0" }, Artist: { value: "Sample Artist" } } }] } } } });
assert.equal(commons.length, 1);
assert.equal(commons[0].integrationState, "reference-only", "a research result is not silently treated as imported");
assert.equal(commons[0].licenseState, "source-declared-review-per-asset");
assert.equal(commons[0].downloadState, "candidate-not-imported", "a direct URL is not misrepresented as an imported project file");
assert.equal(commons[0].downloadUrl, "https://upload.wikimedia.org/sample.png", "the source's actual download URL is preserved");
assert.equal(commons[0].mimeType, "image/png", "the source MIME type is preserved for future safe import validation");
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
