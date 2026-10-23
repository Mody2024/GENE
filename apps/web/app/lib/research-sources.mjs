/**
 * Free research and asset-discovery helpers (pure, no network).
 *
 * GENE cannot download binary assets inside its sandboxed game runtime (the preview blocks all network access
 * by design), so "automatic asset research" means: gather factual and visual context from free APIs, list
 * verifiably CC0 3D models, and give the user one-click searches on the major free libraries. Everything here
 * is free to use; licences are stated per source and must still be checked on each asset page.
 */

import { matchGameKnowledge, musicStylesFor } from "./game-knowledge.mjs";

/** Validate that downloaded image bytes agree with the declared raster MIME type. */
export function hasValidImageSignature(mimeType, input) {
  const bytes = input instanceof Uint8Array ? input : Uint8Array.from(input || []);
  const starts = (...signature) => signature.every((byte, index) => bytes[index] === byte);
  const ascii = (start, value) => value.split("").every((char, index) => bytes[start + index] === char.charCodeAt(0));
  if (mimeType === "image/png") return starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
  if (mimeType === "image/jpeg") return starts(0xff, 0xd8, 0xff);
  if (mimeType === "image/gif") return ascii(0, "GIF87a") || ascii(0, "GIF89a");
  if (mimeType === "image/webp") return bytes.length >= 12 && ascii(0, "RIFF") && ascii(8, "WEBP");
  return false;
}

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
    { id: "commons", label: "Wikimedia Commons", kind: "Images, audio, video", license: "CC / public domain (check each)", url: "https://commons.wikimedia.org/w/index.php?search=" + q },
    { id: "fma", label: "Free Music Archive", kind: "Music tracks", license: "CC (check each)", url: "https://freemusicarchive.org/search?quicksearch=" + q },
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
    if (score > 0) results.push({ id, name: String(item.name || id), tags: tags.slice(0, 6), score, url: "https://polyhaven.com/a/" + encodeURIComponent(id), license: "CC0", licenseState: "source-declared-CC0", integrationState: "catalog-reference", assetType: "downloadable-3d-model" });
  }
  return results.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, limit);
}

const MOOD_QUERY = { action: "chiptune", calm: "ambient piano", tense: "dark ambient", mystery: "ambient", triumph: "fanfare", sad: "melancholy piano" };

const ENGINE_MODELS = [
  { re: /train|subway|metro|rail|locomotive/, name: "Train car", call: "GeneModels.props3D.train(color) / GeneModels.drawTrainCar(ctx,…)", dims: "2D+3D" },
  { re: /runner|character|player|hero|person|human|ninja|knight|mario|run/, name: "Animated character", call: "GeneModels.rig3D.character(style) + bake(rig, state, t, root) / GeneModels.drawCharacter(ctx,…)", dims: "2D+3D" },
  { re: /coin|money|gold|cash|prize|millionaire/, name: "Spinning coin", call: "GeneModels.drawCoin(ctx,…) / GeneModels.props3D.coin()", dims: "2D+3D" },
  { re: /car|race|racing|drift|kart|vehicle|truck/, name: "Car", call: "GeneModels.props3D.car(color) / GeneModels.drawCar(ctx,…)", dims: "2D+3D" },
  { re: /ship|space|rocket|galaga|invader|asteroid|shooter/, name: "Spaceship", call: "GeneModels.props3D.ship(color) / GeneModels.drawShip(ctx,…)", dims: "2D+3D" },
  { re: /tree|forest|nature|garden|farm|park/, name: "Tree", call: "GeneModels.props3D.tree() / GeneModels.drawTree(ctx,…)", dims: "2D+3D" },
  { re: /enemy|monster|goomba|slime|zombie|ghost|boss|creature/, name: "Enemies (walker, slime, flyer)", call: "GeneModels.drawEnemy(ctx, x, y, size, t, {kind})", dims: "2D" },
  { re: /gem|diamond|crystal|jewel|match/, name: "Gem", call: "GeneModels.drawGem(ctx, x, y, r, t, color)", dims: "2D" },
  { re: /heart|health|life|lives/, name: "Heart (health)", call: "GeneModels.drawHeart(ctx, x, y, size, t)", dims: "2D" },
  { re: /block|brick|question|tile|wall/, name: "Brick / question / ground block", call: "GeneModels.drawBlock(ctx, x, y, size, kind, t)", dims: "2D" },
  { re: /barrier|obstacle|crate|box|fence/, name: "Barrier and crate", call: "GeneModels.props3D.barrier() / crate(color)", dims: "3D" },
  { re: /sky|background|parallax|landscape|city|night|sunset/, name: "Animated parallax backdrop", call: "GeneModels.drawBackdrop(ctx, w, h, t, theme)", dims: "2D" }
];

/** Built-in GeneModels that fit the topic, so research can point at models GENE can really use. */
export function matchEngineModels(text, limit = 5) {
  const source = String(text || "").toLowerCase();
  return ENGINE_MODELS.filter(item => item.re.test(source)).slice(0, limit).map(({ name, call, dims }) => ({ name, call, dims }));
}

function stripHtml(value) {
  return String(value || "").replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
}

/** Wikipedia pages (extracts + thumbnails) from an action=query response. */
export function parseWikipediaPages(data, host = "en.wikipedia.org") {
  const pages = Object.values((data && data.query && data.query.pages) || {});
  return pages
    .filter(page => page && typeof page.title === "string" && typeof page.extract === "string" && page.extract.trim())
    .sort((a, b) => (a.index || 0) - (b.index || 0))
    .map(page => ({
      title: String(page.title),
      extract: String(page.extract),
      url: String(page.fullurl || "https://" + host + "/wiki/" + encodeURIComponent(String(page.title).replace(/ /g, "_"))),
      thumb: page.thumbnail && typeof page.thumbnail.source === "string" && /^https:\/\//.test(page.thumbnail.source) ? page.thumbnail.source : undefined
    }));
}

const IMAGE_MIME = /^image\/(?:jpeg|png|webp|gif|svg\+xml)$/i;
const AUDIO_NAME = /\.(?:ogg|oga|opus|mp3|wav|flac)$/i;

/** Wikimedia Commons files with licence + credit from a generator=search&prop=imageinfo response. */
export function parseCommonsFiles(data, kind = "image") {
  const pages = Object.values((data && data.query && data.query.pages) || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
  const out = [];
  for (const page of pages) {
    const info = page && Array.isArray(page.imageinfo) ? page.imageinfo[0] : null;
    if (!info || typeof info.url !== "string" || !/^https:\/\//.test(info.url)) continue;
    const meta = info.extmetadata || {};
    const license = stripHtml(meta.LicenseShortName && meta.LicenseShortName.value);
    if (!license) continue; // never present a file whose licence we cannot state
    const title = String(page.title || "").replace(/^File:/i, "").replace(/\.[A-Za-z0-9]+$/, "").replace(/_/g, " ");
    const credit = stripHtml(meta.Artist && meta.Artist.value).slice(0, 120) || "Wikimedia Commons contributors";
    const sourcePage = String(info.descriptionurl || "https://commons.wikimedia.org/wiki/" + encodeURIComponent(String(page.title || "").replace(/ /g, "_")));
    const base = {
      id: "commons-" + String(page.pageid || title), title, license,
      licenseState: "source-declared-review-per-asset",
      integrationState: "reference-only",
      downloadState: "candidate-not-imported",
      importReadiness: {
        status: "review-required",
        licenseReviewRequired: true,
        sourceBytesMustBeValidated: true,
        responseMimeMustBeValidated: true,
        fileSignatureMustBeValidated: true,
        maxBytes: 15000000,
        automaticImportImplemented: false
      },
      assetType: kind === "audio" ? "audio-asset-candidate" : "visual-reference",
      mimeType: String(info.mime || "").toLowerCase(),
      fileSizeBytes: Number.isFinite(Number(info.size)) && Number(info.size) > 0 ? Number(info.size) : null,
      width: Number.isFinite(Number(info.width)) && Number(info.width) > 0 ? Number(info.width) : null,
      height: Number.isFinite(Number(info.height)) && Number(info.height) > 0 ? Number(info.height) : null,
      sha1: typeof info.sha1 === "string" && /^[a-f0-9]{40}$/i.test(info.sha1) ? info.sha1.toLowerCase() : null,
      downloadUrl: info.url,
      credit,
      attribution: credit + " — " + license,
      page: sourcePage,
      sourcePage,
      source: "Wikimedia Commons"
    };
    if (kind === "audio") {
      if (!AUDIO_NAME.test(String(page.title || "")) && !/^audio\//i.test(String(info.mime || ""))) continue;
      out.push({ ...base, url: info.url });
    } else {
      if (!IMAGE_MIME.test(String(info.mime || ""))) continue;
      const thumb = typeof info.thumburl === "string" && /^https:\/\//.test(info.thumburl) ? info.thumburl : info.url;
      out.push({ ...base, thumb, full: info.url });
    }
  }
  return out;
}

export function polyHavenThumb(id) {
  return "https://cdn.polyhaven.com/asset_img/thumbs/" + encodeURIComponent(String(id)) + ".png?width=256&height=256";
}

/** Query terms for music search derived from the best-matching genre's mood. */
export function musicSearchTerms(topic) {
  const styles = musicStylesFor(topic, 2);
  const terms = styles.map(style => MOOD_QUERY[style.mood] || "ambient");
  return Array.from(new Set(terms.length ? terms : ["ambient"]));
}

/** Parse and rank Google Custom Search results against the actual research topic. */
export function parseGoogleSearchResults(data, topic, limit = 5) {
  const queryTerms = keywords(topic);
  const items = Array.isArray(data && data.items) ? data.items : [];
  const scored = [];
  for (const item of items) {
    const url = typeof item?.link === "string" ? item.link : "";
    if (!/^https:\/\//i.test(url)) continue;
    let hostname = "";
    try { hostname = new URL(url).hostname.toLowerCase(); } catch { continue; }
    const title = String(item?.title || "").replace(/\s+/g, " ").trim().slice(0, 180);
    const snippet = String(item?.snippet || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 600);
    if (!title || !snippet) continue;
    const haystack = (title + " " + snippet + " " + hostname).toLowerCase();
    const matched = queryTerms.filter(term => haystack.includes(term));
    const phraseBonus = cleanQuery(topic).length > 4 && haystack.includes(cleanQuery(topic).toLowerCase()) ? 20 : 0;
    const relevance = Math.min(100, Math.round((queryTerms.length ? matched.length / queryTerms.length * 80 : 0) + phraseBonus));
    scored.push({ title, snippet, url, source: hostname, relevance, resultType: "technical-evidence", integrationState: "reference-only" });
  }
  // Suppress zero-relevance noise and syndicated duplicates before filling the research panel.
  // Strip fragments and common tracking parameters so one article cannot occupy multiple slots.
  const seenUrls = new Set();
  const ranked = scored.filter(item => item.relevance >= 15).sort((a, b) => b.relevance - a.relevance);
  const unique = ranked.filter(item => {
    let key = item.url.toLowerCase();
    try {
      const url = new URL(item.url);
      url.hash = "";
      for (const param of Array.from(url.searchParams.keys())) {
        if (/^(utm_.+|fbclid|gclid|mc_cid|mc_eid|ref_src)$/i.test(param)) url.searchParams.delete(param);
      }
      key = url.toString().replace(/\/$/, "").toLowerCase();
    } catch {}
    if (seenUrls.has(key)) return false;
    seenUrls.add(key);
    return true;
  });
  return unique.slice(0, Math.max(1, Math.min(10, Number(limit) || 5)));
}

/** Assemble the single research bundle that is shown on the message and sent to GENE.
 * @param {{ id?: string, topic: string, createdAt?: string, wiki?: any[], commonsImages?: any[], commonsAudio?: any[], models?: any[], webResults?: any[], links?: any[], unavailable?: string[] }} input
 */
export function buildResearchBundle(input) {
  const topic = cleanQuery(input.topic);
  const wiki = Array.isArray(input.wiki) ? input.wiki : [];
  const images = [];
  const seen = new Set();
  const pushImage = item => { const key = item.thumb || item.full; if (key && !seen.has(key)) { seen.add(key); images.push(item); } };
  for (const page of wiki) if (page.thumb) pushImage({ id: "wiki-" + page.title, title: page.title, thumb: page.thumb, full: page.thumb, page: page.url, license: "See Wikipedia page", licenseState: "license-unverified-review-source-page", integrationState: "reference-only", credit: "Wikipedia", source: "Wikipedia" });
  for (const file of (Array.isArray(input.commonsImages) ? input.commonsImages : [])) pushImage(file);
  const models = (Array.isArray(input.models) ? input.models : []).map(model => ({ ...model, thumb: polyHavenThumb(model.id), source: "Poly Haven", licenseState: model.licenseState || "source-declared-CC0", integrationState: "catalog-reference", assetType: "downloadable-3d-model" }));
  const matches = matchGameKnowledge(topic, 3);
  const webResults = parseGoogleSearchResults({ items: Array.isArray(input.webResults) ? input.webResults : [] }, topic, 5);
  // Round-robin category-tagged references so UI, gameplay, characters and environments
  // each get a chance to reach the model before any one category fills the image budget.
  const categorized = images.filter(image => image.category);
  const categoryOrder = Array.from(new Set(categorized.map(image => image.category)));
  const balancedImages = [];
  for (let offset = 0; offset < 4; offset++) {
    for (const category of categoryOrder) {
      const candidate = categorized.filter(image => image.category === category)[offset];
      if (candidate) balancedImages.push(candidate);
    }
  }
  const visualImages = [...balancedImages, ...images.filter(image => !image.category)];
  return {
    id: String(input.id || "research-" + Date.now().toString(36)),
    topic,
    createdAt: String(input.createdAt || new Date().toISOString()),
    facts: wiki.map(page => ({ title: page.title, extract: String(page.extract).replace(/\s+/g, " ").slice(0, 520), url: page.url, thumb: page.thumb, resultType: "encyclopedic-context", integrationState: "reference-only" })),
    webResults,
    images: visualImages.slice(0, 12),
    models,
    engineModels: matchEngineModels(topic + " " + matches.map(entry => entry.models).join(" ")).filter(model => {
      const explicit = /\b(character|player|hero|person|human|ninja|knight|mario|runner|run|enemy|enemies|monster|goomba|slime|zombie|ghost|boss|creature|npc|avatar)\b/i.test(topic);
      if (/Animated character|Enemies/i.test(model.name)) return explicit;
      return true;
    }),
    music: { styles: musicStylesFor(topic, 3), tracks: (Array.isArray(input.commonsAudio) ? input.commonsAudio : []).slice(0, 4), links: (Array.isArray(input.links) ? input.links : []).filter(link => ["fma", "opengameart", "freesound", "commons"].includes(link.id)) },
    games: matches.map(entry => ({ title: entry.title, examples: entry.examples, loop: entry.loop, engine: entry.engine })),
    links: Array.isArray(input.links) ? input.links : [],
    unavailable: Array.isArray(input.unavailable) ? input.unavailable : []
  };
}

/** Markdown note given to the builder. Most useful guidance comes first because staged prompts truncate references. */
export function formatResearchNotes(input) {
  const bundle = input && Array.isArray(input.facts) ? input : null;
  const topic = bundle ? bundle.topic : input.topic;
  const lines = ["# Research notes: " + topic, ""];
  if (bundle) {
    if (bundle.games.length) {
      lines.push("## Games like this (real references; learn from how they play, do not copy assets)");
      for (const game of bundle.games) lines.push("- **" + game.title + "** (" + game.examples.join(", ") + "): " + game.loop);
      lines.push("");
    }
    if (bundle.music.styles.length) {
      lines.push("## Music direction (use GeneAudio)");
      for (const style of bundle.music.styles) lines.push("- " + style.genre + ": GeneAudio mood '" + style.mood + "', ~" + style.bpm + " BPM, " + style.scale + "; " + style.instruments + ". " + style.notes + ". SFX: " + style.sfx.join(", ") + ".");
      for (const track of bundle.music.tracks) lines.push("- Reference track: " + track.title + " — " + track.page + " (" + track.license + ", " + track.credit + ")");
      lines.push("");
    }
    if (bundle.engineModels.length) {
      lines.push("## Built-in GENE models to use");
      for (const model of bundle.engineModels) lines.push("- " + model.name + " [" + model.dims + "]: " + model.call);
      lines.push("");
    }
    if (bundle.images.length) {
      lines.push("## Visual references (" + bundle.images.length + ")");
      for (const image of bundle.images) lines.push("- [" + (image.categoryLabel || "Visual reference") + "] " + image.title + " — " + image.page + " (" + image.license + "; " + image.credit + "; via " + image.source + ")");
      lines.push("These are reference-only images, not imported project assets. Some are attached to this message as pixels; study palette, shapes and composition, then create or explicitly import a suitable asset.", "");
    }
    if (Array.isArray(bundle.webResults) && bundle.webResults.length) {
      lines.push("## Web research (ranked by topic relevance)");
      for (const result of bundle.webResults.slice(0, 5)) lines.push("- **" + result.title + "** — " + result.snippet + " (" + result.url + "; relevance " + result.relevance + "/100; source " + result.source + ")");
      lines.push("");
    }
    if (bundle.facts.length) {
      lines.push("## Real-world context (Wikipedia)");
      for (const fact of bundle.facts) lines.push("- **" + fact.title + "** — " + fact.extract + " (" + fact.url + ")");
      lines.push("");
    }
    if (bundle.models.length) {
      lines.push("## CC0 3D model catalog matches (Poly Haven; not imported)");
      for (const model of bundle.models) lines.push("- " + model.name + " — " + model.url + " (source-declared CC0; catalog reference only, not downloaded or added to the project; tags: " + (model.tags || []).join(", ") + ")");
      lines.push("");
    }
    if (bundle.unavailable.length) lines.push("Note: some live sources were unavailable (" + bundle.unavailable.join("; ") + "); only verified parts are listed.", "");
    lines.push("## Free asset libraries to search");
    for (const link of bundle.links) lines.push("- " + link.label + " (" + link.kind + "; " + link.license + "): " + link.url);
  } else {
    const wiki = input.wiki || [], models = input.models || [], links = input.links || [];
    if (input.note) lines.push(input.note, "");
    if (wiki.length) {
      lines.push("## Real-world and visual context (Wikipedia; reference-only, not imported)");
      for (const page of wiki) lines.push("- **" + page.title + "** — " + String(page.extract || "").replace(/\s+/g, " ").slice(0, 420) + " (" + page.url + ")");
      lines.push("");
    }
    if (models.length) {
      lines.push("## CC0 3D model catalog matches (Poly Haven; not imported)");
      for (const model of models) lines.push("- " + model.name + " — " + model.url + " (source-declared CC0; catalog reference only, not downloaded or added to the project; tags: " + (model.tags || []).join(", ") + ")");
      lines.push("");
    }
    lines.push("## Free asset libraries to search");
    for (const link of links) lines.push("- " + link.label + " (" + link.kind + "; " + link.license + "): " + link.url);
  }
  lines.push("", "Builder guidance: the game runtime cannot download files. Use procedural drawing, GeneModels, GeneAudio, saved SVG illustrations (assets/art/*.svg via GENE_ART) and Forge OBJ meshes; use the context above to make objects, palette, proportions and music accurate to the real subject.");
  return lines.join("\n").slice(0, 8000);
}
