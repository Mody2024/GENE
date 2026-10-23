import assert from "node:assert/strict";
import { buildNative2DAsset } from "../apps/web/lib/forge-2d.mjs";
import { readFileSync } from "node:fs";
import vm from "node:vm";
const runtimeAssets = readFileSync(new URL("../apps/web/app/lib/runtime-assets.ts", import.meta.url), "utf8");
function runtimeScriptArray(name) {
  const start = runtimeAssets.indexOf("const " + name + " = [");
  assert.ok(start >= 0, "runtime bootstrap array exists: " + name);
  const bodyStart = runtimeAssets.indexOf("[", start) + 1;
  const end = runtimeAssets.indexOf('].join("");', bodyStart);
  assert.ok(end > bodyStart, "runtime bootstrap array closes: " + name);
  return runtimeAssets.slice(bodyStart, end).split("\n")
    .map(line => line.match(/^\s*("(?:\\.|[^"\\])*")\s*,?$/))
    .filter(Boolean)
    .map(match => JSON.parse(match[1]))
    .join("");
}
for (const name of ["runtime", "art", "diagnostics"]) {
  assert.doesNotThrow(() => new vm.Script(runtimeScriptArray(name)), "runtime " + name + " JavaScript must parse before it is injected into a game iframe");
}

const runtimeSandbox = { window: { __GENE_ASSETS__: {
  "assets/skeleton/asset.json": JSON.stringify({ assetId: "gene3d-skeleton-1234", version: 1, name: "Skeleton", kind: "character", provenance: { origin: "generated" }, runtimeCompatibility: { format: "OBJ/MTL" } }),
  "assets/forge2d/character.json": JSON.stringify({ assetId: "gene2d-character-5678", version: 1, name: "Character", kind: "character", provenance: { origin: "generated" }, runtimeCompatibility: { renderer: "Canvas 2D" } }),
  "assets/models/environment.json": JSON.stringify({ assetId: "gene3d-environment-9012", version: 1, name: "Environment", kind: "environment", provenance: { origin: "generated" }, runtimeCompatibility: { format: "OBJ/MTL" } })
} } };
vm.runInNewContext(runtimeScriptArray("runtime"), runtimeSandbox);
const runtimeRegistry = runtimeSandbox.window.GENE_ASSET_REGISTRY;
assert.equal(runtimeRegistry.list().length, 3, "runtime registry should index 2D, direct 3D, and assets/models Forge manifests");
assert.equal(runtimeRegistry.findById("gene3d-skeleton-1234").path, "assets/skeleton/asset.json", "stable 3D asset IDs should resolve to the current manifest path");
assert.equal(runtimeRegistry.resolve("gene2d-character-5678").manifest.runtimeCompatibility.renderer, "Canvas 2D", "registry should preserve capability metadata when resolving 2D assets");
assert.equal(runtimeRegistry.findById("gene3d-environment-9012").path, "assets/models/environment.json", "the runtime registry must index the actual Forge 3D manifest path");
assert.ok(runtimeAssets.includes(String.raw`/^assets\/models\/[a-zA-Z0-9_-]+\.json$/i.test(path)`), "the asset bootstrap must whitelist Forge manifests under assets/models");

const agentRoute = readFileSync(new URL("../apps/web/app/api/agent/route.ts", import.meta.url), "utf8");

for (const kind of ["character", "tileset", "ui", "background", "icon"]) {
  const asset = buildNative2DAsset({ prompt: "A cheerful cartoon skeleton in a city game", kind, quality: "standard" });
  assert.equal(asset.format, "gene-forge-2d-v1");
  assert.equal(asset.kind, kind);
  assert.match(asset.svg, /^<svg /);
  assert.match(asset.svg, /<title>/);
  assert.ok(asset.qualityReport.svgBytes > 100);
  assert.equal(asset.manifest.source, "GENE native procedural 2D generator");
  assert.match(asset.assetId, /^gene2d-[a-z]+-[a-f0-9]{8}$/);
  assert.equal(asset.manifest.assetId, asset.assetId, "manifest and asset must share a stable identity");
  assert.equal(asset.manifest.version, 1, "newly generated assets must be versioned");
  assert.equal(asset.manifest.provenance.origin, "generated", "asset provenance must distinguish generated from imported assets");
  assert.equal(asset.manifest.runtimeCompatibility.renderer, "Canvas 2D via GENE_ART/GENE_SPRITES", "2D manifests must identify the actual runtime integration path");
  assert.equal(asset.manifest.runtimeCompatibility.rigging, "not-included", "frame animation must not be misrepresented as skeletal rigging");
  assert.equal(asset.manifest.runtimeCompatibility.collision, "must-be-configured-by-game-integration", "generated art must not imply that gameplay collision was automatically created");
  assert.deepEqual(asset.manifest.provenance.externalDependencies, [], "native assets must disclose their external dependency list");

  assert.ok(!/<script|<image|href=/i.test(asset.svg), "asset should not contain scripts or externally embedded resources");
}
const stableA = buildNative2DAsset({ prompt: "A stable asset", kind: "character", style: "cartoon" });
const stableB = buildNative2DAsset({ prompt: "A stable asset", kind: "character", style: "cartoon" });
assert.equal(stableA.assetId, stableB.assetId, "same brief and style should produce a stable identity");
const different = buildNative2DAsset({ prompt: "A different asset", kind: "character", style: "cartoon" });
assert.notEqual(stableA.assetId, different.assetId, "different briefs should not collide by default");
const character = buildNative2DAsset({ prompt: "A skeleton player sprite", kind: "character" });
assert.equal(character.manifest.frames, 4);
assert.ok(character.manifest.frameNames.includes("walk-left"));
assert.match(character.qualityReport.warnings[0].code, /NO_SKELETON_RIG/);
assert.equal(character.manifest.animationClips.find(clip => clip.name === "walk").frames.length, 4);
assert.equal(character.manifest.animationClips.find(clip => clip.name === "idle").frames.length, 1);
assert.equal(character.manifest.frameFiles.length, 4);
assert.deepEqual(Object.keys(character.frameFiles), ["frame-00.svg", "frame-01.svg", "frame-02.svg", "frame-03.svg"]);
assert.ok(Object.values(character.frameFiles).every(frame => frame.startsWith("<svg ") && frame.includes("viewBox=")));
assert.match(character.frameFiles["frame-00.svg"], /viewBox="0 0 128 128"/);
assert.match(character.frameFiles["frame-03.svg"], /viewBox="384 0 128 128"/);
const tiles = buildNative2DAsset({ prompt: "A city street tileset", kind: "tileset" });
assert.equal(tiles.manifest.frames, 4);
assert.deepEqual(tiles.manifest.frameNames, ["ground", "road", "wall", "sidewalk"]);
const background = buildNative2DAsset({ prompt: "A night city background", kind: "background" });
assert.match(background.svg, /#263849/);
assert.throws(() => buildNative2DAsset({ prompt: "test", kind: "weapon" }), /Unsupported 2D asset kind/);
assert.match(runtimeAssets, /window\.GENE_SPRITES/ , "runtime exposes frame-based animation playback");
assert.match(runtimeAssets, /GENE_DIAGNOSTICS/, "isolated game runtime exposes render and error diagnostics");
assert.match(runtimeAssets, /GENE_ASSET_REGISTRY/, "game runtime exposes a shared manifest registry for generated and imported assets");
assert.match(runtimeAssets, /R\.findById=function\(id\)/, "runtime assets can be resolved by stable ID instead of stale path copies");
assert.match(runtimeAssets, /runtimeCompatibility:m\.runtimeCompatibility\|\|null/, "asset registry preserves capability metadata for scene integration");
assert.match(runtimeAssets, /canvasOps:0,canvasEntityOps:0,webglDrawCalls:0,animationFrames:0/, "runtime diagnostics distinguish entity drawing, background clearing, 3D draw calls, and frame-loop activity");
assert.match(runtimeAssets, /unhandledrejection/, "runtime diagnostics capture unhandled async failures");
assert.match(runtimeAssets, /hasCanvas:/, "runtime diagnostics report whether a canvas exists");

assert.match(runtimeAssets, /S\.detectFrames=function/, "runtime can detect transparent frame boundaries in sprite sheets");
assert.match(runtimeAssets, /S\.createSheetClip=function/, "runtime supports imported sprite sheets with explicit clip metadata");
assert.match(runtimeAssets, /S\.drawSheet=function/, "runtime can crop one source rectangle from a sprite sheet");
assert.match(runtimeAssets, /RUNTIME_RASTER_PATH/, "runtime admits imported raster atlases only through a bounded data-URI path");
assert.ok(runtimeAssets.includes(String.raw`data:image\\/(?:png|jpeg|webp|gif);base64,`), "runtime can decode approved local raster sheet data");
assert.match(runtimeAssets, /sprite-sheet\|atlas/, "runtime exposes imported sprite sheets to the frame detector");
assert.match(runtimeAssets, /GENE_SPRITES[\s\S]{0,2500}frame-/, "runtime selects a single cropped frame rather than drawing the full atlas");
assert.ok(runtimeAssets.includes(String.raw`replace(/\\.obj$/i,\\\".mtl\\\")`), "runtime must resolve matching MTL files for character.obj and environment.obj, not only model.obj");
assert.ok(runtimeAssets.includes(String.raw`forge2d\\/(?:character|tileset)\\/frames\\/frame-\\d{2}\\.svg`), "asset browser exposes separately sliced character and tileset frames");
assert.match(runtimeAssets, /frame-\\d\{2\}/, "runtime asset allowlist admits sliced sprite frames");
assert.match(agentRoute, /assembled Canvas 2D project has no detectable visible drawing operations/, "audio-only or empty Canvas builds are rejected");
assert.match(agentRoute, /never submits visible geometry to WebGL/, "3D builds must actually submit visible geometry");
assert.match(agentRoute, /never configures the WebGL viewport/, "3D builds must configure their viewport");
assert.match(agentRoute, /never clears its frame buffers/, "3D builds must clear their frame buffers");
assert.match(agentRoute, /no detectable camera or view\/projection transform/, "3D builds must define camera framing");
const workspace = readFileSync(new URL("../apps/web/app/page.tsx", import.meta.url), "utf8");
assert.match(workspace, /colors=Object\.create\(null\)/, "preview visibility checks must count distinct rendered colors");
assert.doesNotMatch(workspace, /if\(n>12\|\|alpha>12\)window\.__geneFrameConfirmed=true/, "opaque clear-color buffers must not count as a visible 3D game");
assert.match(workspace, /geometryDraws>0&&\(\(n>1&&alpha>12\)/, "3D visibility confirmation must require actual WebGL geometry draw calls");
assert.match(workspace, /drawOps>0&&\(\(n>1&&alpha>12\)/, "2D visibility confirmation must require actual entity drawing, not background-only fills");
assert.match(workspace, /livingPreview: \{ status: "booting".*awaiting a visible runtime render/s, "build completion must not mark an unrendered project as playable");
assert.match(workspace, /status: "rendered".*Verify player controls, interaction, and the core gameplay loop/, "a visible scene must remain distinct from verified gameplay");
assert.match(workspace, /Preview visible · verify gameplay/, "the workspace must communicate that rendering is not proof of complete gameplay");
assert.match(workspace, /alpha<samples\*0\.9/, "sparse visible sprites on transparent canvases should still be detectable");
assert.doesNotMatch(workspace, /buildRuntimeAudioBootstrap\((?:project|version)\.files\)\s*\+\s*buildRuntimeAudioBootstrap/, "game audio bootstrap must not be injected twice into one preview");
console.log("Native 2D Forge tests passed.");
