import assert from "node:assert/strict";
import { buildResearchBundle, formatResearchNotes, parseGoogleSearchResults } from "../apps/web/app/lib/research-sources.mjs";

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
assert.ok(bundle.webResults[0].relevance >= bundle.webResults[1].relevance);
const notes = formatResearchNotes(bundle);
assert.match(notes, /Web research \(ranked by topic relevance\)/);
assert.match(notes, /relevance \d+\/100/);
console.log("Research evidence tests passed (HTTPS filtering, relevance ranking, and builder notes).");

// Evidence states: references are never presented as imported assets.
import { classifyLicense } from "../apps/web/app/lib/research-sources.mjs";
assert.equal(classifyLicense("CC0"), "open");
assert.equal(classifyLicense("CC BY-SA 4.0"), "open");
assert.equal(classifyLicense("Public domain"), "open");
assert.equal(classifyLicense("CC BY-NC 4.0"), "restricted");
assert.equal(classifyLicense("See Wikipedia page"), "unverified");
assert.equal(classifyLicense(""), "unverified");
const evidenceBundle = buildResearchBundle({
  topic: "low poly forest platformer",
  wiki: [{ title: "Forest", extract: "A forest.", url: "https://en.wikipedia.org/wiki/Forest", thumb: "https://upload.wikimedia.org/forest.jpg" }],
  commonsImages: [{ id: "c1", title: "Pine", thumb: "https://upload.wikimedia.org/pine.jpg", full: "https://upload.wikimedia.org/pine.jpg", page: "https://commons.wikimedia.org/wiki/File:Pine.jpg", license: "CC BY-SA 4.0", credit: "A", source: "Wikimedia Commons" }],
  commonsAudio: [{ id: "a1", title: "Wind", url: "https://upload.wikimedia.org/wind.ogg", page: "https://commons.wikimedia.org/wiki/File:Wind.ogg", license: "CC BY-NC 3.0", credit: "B", source: "Wikimedia Commons" }],
  models: [{ id: "tree_01", name: "Tree", tags: ["tree"], url: "https://polyhaven.com/a/tree_01", license: "CC0" }],
  links: [], unavailable: []
});
assert.ok(evidenceBundle.images.length >= 2 && evidenceBundle.images.every(image => image.state === "reference-only"), "images must stay reference-only");
assert.equal(evidenceBundle.images.find(image => image.id === "c1").licenseState, "open");
assert.equal(evidenceBundle.images.find(image => image.id.startsWith("wiki-")).licenseState, "unverified", "vague Wikipedia licence is not verified");
assert.equal(evidenceBundle.models[0].state, "downloadable");
assert.equal(evidenceBundle.music.tracks[0].licenseState, "restricted");
assert.equal(evidenceBundle.evidence.assets.imported, 0, "research never claims an import");
assert.equal(evidenceBundle.evidence.visual.imported, 0);
assert.equal(evidenceBundle.evidence.assets.downloadable, 2);
assert.equal(evidenceBundle.evidence.assets.licenseUnverified, 1, "the non-open track is flagged");
assert.ok(evidenceBundle.evidence.compatibility.some(note => /cannot download/.test(note)));
const evidenceNotes = formatResearchNotes(evidenceBundle);
assert.match(evidenceNotes, /NOT imported/);
assert.match(evidenceNotes, /reference-only, licence unverified/);
assert.match(evidenceNotes, /## Compatibility and integration/);
console.log("Research evidence-state tests passed (reference-only, downloadable, licence states, no false imports).");
