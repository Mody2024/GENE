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
