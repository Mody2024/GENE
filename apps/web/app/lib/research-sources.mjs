/**
 * Free research and asset-discovery helpers (pure, no network).
 *
 * GENE cannot download binary assets inside its sandboxed game runtime (the preview blocks all network access
 * by design), so "automatic asset research" means: gather factual and visual context from free APIs, list
 * verifiably CC0 3D models, and give the user one-click searches on the major free libraries. Everything here
 * is free to use; licences are stated per source and must still be checked on each asset page.
 */

export function cleanQuery(value) {
  return String(value || "").replace(/[^\p{L}\p{N}\s'&-]+/gu, " ").replace(/\s+/g, " ").trim().slice(0, 120);
}

const STOP = new Set(["a", "an", "the", "and", "or", "of", "for", "with", "in", "on", "to", "game", "games", "build", "make", "create", "my", "me", "that", "this", "is", "it", "like", "style", "d", "2d", "3d"]);

export function keywords(value) {
  return Array.from(new Set(cleanQuery(value).toLowerCase().split(" ").filter(word => word.length > 2 && !STOP.has(word)))).slice(0, 8);
}

/** Search links for the major free libraries. Licences are the sites' general policy; verify per asset. */
export function buildSearchLinks(query) {
  const q = encodeURIComponent(cleanQuery(query));
  return [
    { id: "kenney", label: "Kenney", kind: "2D/3D art, UI, audio", license: "CC0", url: "https://kenney.nl/assets?q=" + q },
    { id: "opengameart", label: "OpenGameArt", kind: "2D art, 3D, music, SFX", license: "CC0 / CC-BY (check each)", url: "https://opengameart.org/art-search-advanced?keys=" + q },
    { id: "polyhaven", label: "Poly Haven", kind: "3D models, HDRIs, textures", license: "CC0", url: "https://polyhaven.com/models?s=" + q },
    { id: "quaternius", label: "Quaternius", kind: "Low-poly 3D packs", license: "CC0", url: "https://quaternius.com/" },
    { id: "itch", label: "itch.io free assets", kind: "Art, audio, fonts", license: "Varies (check each)", url: "https://itch.io/game-assets/free?q=" + q },
    { id: "sketchfab", label: "Sketchfab (downloadable, CC)", kind: "3D models", license: "CC (check each)", url: "https://sketchfab.com/search?features=downloadable&licenses=7c23a1ba438d4306920229c12afcb5f9&q=" + q + "&type=models" },
    { id: "freesound", label: "Freesound", kind: "Sound effects", license: "CC0 / CC-BY (check each)", url: "https://freesound.org/search/?q=" + q },
    { id: "ambientcg", label: "ambientCG", kind: "PBR textures", license: "CC0", url: "https://ambientcg.com/list?q=" + q }
  ];
}

/** Rank Poly Haven catalog entries (object keyed by id) against the query keywords. */
export function filterPolyHaven(catalog, query, limit = 6) {
  if (!catalog || typeof catalog !== "object") return [];
  const words = keywords(query);
  if (!words.length) return [];
  const results = [];
  for (const [id, raw] of Object.entries(catalog)) {
    const item = raw || {};
    const name = String(item.name || id).toLowerCase();
    const tags = Array.isArray(item.tags) ? item.tags.map(tag => String(tag).toLowerCase()) : [];
    const cats = Array.isArray(item.categories) ? item.categories.map(cat => String(cat).toLowerCase()) : [];
    let score = 0;
    for (const word of words) {
      if (name.includes(word)) score += 5;
      if (tags.some(tag => tag === word || tag.includes(word))) score += 3;
      if (cats.some(cat => cat.includes(word))) score += 2;
    }
    if (score > 0) results.push({ id, name: String(item.name || id), tags: tags.slice(0, 6), score, url: "https://polyhaven.com/a/" + encodeURIComponent(id), license: "CC0" });
  }
  return results.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, limit);
}

/** Markdown research note that is saved as a project reference and given to the builder. */
export function formatResearchNotes({ topic, wiki = [], models = [], links = [], note = "" }) {
  const lines = ["# Research notes: " + topic, ""];
  if (note) lines.push(note, "");
  if (wiki.length) {
    lines.push("## Real-world and visual context (Wikipedia)");
    for (const page of wiki) lines.push("- **" + page.title + "** — " + String(page.extract || "").replace(/\s+/g, " ").slice(0, 420) + " (" + page.url + ")");
    lines.push("");
  }
  if (models.length) {
    lines.push("## Free CC0 3D models that match (Poly Haven)");
    for (const model of models) lines.push("- " + model.name + " — " + model.url + " (CC0; tags: " + model.tags.join(", ") + ")");
    lines.push("");
  }
  lines.push("## Free asset libraries to search");
  for (const link of links) lines.push("- " + link.label + " (" + link.kind + "; " + link.license + "): " + link.url);
  lines.push("", "Builder guidance: the game runtime cannot download files. Use procedural drawing, saved SVG illustrations (assets/art/*.svg via GENE_ART) and Forge OBJ meshes; use the context above for accurate themes, silhouettes, palettes and naming, not for copying protected designs.");
  return lines.join("\n").slice(0, 6500);
}
