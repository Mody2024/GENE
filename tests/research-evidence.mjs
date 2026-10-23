import assert from "node:assert/strict";
import { buildResearchBundle, filterPolyHaven, formatResearchNotes, parseCommonsFiles, parseGoogleSearchResults } from "../apps/web/app/lib/research-sources.mjs";

const topic = "Geometry Dash gameplay mechanics level editor";
const results = parseGoogleSearchResults({ items: [
  { title: "A gameplay guide to Geometry Dash", snippet: "Rhythm platformer mechanics, editor workflows and level design.", link: "https://example.org/geometry-dash-guide" },
  { title: "Cooking with vegetables", snippet: "A guide to roasting seasonal vegetables.", link: "https://food.example.org/vegetables" },
  { title: "Unsafe non-HTTPS", snippet: "Ignore this", link: "http://example.org/geometry-dash" },
  { title: "Missing snippet", link: "https://example.org/no-snippet" }
]}, topic, 5);
assert.equal(results.length, 2, "only complete HTTPS search results should survive");
assert.ok(results[0].relevance > results[1].relevance, "results should be ranked by query relevance");
assert.match(results[0].url, /^https:\/\//);
assert.equal(results[0].source, "example.org");
assert.equal(results[0].resultType, "technical-evidence");
assert.equal(results[0].integrationState, "reference-only");

const commons = parseCommonsFiles({ query: { pages: { "1": { pageid: 1, title: "File:sample.png", index: 1, imageinfo: [{ url: "https://upload.wikimedia.org/sample.png", thumburl: "https://upload.wikimedia.org/sample-thumb.png", mime: "image/png", descriptionurl: "https://commons.wikimedia.org/wiki/File:sample.png", extmetadata: { LicenseShortName: { value: "CC BY-SA 4.0" }, Artist: { value: "Sample Artist" } } }] } } } });
assert.equal(commons.length, 1);
assert.equal(commons[0].integrationState, "reference-only", "a research result is not silently treated as imported");
assert.equal(commons[0].licenseState, "source-declared-review-per-asset");

const models = filterPolyHaven({ chair: { name: "Chair", tags: ["furniture"], categories: ["interior"] } }, "chair", 3);
assert.equal(models[0].licenseState, "source-declared-CC0");
assert.equal(models[0].integrationState, "catalog-reference", "catalog matches are not silently treated as downloaded assets");

const bundle = buildResearchBundle({
  topic,
  wiki: [{ title: "Rhythm platformer", extract: "A game genre.", url: "https://en.wikipedia.org/wiki/Rhythm_game" }],
  webResults: [
    { title: "Geometry Dash gameplay", snippet: "Timing and level editor", link: "https://example.org/gameplay" },
    { title: "Unrelated gardening", snippet: "Planting flowers", link: "https://example.org/garden" }
  ],
  links: [],
  unavailable: []
});
assert.equal(bundle.webResults.length, 2);
assert.equal(bundle.webResults[0].integrationState, "reference-only");
assert.ok(bundle.webResults[0].relevance >= bundle.webResults[1].relevance);
const notes = formatResearchNotes(bundle);
assert.match(notes, /Web research \(ranked by topic relevance\)/);
assert.match(notes, /relevance \d+\/100/);
if (bundle.images.length) assert.match(notes, /reference-only images, not imported project assets/i);
if (bundle.models.length) assert.match(notes, /catalog matches \(Poly Haven; not imported\)/);
console.log("Research evidence tests passed (HTTPS filtering, relevance ranking, and builder notes).");
