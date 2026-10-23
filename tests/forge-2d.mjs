import assert from "node:assert/strict";
import { buildNative2DAsset } from "../apps/web/lib/forge-2d.mjs";

for (const kind of ["character", "tileset", "ui", "background", "icon"]) {
  const asset = buildNative2DAsset({ prompt: "A cheerful cartoon skeleton in a city game", kind, quality: "standard" });
  assert.equal(asset.format, "gene-forge-2d-v1");
  assert.equal(asset.kind, kind);
  assert.match(asset.svg, /^<svg /);
  assert.match(asset.svg, /<title>/);
  assert.ok(asset.qualityReport.svgBytes > 100);
  assert.equal(asset.manifest.source, "GENE native procedural 2D generator");
  assert.ok(!/<script|<image|href=/i.test(asset.svg), "asset should not contain scripts or externally embedded resources");
}
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
console.log("Native 2D Forge tests passed.");
