import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as ts from "typescript";
import vm from "node:vm";
import { analyzeProjectScripts, repairUninitializedCollections } from "../apps/web/app/lib/code-safety.mjs";
import { normalizeProjectFilePath, inspectProjectFilePaths } from "../apps/web/app/lib/project-file-safety.mjs";
import { orderRuntimeModulePaths } from "../apps/web/app/lib/runtime-module-order.mjs";
import { classifyProviderFailure, describeProviderError, parseFreeCatalog, extractJsonObjectText } from "../apps/web/app/lib/provider-utils.mjs";
import { sanitizeSvg } from "../apps/web/app/lib/svg-safety.mjs";
import { cleanQuery, buildSearchLinks, filterPolyHaven, formatResearchNotes, parseWikipediaPages, parseCommonsFiles, polyHavenThumb, buildResearchBundle, matchEngineModels, musicSearchTerms } from "../apps/web/app/lib/research-sources.mjs";
import { GENE_AUDIO_SOURCE, GENE_MODELS_SOURCE, buildRuntimeKitScript } from "../apps/web/app/lib/runtime-kit.mjs";
import { diffLines, summarizeChanges, describeChanges } from "../apps/web/app/lib/diff-stats.mjs";
import { GAME_KNOWLEDGE, matchGameKnowledge, musicStylesFor, formatBrain } from "../apps/web/app/lib/game-knowledge.mjs";
import { classifyFailure, backoffMs, retryGuidance, repairTargetsFor } from "../apps/web/app/lib/error-recovery.mjs";
import { validateCloudBuildReport } from "../apps/web/app/lib/cloud-build-report.mjs";

// Provider routing: the exact error from the field must be treated as "unavailable", paid models never enter the pool.
assert.equal(classifyProviderFailure(400, "This model is unavailable for free. The paid version is available now - use this slug instead: qwen/qwen3-coder"), "unavailable");
assert.equal(describeProviderError({ error: { message: "Provider returned error", metadata: { raw: "upstream model returned 429", provider_name: "Example Provider" } } }), "Provider returned error | upstream model returned 429 | Example Provider", "generic gateway messages must preserve actionable upstream diagnostics");
assert.equal(classifyProviderFailure(400, describeProviderError({ error: { message: "Provider returned error", metadata: { raw: "This model is unavailable for free" } } })), "unavailable", "raw gateway metadata must drive dead-model cooldown instead of repeating broken free routes");

const catalog = parseFreeCatalog({ data: [
  { id: "qwen/qwen3-coder", pricing: { prompt: "0.0000003", completion: "0.0000012" }, context_length: 262144 },
  { id: "qwen/qwen3-coder:free", pricing: { prompt: "0", completion: "0" }, context_length: 262144 },
  { id: "vendor/paid-model", pricing: { prompt: "0.000001", completion: "0.000002" }, context_length: 32000 }
] }, 10);
const ids = catalog.map(model => (typeof model === "string" ? model : model.id));
assert.ok(ids.includes("qwen/qwen3-coder:free") && !ids.includes("qwen/qwen3-coder") && !ids.includes("vendor/paid-model"), "only verifiably free models are routed");
const textOnlyCatalog = parseFreeCatalog({ data: [
  { id: "google/lyria-3-clip-preview", pricing: { prompt: "0", completion: "0" }, context_length: 32000, architecture: { output_modalities: ["text", "audio"] } },
  { id: "vendor/free-tts", pricing: { prompt: "0", completion: "0" }, context_length: 32000, architecture: { output_modalities: ["audio"] } },
  { id: "vendor/free-chat", pricing: { prompt: "0", completion: "0" }, context_length: 32000, architecture: { output_modalities: ["text"] } }
] });
assert.deepEqual(textOnlyCatalog.map(model => model.id), ["vendor/free-chat"], "free audio/music endpoints must never enter the text/code fallback pool");

assert.equal(JSON.parse(extractJsonObjectText('Here:\n```json\n{"a":1}\n```')).a, 1);

// The reported crash: `let hazards;` later used as an array.
const fixed = repairUninitializedCollections("let hazards;\nfunction reset(){ hazards.push({x:1}); }\nreset();");
assert.ok(/let hazards\s*=\s*\[\]/.test(fixed.source), "uninitialized collection declarations are repaired");
const bad = analyzeProjectScripts([{ path: "game.js", content: "function tick(){ enemies.push(1); }\ntick();" }], { scopeChecks: true });
assert.ok(bad.errors.length > 0, "undeclared identifiers used as objects are caught");
const good = analyzeProjectScripts([{ path: "game.js", content: "const enemies = [];\nfunction tick(){ enemies.push(1); }\ntick();" }], { scopeChecks: true });
const commonJs = analyzeProjectScripts([{ path: "systems/enemies.cjs", content: "const enemies = [];\nfunction tick(){ enemies.push(1); }\ntick();" }], { scopeChecks: true });
assert.equal(commonJs.errors.length, 0, "CommonJS files receive the same identifier analysis as .js and .mjs");
assert.equal(good.errors.length, 0);

// Cross-platform project path contract: Windows installer paths and browser ZIPs
// must agree on path validity and collisions before packaging.
assert.equal(normalizeProjectFilePath("assets/hero-model.glb").ok, true);
for (const invalidPath of [
  "../outside.txt", "assets/../../secret", "/absolute/file.js", "C:/boot.ini",
  "folder\\nested.js", "assets/CON.txt", "assets/NUL", "file.js.", "folder/trailing ",
  "assets/bad:name.js", "assets/\u0007beep.js", "assets/\u202Eexe.js", "x".repeat(241)
]) {
  assert.equal(normalizeProjectFilePath(invalidPath).ok, false, "unsafe or non-portable path rejected: " + JSON.stringify(invalidPath));
}
const caseCollision = inspectProjectFilePaths(["Assets/Hero.png", "assets/hero.png"]);
assert.equal(caseCollision.ok, false, "case-insensitive collisions are rejected for Windows compatibility");
assert.equal(caseCollision.collisions.length, 1);
const unicodeCollision = inspectProjectFilePaths(["caf\u00e9.txt", "cafe\u0301.txt"]);
assert.equal(unicodeCollision.ok, false, "canonically equivalent Unicode paths cannot overwrite each other");
assert.equal(inspectProjectFilePaths(["game/index.html", "assets/hero.png"]).ok, true);
assert.equal(inspectProjectFilePaths(["assets", "assets/hero.png"]).ok, false, "file paths cannot also be directories");
assert.equal(inspectProjectFilePaths(["assets/hero.png", "assets"]).ok, false, "file/directory conflicts are rejected regardless of source order");
const orderedModules = orderRuntimeModulePaths({
  "game.js": "startGame();",
  "game-spec.json": JSON.stringify({ additionalFiles: ["src/core.mjs", "src/combat.cjs"] }),
  "src/ui.js": "window.GeneModules.ui = {};",
  "src/combat.cjs": "window.GeneModules.combat = {};",
  "src/core.mjs": "window.GeneModules.core = {};",
  "src/z-last.js": "window.GeneModules.last = {};",
  "node_modules/ignored.js": "ignored();"
});
assert.deepEqual(orderedModules, ["src/core.mjs", "src/combat.cjs", "src/ui.js", "src/z-last.js"], "runtime module order follows declared dependencies, then deterministically sorts undeclared modules and excludes node_modules");
const blueprintOrderedModules = orderRuntimeModulePaths({
  "game.js": "startGame();",
  "game-spec.json": JSON.stringify({ architecture: { modules: [{ path: "src/world.js" }, { path: "src/interaction.js" }, { path: "src/save.js" }] }, additionalFiles: ["src/save.js", "src/interaction.js", "src/world.js"] }),
  "src/world.js": "window.GeneModules.world = {};",
  "src/interaction.js": "window.GeneModules.interaction = {};",
  "src/save.js": "window.GeneModules.save = {};"
});
assert.deepEqual(blueprintOrderedModules, ["src/world.js", "src/interaction.js", "src/save.js"], "explicit architecture blueprint order controls runtime loading ahead of a stale compatibility manifest");
assert.deepEqual(orderRuntimeModulePaths({ "game.js": "", "b.js": "", "a.js": "" }), ["a.js", "b.js"], "projects without a module manifest use deterministic alphabetical module order");

// SVG sanitizer.
const hostile = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" onload="alert(1)"><script>alert(1)</script><image href="https://evil.test/x.png"/><rect width="4" height="4" fill="red"/><circle cx="5" cy="5" r="2"/></svg>';
const clean = sanitizeSvg(hostile);
assert.ok(clean.ok && !/script|onload|evil|<image/i.test(clean.svg), "hostile SVG is neutralized");
assert.equal(sanitizeSvg("<svg></svg>").ok, false);

// Research helpers.
assert.equal(cleanQuery("  dragon   castle \n"), "dragon castle");
assert.ok(buildSearchLinks("castle").every(link => link.url.startsWith("https://") && link.license));
assert.ok(Array.isArray(filterPolyHaven({ barrel_01: { name: "Barrel", tags: ["barrel", "wood"], categories: ["props"] } }, "wooden barrel", 3)));
assert.ok(formatResearchNotes({ topic: "castle", wiki: [], models: [], links: buildSearchLinks("castle") }).includes("castle"));

// Audio kit: runs against a mock AudioContext and never throws.
const calls = { osc: 0 };
const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {}, setTargetAtTime() {} });
const node = () => ({ connect() { return this; }, disconnect() {}, gain: param(), frequency: param(), Q: param(), detune: param(), pan: param(), start() {}, stop() {}, type: "", buffer: null, addEventListener() {}, onended: null });
class MockCtx { constructor() { this.currentTime = 0; this.destination = node(); this.state = "running"; this.sampleRate = 44100; }
  createOscillator() { calls.osc++; return node(); } createGain() { return node(); } createBiquadFilter() { return node(); } createStereoPanner() { return node(); }
  createBuffer(c, n) { return { getChannelData: () => new Float32Array(n) }; } createBufferSource() { return node(); } createDynamicsCompressor() { return node(); }
  resume() { return Promise.resolve(); } suspend() { return Promise.resolve(); } close() { return Promise.resolve(); } }
const sandbox = { window: {}, AudioContext: MockCtx, document: { addEventListener() {}, createElement: () => ({ style: {}, appendChild() {}, addEventListener() {}, setAttribute() {} }), body: { appendChild() {} } }, localStorage: { getItem() { return null; }, setItem() {} }, setTimeout, clearTimeout, setInterval, clearInterval, console, Math, Date };
sandbox.window = sandbox; sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(GENE_AUDIO_SOURCE, sandbox);
assert.ok(sandbox.GeneAudio && typeof sandbox.GeneAudio.sfx === "function", "GeneAudio is defined by the runtime kit");
for (const name of ["jump", "coin", "hit", "explosion", "win", "does-not-exist"]) assert.doesNotThrow(() => sandbox.GeneAudio.sfx(name));
assert.doesNotThrow(() => { sandbox.GeneAudio.music.start("tense"); sandbox.GeneAudio.music.stop(); sandbox.GeneAudio.setMuted(true); });
assert.ok(buildRuntimeKitScript().includes("GeneAudio"));

// Research bundle: real parsing of Wikipedia/Commons/Poly Haven responses into viewable, attributable references.
{
  const wikiData = { query: { pages: {
    "2": { pageid: 2, title: "Subway Surfers", index: 2, extract: "Subway Surfers is an endless runner mobile game.", fullurl: "https://en.wikipedia.org/wiki/Subway_Surfers", thumbnail: { source: "https://upload.wikimedia.org/wikipedia/en/thumb/a/a.jpg/480px-a.jpg" } },
    "1": { pageid: 1, title: "Endless runner", index: 1, extract: "Endless running is a subgenre of platform game.", thumbnail: { source: "http://insecure.example/x.jpg" } },
    "3": { pageid: 3, title: "Empty", index: 3, extract: "   " }
  } } };
  const wiki = parseWikipediaPages(wikiData);
  assert.deepEqual(wiki.map(page => page.title), ["Endless runner", "Subway Surfers"], "wikipedia pages keep relevance order and drop empty extracts");
  assert.equal(wiki[0].thumb, undefined, "non-https thumbnails are never used");
  assert.ok(wiki[1].url.startsWith("https://en.wikipedia.org/"));
  const commonsImages = { query: { pages: {
    "10": { pageid: 10, title: "File:Metro train.jpg", index: 1, imageinfo: [{ thumburl: "https://upload.wikimedia.org/t/480px-Metro_train.jpg", url: "https://upload.wikimedia.org/Metro_train.jpg", descriptionurl: "https://commons.wikimedia.org/wiki/File:Metro_train.jpg", mime: "image/jpeg", extmetadata: { LicenseShortName: { value: "CC BY-SA 4.0" }, Artist: { value: "<a href=\"//x\">Jane &amp; Co</a>" } } }] },
    "11": { pageid: 11, title: "File:No licence.png", index: 2, imageinfo: [{ url: "https://upload.wikimedia.org/n.png", mime: "image/png", extmetadata: {} }] },
    "12": { pageid: 12, title: "File:Doc.pdf", index: 3, imageinfo: [{ url: "https://upload.wikimedia.org/d.pdf", mime: "application/pdf", extmetadata: { LicenseShortName: { value: "CC0" } } }] }
  } } };
  const imgs = parseCommonsFiles(commonsImages, "image");
  assert.equal(imgs.length, 1, "files without a stated licence or with a non-image type are dropped");
  assert.equal(imgs[0].license, "CC BY-SA 4.0"); assert.equal(imgs[0].credit, "Jane & Co"); assert.ok(imgs[0].thumb.includes("480px"));
  const commonsAudio = { query: { pages: { "20": { pageid: 20, title: "File:Chiptune loop.ogg", imageinfo: [{ url: "https://upload.wikimedia.org/c.ogg", descriptionurl: "https://commons.wikimedia.org/wiki/File:Chiptune_loop.ogg", mime: "application/ogg", extmetadata: { LicenseShortName: { value: "CC0" }, Artist: { value: "Someone" } } }] } } } };
  const audio = parseCommonsFiles(commonsAudio, "audio");
  assert.equal(audio.length, 1); assert.equal(audio[0].title, "Chiptune loop"); assert.ok(audio[0].url.endsWith(".ogg"));
  assert.ok(polyHavenThumb("wooden_crate_01").startsWith("https://cdn.polyhaven.com/asset_img/thumbs/wooden_crate_01.png"));
  const bundle = buildResearchBundle({ topic: "subway surfers style 3d runner with trains and coins", wiki, commonsImages: imgs, commonsAudio: audio, models: [{ id: "train_01", name: "Train", tags: ["train"], url: "https://polyhaven.com/a/train_01", license: "CC0" }], links: buildSearchLinks("subway") });
  assert.ok(bundle.images.length === 2 && bundle.images.every(image => image.thumb.startsWith("https://") && image.license && image.page), "every image has a source page, licence and https thumbnail");
  assert.ok(bundle.games[0].title.includes("3D lane runner"), "matched real reference games are attached");
  assert.ok(bundle.music.styles[0].mood === "action" && bundle.music.tracks.length === 1 && bundle.music.links.length >= 2, "music styles, a real playable track and library links are attached");
  assert.ok(bundle.engineModels.some(model => /train/i.test(model.name)) && bundle.engineModels.some(model => /coin/i.test(model.name)), "built-in models that fit the topic are suggested");
  assert.ok(bundle.models[0].thumb.includes("train_01"));
  const notes = formatResearchNotes(bundle);
  assert.ok(notes.indexOf("Games like this") < notes.indexOf("Real-world context") && notes.includes("Music direction") && notes.includes("Visual references") && notes.includes("Reference track"), "notes lead with builder guidance and list images, music and tracks");
  assert.ok(notes.length <= 8000);
  assert.ok(matchEngineModels("a car racing game").some(model => /car/i.test(model.name)));
  assert.deepEqual(musicSearchTerms("a mario platformer"), ["chiptune"]);
  assert.equal(cleanQuery("من سيربح المليون"), "من سيربح المليون", "Arabic queries survive cleaning");
}

// Central error recovery: every failure class gets the right retry/auto-fix decision and repair target.
{
  const kind = (message, code, status) => classifyFailure(message, code, status).kind;
  assert.equal(kind("Build rejected: architecture module src/systems/renderer.js is missing from the assembled project.", "GENE_VALIDATION_FAILED"), "validation");
  assert.equal(classifyFailure("Build rejected: x", "GENE_VALIDATION_FAILED").autoFix, true, "validation failures are fixed automatically");
  assert.equal(kind("The staged project did not pass final validation: Build rejected: audio", "GENE_STAGED_BUILD_VALIDATION_FAILED"), "validation");
  assert.equal(kind("anything", "OPENROUTER_RATE_LIMITED"), "rate-limit");
  assert.equal(kind("Failed to fetch"), "network");
  assert.equal(kind("The request timed out", "GEMINI_TIMEOUT"), "timeout");
  assert.equal(kind("x", "GEMINI_OUTPUT_TRUNCATED"), "bad-output");
  assert.equal(kind("x", "GEMINI_KEY_REJECTED"), "config");
  assert.equal(classifyFailure("x", "GEMINI_KEY_REJECTED").retryable, false, "a rejected key is never retried blindly");
  assert.equal(kind("ReferenceError: score is not defined"), "runtime");
  assert.equal(kind("weird", "", 503), "provider-busy");
  assert.equal(kind("weird", "", 200), "unknown");
  assert.ok(backoffMs("rate-limit", 2) > backoffMs("network", 2) && backoffMs("network", 3) > backoffMs("network", 1), "backoff grows and rate limits wait longest");
  assert.ok(retryGuidance("validation", "Build rejected: no canvas", 2).includes("Build rejected: no canvas"), "the retry tells the model exactly why it failed");
  assert.deepEqual(repairTargetsFor("Build rejected: game audio is missing", ["game.js"]), ["game.js", "game-spec.json"]);
  assert.deepEqual(repairTargetsFor("src/systems/renderer.js is missing", ["game.js", "src/systems/renderer.js"]), ["src/systems/renderer.js"], "a named stage file is repaired directly");
  assert.deepEqual(repairTargetsFor("game.html must include a canvas", []), ["game.html"]);
  assert.deepEqual(repairTargetsFor("something odd", []), ["game.js"]);
}

// GENE brain: every entry is complete, uses real GeneAudio moods/GeneModels calls, and requests match the right genre.
{
  const moods = new Set(["calm", "mystery", "tense", "action", "triumph", "sad"]);
  const knownCalls = /GeneModels\.(?:drawCharacter|drawEnemy|drawBlock|drawCoin|drawGem|drawHeart|drawTree|drawBackdrop|drawShip|drawCar|drawTrainCar|props3D|rig3D|mesh)/;
  assert.ok(GAME_KNOWLEDGE.length >= 24, "brain covers a broad set of game genres");
  const ids = new Set();
  for (const entry of GAME_KNOWLEDGE) {
    assert.ok(!ids.has(entry.id), "unique id " + entry.id); ids.add(entry.id);
    assert.ok(entry.examples.length >= 2 && entry.mechanics.length >= 4 && entry.feel.length >= 3 && entry.pitfalls.length >= 2 && entry.sfx.length >= 3, entry.id + " is fully described");
    assert.ok(moods.has(entry.music.mood) && entry.music.bpm >= 60 && entry.music.bpm <= 180, entry.id + " maps to a real GeneAudio mood and sane BPM");
    assert.doesNotThrow(() => new RegExp(entry.pattern, "i"), entry.id + " pattern compiles");
    if (/GeneModels/.test(entry.models)) assert.ok(knownCalls.test(entry.models), entry.id + " only names GeneModels calls that exist");
  }
  const top = text => matchGameKnowledge(text, 1)[0]?.id;
  assert.equal(top("make a mario style platformer"), "platformer");
  assert.equal(top("a subway surfers like 3d runner with trains"), "runner3d");
  assert.equal(top("who wants to be a millionaire quiz game"), "quiz");
  assert.equal(top("لعبة من سيربح المليون"), "quiz", "Arabic quiz requests are recognised");
  assert.equal(top("vampire survivors style horde game"), "arena-shooter");
  assert.equal(top("tetris clone"), "block-puzzle");
  assert.equal(top("a space invaders shooter"), "space-shooter");
  assert.deepEqual(matchGameKnowledge("hello there"), [], "no genre is invented for unrelated text");
  assert.equal(musicStylesFor("mario platformer")[0].mood, "action");
  const brain = formatBrain("a subway surfers style game");
  assert.ok(brain.includes("GENE BRAIN") && brain.includes("Subway Surfers") && brain.includes("GeneModels") && brain.length <= 5200, "brain block is compact and concrete");
}

// Real edit summaries: exact line diffs, added/removed/modified detection and a readable one-line description.
{
  assert.deepEqual(diffLines("a\nb\nc", "a\nb\nc"), { added: 0, removed: 0 });
  assert.deepEqual(diffLines("a\nb\nc", "a\nX\nc"), { added: 1, removed: 1 });
  assert.deepEqual(diffLines("", "x\ny"), { added: 2, removed: 0 });
  assert.deepEqual(diffLines("a\n", "a\nb\n"), { added: 1, removed: 0 }, "a trailing newline is not an extra line");
  assert.deepEqual(diffLines("x\ny", ""), { added: 0, removed: 2 });
  assert.deepEqual(diffLines("1\n2\n3\n4", "2\n3\n4\n5"), { added: 1, removed: 1 });
  const changes = summarizeChanges({ "game.js": "a\nb", "old.js": "z", "same.css": "q" }, { "game.js": "a\nb\nc\nd", "new.js": "n", "same.css": "q" });
  assert.deepEqual(changes.map(change => [change.path, change.status, change.added, change.removed]), [["game.js", "modified", 2, 0], ["new.js", "added", 1, 0], ["old.js", "removed", 0, 1]]);
  assert.equal(describeChanges(changes), "game.js +2 −0 · new.js +1 −0 · old.js removed");
  assert.deepEqual(summarizeChanges({ "a.js": "1" }, { "a.js": "2", "b.js": "x" }, ["a.js"]).map(change => change.path), ["a.js"], "report can be limited to the files a request touched");
  const big = Array.from({ length: 3000 }, (_, index) => "line " + index).join("\n");
  assert.equal(diffLines(big, big.replace("line 1500", "changed")).added, 1, "large files still produce a sound diff");
}

// GeneModels: animated 2D models + rigged low-poly 3D models must be valid, finite and always safe to call.
{
  const calls = [];
  const ctx = new Proxy({}, { get: (_t, prop) => prop === "createLinearGradient" ? () => ({ addColorStop() {} }) : (...args) => { calls.push(String(prop)); }, set: () => true });
  const modelSandbox = vm.createContext({ Math, Float32Array, Uint16Array, Uint32Array, parseInt, isFinite, String, Number, console });
  modelSandbox.window = modelSandbox;
  vm.runInContext(GENE_MODELS_SOURCE, modelSandbox);
  const GM = modelSandbox.GeneModels;
  assert.ok(GM && GM.__ready, "GeneModels installs itself on window");
  for (const state of ["idle", "walk", "run", "jump", "fall", "slide"]) assert.equal(GM.drawCharacter(ctx, 100, 200, 48, { state, t: 1.3, style: "runner" }), true, "2D character draws in state " + state);
  for (const kind of ["walker", "slime", "flyer"]) assert.equal(GM.drawEnemy(ctx, 50, 50, 40, 0.7, { kind }), true);
  for (const kind of ["brick", "question", "ground"]) assert.equal(GM.drawBlock(ctx, 0, 0, 32, kind, 1), true);
  for (const theme of ["day", "dusk", "night", "city"]) assert.equal(GM.drawBackdrop(ctx, 640, 360, 2, theme), true);
  assert.equal(GM.drawCoin(ctx, 10, 10, 10, 0.5), true);
  assert.equal(GM.drawShip(ctx, 5, 5, 48, { t: 1 }), true); assert.equal(GM.drawCar(ctx, 5, 5, 90, { t: 1 }), true); assert.equal(GM.drawTree(ctx, 5, 5, 80, 1), true); assert.equal(GM.drawGem(ctx, 5, 5, 12, 1), true); assert.equal(GM.drawHeart(ctx, 5, 5, 20, 1), true);
  assert.equal(GM.drawTrainCar(ctx, 0, 0, 120, 70, 1, "#2e86de"), true);
  assert.ok(calls.length > 100, "2D models issue real draw calls");
  const rig = GM.rig3D.character("hero");
  const checkMesh = (mesh, label) => {
    const vertices = mesh.positions.length / 3;
    assert.ok(vertices > 0 && mesh.normals.length === mesh.positions.length && mesh.colors.length === mesh.positions.length, label + " has matching attribute arrays");
    assert.ok(mesh.indices.length % 3 === 0 && mesh.indices.every(index => index < vertices), label + " indices stay in range");
    assert.ok(Array.from(mesh.positions).every(Number.isFinite) && Array.from(mesh.normals).every(Number.isFinite), label + " has finite geometry");
  };
  for (const state of ["idle", "walk", "run", "jump", "fall", "slide", "hit"]) checkMesh(GM.bake(rig, state, 0.9, GM.mat4.translate(1, 0, -3)), "baked " + state);
  const runA = GM.bake(rig, "run", 0.0), runB = GM.bake(rig, "run", 0.13);
  assert.ok(Array.from(runA.positions).some((value, index) => Math.abs(value - runB.positions[index]) > 0.01), "run animation actually moves the limbs over time");
  for (const prop of ["train", "coin", "barrier", "crate", "tree", "car", "ship"]) checkMesh(GM.props3D[prop](), "prop " + prop);
  assert.ok(buildRuntimeKitScript().includes("GeneModels") && buildRuntimeKitScript().includes("GeneAudio"), "runtime bootstrap injects both kits");
}

console.log("GENE 2.0 module tests passed (provider routing, code safety, SVG sanitizer, research, audio kit).");


// Cloud-build result contract: successful artifacts need matching identity and verifiable metadata.
const cloudBuildId = "12345678-1234-4234-9234-123456789abc";
const goodArtifact = (name) => ({
  status: "success",
  url: "https://gene-builds.blob.vercel-storage.com/" + (name === "windows" ? "GENE-" + cloudBuildId + "-Setup.exe" : "GENE-" + cloudBuildId + "-debug.apk"),
  filename: name === "windows" ? "GENE-" + cloudBuildId + "-Setup.exe" : "GENE-" + cloudBuildId + "-debug.apk",
  sizeBytes: 250000,
  sha256: "a".repeat(64),
  ...(name === "android" ? { signing: "debug" } : {})
});
const cloudReport = {
  buildId: cloudBuildId,
  state: "success",
  targets: { windows: goodArtifact("windows"), android: goodArtifact("android") },
  runUrl: "https://github.com/Mody2024/GENE/actions/runs/12345",
  completedAt: "2026-10-17T12:00:00.000Z",
  note: "verified test fixture"
};
assert.equal(validateCloudBuildReport(cloudReport, cloudBuildId).ok, true, "valid report with artifact evidence is accepted");
assert.equal(validateCloudBuildReport({ ...cloudReport, buildId: "----1234----1234----1234----1234" }, cloudBuildId).ok, false, "malformed build identifiers are rejected even when they have 36 characters");
assert.equal(validateCloudBuildReport({ ...cloudReport, buildId: cloudBuildId }, "----1234----1234----1234----1234").ok, false, "a malformed requested build identifier cannot validate a report");
const extraFieldReport = validateCloudBuildReport({ ...cloudReport, targets: { windows: { ...goodArtifact("windows"), accessToken: "must-not-be-exposed" }, android: goodArtifact("android") } }, cloudBuildId);
assert.equal(extraFieldReport.ok, true, "documented artifact evidence remains valid when unknown metadata is present");
assert.equal(extraFieldReport.ok && Object.hasOwn(extraFieldReport.report.targets.windows, "accessToken"), false, "unknown artifact metadata is stripped before the report reaches the browser");
assert.equal(validateCloudBuildReport({ ...cloudReport, runUrl: "https://github.com/Mody2024/GENE/issues/123" }, cloudBuildId).ok, false, "workflow evidence must link to an actual Actions run, not an arbitrary GitHub page");
assert.equal(validateCloudBuildReport({ ...cloudReport, targets: { windows: { status: "failure" }, android: goodArtifact("android") }, state: "partial" }, cloudBuildId).ok, false, "all target outcomes must use the expected artifact identity");
assert.equal(validateCloudBuildReport({ ...cloudReport, buildId: "87654321-1234-4234-9234-123456789abc" }, cloudBuildId).ok, false, "cross-build report substitution is rejected");
assert.equal(validateCloudBuildReport({ ...cloudReport, targets: { windows: { ...goodArtifact("windows"), sha256: "bad" }, android: goodArtifact("android") } }, cloudBuildId).ok, false, "successful artifacts without valid SHA-256 are rejected");
assert.equal(validateCloudBuildReport({ ...cloudReport, targets: { windows: { ...goodArtifact("windows"), url: "https://gene-builds.blob.vercel-storage.com/GENE-" + cloudBuildId + "-other.exe" }, android: goodArtifact("android") } }, cloudBuildId).ok, false, "download URL path must match the claimed artifact filename");
assert.equal(validateCloudBuildReport({ ...cloudReport, targets: { windows: { ...goodArtifact("windows"), url: "https://user@gene-builds.blob.vercel-storage.com/GENE-" + cloudBuildId + "-Setup.exe" }, android: goodArtifact("android") } }, cloudBuildId).ok, false, "artifact URLs with embedded credentials are rejected");
assert.equal(validateCloudBuildReport({ ...cloudReport, state: "partial" }, cloudBuildId).ok, false, "state cannot contradict successful target outcomes");
assert.equal(validateCloudBuildReport({ ...cloudReport, targets: { windows: { status: "failure", url: "https://evil.test/file.exe" } }, state: "failed" }, cloudBuildId).ok, false, "failed targets cannot expose untrusted downloads");
assert.equal(validateCloudBuildReport({ ...cloudReport, targets: { windows: goodArtifact("windows") }, state: "success", runUrl: "http://github.com/actions/run" }, cloudBuildId).ok, false, "workflow evidence must use HTTPS");
const buildRouteSource = readFileSync(new URL("../apps/web/app/api/builds/[buildId]/route.ts", import.meta.url), "utf8");
assert.ok(buildRouteSource.includes('String(item.display_title || "") === id'), "cloud build status must match the exact requested workflow run ID");
assert.ok(buildRouteSource.includes("GENE_BUILD_STATUS_UNAVAILABLE"), "GitHub API errors must be reported as unavailable rather than a fabricated queued state");
assert.ok(buildRouteSource.includes("Could not verify the cloud build result with GitHub"), "status lookup failures must be visible to the user");
console.log("GENE cloud-build report contract tests passed.");


// Build orchestration: skipped required work must never be mistaken for a successful build.
const orchestratorSource = readFileSync(new URL("../apps/web/app/lib/build-orchestrator.ts", import.meta.url), "utf8");
const orchestratorJs = ts.transpileModule(orchestratorSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
}).outputText;
const orchestratorUrl = "data:text/javascript;base64," + Buffer.from(orchestratorJs).toString("base64");
const { createBuildRun, setTaskStatus, resumeBuild, getReadyTasks } = await import(orchestratorUrl);
assert.throws(() => createBuildRun({ projectId: "empty", tasks: [] }), /at least one task/, "empty build plans are rejected instead of creating idle runs");
assert.throws(() => createBuildRun({ projectId: "bad-id", tasks: [{ id: " ", title: "Bad ID", kind: "design", acceptance: [] }] }), /stable identifiers/, "blank task IDs are rejected before dependency scheduling");
assert.throws(() => createBuildRun({ projectId: "bad-title", tasks: [{ id: "task-1", title: " ", kind: "design", acceptance: [] }] }), /non-empty title/, "tasks must have a meaningful visible title");
assert.throws(() => createBuildRun({ projectId: " ", tasks: [{ id: "task-1", title: "Task", kind: "design", acceptance: [] }] }), /Build project IDs/, "blank project IDs are rejected");
assert.throws(() => createBuildRun({ projectId: "bad-kind", tasks: [{ id: "task-1", title: "Task", kind: "invalid", acceptance: [] }] }), /kind is not supported/, "unsupported task kinds are rejected");
assert.throws(() => createBuildRun({ projectId: "bad-acceptance", tasks: [{ id: "task-1", title: "Task", kind: "design", acceptance: [1] }] }), /acceptance criteria/, "malformed acceptance criteria are rejected before execution");
const skippedRun = createBuildRun({
  projectId: "verification-test",
  now: "2026-10-17T12:00:00.000Z",
  tasks: [{ id: "required-check", title: "Required check", kind: "test", acceptance: ["must pass"] }]
});
const skippedResult = setTaskStatus(skippedRun, "required-check", "skipped", "2026-10-17T12:00:01.000Z");
assert.throws(() => setTaskStatus(skippedRun, "required-check", "passed", "2026-10-17T12:00:01.000Z"), /Invalid task status transition/, "queued tasks cannot be marked passed without running");
assert.notEqual(skippedResult.status, "completed", "a skipped required task must not produce completed status");
assert.equal(skippedResult.status, "needs-input", "skipped work should require an explicit decision");
const startedRun = setTaskStatus(skippedRun, "required-check", "running", "2026-10-17T12:00:01.000Z");
const passedRun = setTaskStatus(startedRun, "required-check", "passed", "2026-10-17T12:00:02.000Z");
assert.equal(passedRun.status, "completed", "a task that actually passes may complete the build");
assert.throws(() => setTaskStatus(passedRun, "required-check", "failed", "2026-10-17T12:00:03.000Z"), /Invalid task status transition/, "a passed task cannot be retroactively marked failed in the same run");
assert.throws(() => resumeBuild(passedRun), /completed build cannot be resumed/, "completed work cannot be reopened by the resume action");
const retryBase = createBuildRun({ projectId: "retry-test", now: "2026-10-17T12:00:03.000Z", tasks: [{ id: "retry-check", title: "Retry check", kind: "test", acceptance: ["must pass"] }] });
const retryStart = setTaskStatus(retryBase, "retry-check", "running", "2026-10-17T12:00:04.000Z");
const failedAttempt = setTaskStatus(retryStart, "retry-check", "failed", "2026-10-17T12:00:05.000Z", "temporary runtime error");
const retried = resumeBuild(failedAttempt, "2026-10-17T12:00:06.000Z");
assert.equal(retried.tasks[0].status, "queued", "resume requeues failed work instead of leaving an active run with no runnable task");
assert.deepEqual(getReadyTasks(retried).map(task => task.id), ["retry-check"], "retried failed work becomes ready again");
const blockedStart = setTaskStatus(skippedRun, "required-check", "blocked", "2026-10-17T12:00:07.000Z", "missing user input");
assert.throws(() => resumeBuild(blockedStart), /blocked tasks that need user input/, "resume does not silently bypass a blocked task");
console.log("GENE build-orchestrator completion and recovery tests passed.");


// GENE identity: light-first default, persistent explicit theme choice, and restrained genie-inspired accents.
const themePage = readFileSync(new URL("../apps/web/app/page.tsx", import.meta.url), "utf8");
assert.ok(themePage.includes("analyzeProjectScripts(safetyFiles, { scopeChecks: true })") && themePage.includes("Runtime identifier safety"), "workspace build checks expose the same conservative runtime identifier analysis used by the build API");
assert.ok(themePage.includes("/\\.(?:m?js|cjs)$/i.test(path") && themePage.includes("moduleSyntaxFiles.length") && themePage.includes("ES module file(s) require module-aware validation"), "workspace syntax QA distinguishes classic scripts from ES modules requiring module-aware validation");
assert.ok(["Project file paths", "Source size budget", "Self-contained runtime"].every(label => themePage.includes('add("' + label + '"')), "workspace quality gate checks safe paths, source budgets and self-contained runtime constraints");
assert.ok(themePage.includes("inspectProjectFilePaths(allPaths)"), "workspace and cloud builder use the shared cross-platform file path policy");
assert.ok(themePage.includes("const allJavaScript = fileEntries.filter(([path, source]) => /\\.(?:m?js|cjs)$/i.test(path)"), "external-runtime and inline-script checks inspect CommonJS modules too");
const cloudBuildRoute = readFileSync(new URL("../apps/web/app/api/builds/route.ts", import.meta.url), "utf8");
assert.ok(cloudBuildRoute.includes("normalizeProjectFilePath(value)") && cloudBuildRoute.includes("path.normalize(\"NFC\").toLowerCase()") && cloudBuildRoute.includes("inspectProjectFilePaths(files.map(file => file.path))"), "cloud build rejects unsafe, conflicting, case- and Unicode-colliding paths");
const cloudWorkerSource = readFileSync(new URL("../scripts/cloud-build.mjs", import.meta.url), "utf8");
assert.ok(cloudWorkerSource.includes("normalizeProjectFilePath(value)") && cloudWorkerSource.includes("inspectProjectFilePaths(payload.files.map(item=>item&&item.path))"), "the cloud worker revalidates path safety and collisions before writing decrypted files");
assert.ok(cloudBuildRoute.includes('files.some(file => file.path === "index.html")'), "cloud builds require the exact canonical index.html entry point");
const agentRoute = readFileSync(new URL("../apps/web/app/api/agent/route.ts", import.meta.url), "utf8");
const codeSafetySource = readFileSync(new URL("../apps/web/app/lib/code-safety.mjs", import.meta.url), "utf8");
assert.ok(agentRoute.includes("inspectProjectFilePaths(normalized.map(file => file.path))") && agentRoute.includes("normalizeProjectFilePath(value).ok"), "AI-generated files use the same portable path and collision policy as workspace QA and cloud packaging");
assert.ok(agentRoute.includes("/\\.(?:m?js|cjs)$/i.test(file.path)") && codeSafetySource.includes("/\\.(?:m?js|cjs)$/i.test(file.path)"), "server syntax checks and static identifier analysis include .js, .mjs and .cjs files");
assert.ok(agentRoute.includes("const runtimeSource = Object.entries(byPath).filter(([path, content]) => /\\.(?:m?js|cjs)$/i.test(path)"), "audio and gameplay-control contract checks inspect all executable module extensions");
assert.ok(agentRoute.includes("path.normalize(\"NFC\").toLowerCase()"), "additionalFiles declarations reject case/Unicode-equivalent duplicate paths");
assert.ok(cloudBuildRoute.includes('method: "DELETE" }).catch(() => null);') && cloudBuildRoute.includes("temporary source branch was cleaned up"), "failed build dispatch attempts to remove the temporary encrypted source branch");
assert.ok(["Win / loss state hooks", "Restart / reset hooks", "Pause / resume hooks"].every(label => themePage.includes('add("' + label + '"')), "game QA reports recognizable outcome, restart and pause paths without claiming they are playtested");
const themeLayout = readFileSync(new URL("../apps/web/app/layout.tsx", import.meta.url), "utf8");
const themeCss = readFileSync(new URL("../apps/web/app/studio-redesign.css", import.meta.url), "utf8");
assert.ok(themePage.includes('useState<"light" | "dark">("light")'), "new workspaces default to the light theme");
assert.ok(themePage.includes('localStorage.getItem("gene.theme")') && themePage.includes('localStorage.setItem("gene.theme", theme)'), "user theme choice remains persisted");
assert.ok(themePage.includes("if (!themeReady) return") && themePage.includes("[theme, themeReady]"), "saved theme is read before the default theme can overwrite it");
assert.ok(themePage.includes("IDEAS, BROUGHT TO LIFE"), "GENE welcome screen carries its own concise creation-focused identity");
assert.ok(themeLayout.includes('data-theme="light"'), "the document starts light to avoid a dark first-paint flash");
assert.ok(themeCss.includes("--studio-accent:#3e795f") && themeCss.includes("rgba(211,166,82,.07)"), "GENE light theme uses restrained green and warm-gold identity tokens");
assert.ok(themeCss.includes("--studio-accent:#b7d9c2") && themeCss.includes("rgba(211,166,82,.055)") && !themeCss.includes("#bbb2ff"), "dark theme uses muted forest-green and warm-gold tokens instead of the old purple accent");
assert.ok(themePage.includes("GENE genie lamp and wish spark mark") && themePage.includes("gene-logo-spark") && themePage.includes("gene-logo-orbit") && themePage.includes("viewBox=\"0 0 48 48\""), "GENE brand mark uses a custom genie lamp, wish spark and orbit");
assert.ok(themeCss.includes(".studio-v2 .brand:focus-visible"), "the brand home control has a visible keyboard focus state");

console.log("GENE light-first genie identity tests passed.");

const modelingPromptSource = readFileSync(new URL("../apps/web/app/lib/prompts.ts", import.meta.url), "utf8");
const agentRouteSource = readFileSync(new URL("../apps/web/app/api/agent/route.ts", import.meta.url), "utf8");
assert.ok(agentRouteSource.includes("fallbackTitle") && agentRouteSource.includes("fallbackEngine"), "agent normalizer recovers missing plan title and engine from trusted project context");
assert.ok(agentRouteSource.includes("GeneAudio.music.start") && agentRouteSource.includes("GeneAudio.createSettingsPanel"), "fallback game builders receive the runtime audio contract required by build validation");
assert.ok(agentRouteSource.includes("FINAL GAME BUILD CONTRACT") && agentRouteSource.includes("plan.title, plan.summary and plan.engine"), "primary and fallback build requests repeat required plan and playable-game deliverables");
assert.ok(agentRouteSource.includes("Different genres must produce visibly different trees") && agentRouteSource.includes("project-specific file tree BEFORE writing code") && agentRouteSource.includes("not as a universal project architecture"), "game builder is explicitly required to design genre-specific hierarchies while retaining only runtime compatibility entry files");
assert.ok(agentRouteSource.includes("additionalFiles contains duplicate paths") && agentRouteSource.includes("additionalFiles in dependency/load order") && agentRouteSource.includes("native ES modules"), "game projects validate unique, present, declared classic-script modules and dependency ordering");
assert.ok(agentRouteSource.includes("Treat the architecture blueprint as an executable contract") && agentRouteSource.includes("architecture.modules contains duplicate paths") && agentRouteSource.includes("architecture module \" + modulePath + \" is missing") && agentRouteSource.includes("spec.additionalFiles = [...modulePaths"), "server build validator enforces blueprint module paths, uniqueness, file presence and load order");
assert.ok(agentRouteSource.includes("window.GeneModules[filenameWithoutExtension]") && !agentRouteSource.includes("window.GENE.modules"), "game-generation contract uses the same GeneModules namespace as staged builds and preview");
assert.ok(themePage.includes("GENE isolated module") && themePage.includes("}).call(window);"), "live preview isolates each generated module to prevent top-level lexical collisions");
assert.ok(agentRouteSource.includes("GENE Syntax Repair") && agentRouteSource.includes("parse errors only"), "generated JavaScript syntax errors get a bounded repair attempt before final validation");
assert.ok(agentRouteSource.includes("Exact parser diagnostics") && agentRouteSource.includes("syntaxDiagnostics") && agentRouteSource.includes("perCallMs: 5_000"), "syntax repair receives exact parser errors and a bounded retry window instead of guessing blindly");
assert.ok(agentRouteSource.includes("GENE Module Integration Repair") && agentRouteSource.includes("cross-module identifier/API wiring") && agentRouteSource.includes("reAudit.errors.length === 0"), "full-game cross-module scope failures get a bounded repair that is accepted only after the complete project passes safety analysis");
assert.ok(agentRouteSource.includes("Salvage a common model formatting mistake") && agentRouteSource.includes("inlineScripts.join"), "inline executable scripts are moved into game.js before strict project validation");
assert.ok(agentRouteSource.includes("perCallMs: isBuild ? 12_000 : 7_000") && agentRouteSource.includes("maxAttempts: isBuild ? 4 : 7"), "whole-game fallback attempts get a realistic generation window within the overall request deadline");
assert.ok(agentRouteSource.includes("plan.description") && agentRouteSource.includes("input.reply.trim().slice(0, 600)"), "agent normalizer fills a missing plan summary without discarding an otherwise usable game build");
const researchRouteSource = readFileSync(new URL("../apps/web/app/api/research/route.ts", import.meta.url), "utf8");
assert.ok(modelingPromptSource.includes("GENE PRO-GAME QUALITY BAR"), "game build prompts enforce a production-quality vertical-slice bar");
assert.ok(modelingPromptSource.includes("GAMEPLAY FIRST") && modelingPromptSource.includes("PRO ART DIRECTION"), "game prompts prioritize playable mechanics and cohesive art direction");
assert.ok(modelingPromptSource.includes("ENGINE INTEGRITY") && modelingPromptSource.includes("QA BEFORE RETURN"), "game prompts require engine-specific implementation and a boot-to-ending audit");
assert.ok(researchRouteSource.includes("polyHavenCatalog()") && researchRouteSource.includes("api.polyhaven.com/assets?t=models"), "game research fetches the real Poly Haven asset catalogue rather than skipping 3D assets");
assert.ok(modelingPromptSource.includes("REAL 3D MODEL PIPELINE") && modelingPromptSource.includes("modelRequests") && modelingPromptSource.includes("GENE3D.parseOBJ"), "3D builds explicitly request real Forge meshes and wire OBJ/MTL geometry into the renderer");
assert.ok(modelingPromptSource.includes("DETAILED EDIT PRESERVATION") && modelingPromptSource.includes("SELF-REPAIR AND TASK DECOMPOSITION"), "detailed changes preserve unrelated systems and large failures have a module-splitting recovery contract");
assert.ok(themePage.includes("shouldSplitLongGameTask") && themePage.includes("gameplay-core.js") && themePage.includes("gameplay-ui.js"), "truncated game.js output automatically splits into two dependency-aware modules and retries integration");
assert.ok(themePage.includes("genreArchitectures") && ["src/world/exploration.js", "src/systems/runner-movement.js", "src/world/voxel-system.js", "src/world/grid-map.js", "src/player/platformer-controller.js", "src/systems/weapons.js", "src/vehicle/vehicle-controller.js", "src/systems/puzzle-state.js"].every(path => themePage.includes(path)), "staged game builder maps distinct genres to purpose-built system hierarchies rather than one universal template");
assert.ok(themePage.includes("architecture.modules must list each planned file") && themePage.includes("architecture.dataFlow") && themePage.includes("fail visibly rather than silently skipping mechanics") && themePage.includes("Do not access another module's private state directly"), "game generation requires explicit architecture, data flow, dependency order and real module API integration");
assert.ok((themePage.includes("needsResearch") && themePage.includes("await runFetch(\"/api/research\"") && themePage.includes("Attached research to your message")) && themePage.includes('spec.modelingStatus = generatedModels.length ? "forge-generated-obj-mtl"'), "research is awaited before a build and actual Forge asset generation is recorded honestly");
assert.ok(themePage.includes("hasSource && asksForChange") && themePage.includes('operation = "edit"'), "specific changes typed in Chat are routed to source edits for existing projects");
assert.ok(themePage.includes("skip (?:the )?interview") && themePage.includes('operation = "interview"'), "new builds start the interview unless the user explicitly opts out");
