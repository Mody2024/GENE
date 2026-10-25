import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const sourcePath = fileURLToPath(new URL("../apps/web/app/lib/runtime-assets.ts", import.meta.url));
let source = await readFile(sourcePath, "utf8");
source = source.replace('import { buildRuntimeKitScript } from "./runtime-kit.mjs";', 'const buildRuntimeKitScript = () => "";');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
}).outputText;
const moduleUrl = "data:text/javascript;base64," + Buffer.from(compiled).toString("base64");
const { buildRuntimeAssetBootstrap } = await import(moduleUrl);

const files = {
  "assets/forge2d/character.json": JSON.stringify({
    animationClips: [
      { name: "idle", frames: [0], frameDurationMs: 120, loop: true },
      { name: "walk", frames: [0, 1, 2, 3], frameDurationMs: 100, loop: true },
      { name: "once", frames: [0, 1], frameDurationMs: 100, loop: false }
    ]
  }),
  "assets/forge2d/character/frames/frame-00.svg": "<svg id='zero'/>",
  "assets/forge2d/character/frames/frame-01.svg": "<svg id='one'/>",
  "assets/forge2d/character/frames/frame-02.svg": "<svg id='two'/>",
  "assets/forge2d/character/frames/frame-03.svg": "<svg id='three'/>",
  "assets/models/character.obj": "mtllib materials/character-palette.mtl\nv 0 0 0\nv 1 0 0\nv 0 1 0\nusemtl painted\nf 1 2 3",
  "assets/models/materials/character-palette.mtl": "newmtl painted\nKd 0.2 0.4 0.6",
  "assets/models/multi.obj": "mtllib materials/base.mtl materials/accent.mtl\nv 0 0 0\nv 1 0 0\nv 0 1 0\nusemtl painted\nf 1 2 3\nusemtl accent\nf 1 3 2",
  "assets/models/materials/base.mtl": "newmtl painted\nKd 0.2 0.4 0.6",
  "assets/models/materials/accent.mtl": "newmtl accent\nKd 0.9 0.1 0.3",
  "assets/unapproved/script.js": "alert(1)"
};
const bootstrap = buildRuntimeAssetBootstrap(files);
assert.ok(!bootstrap.includes("alert(1)"), "runtime asset allowlist excludes arbitrary executable files");
const scripts = Array.from(bootstrap.matchAll(/<script>([\s\S]*?)<\/script>/g));
assert.ok(scripts.length >= 2, "runtime bootstrap includes storage and game scripts");
const runtimeScript = scripts.map(match => match[1]).find(script => script.includes("S.draw=function") && script.includes("GENE_SPRITES"));
assert.ok(runtimeScript, "runtime bootstrap includes the sprite animation controller");
const draws = [];
class MockImage {
  constructor() { this.complete = true; this.naturalWidth = 128; this.naturalHeight = 128; }
  set src(value) { this._src = value; }
  get src() { return this._src; }
}
const context = { drawImage: (...args) => draws.push(args) };
const canvasPrototype = { clearRect() {}, fillRect() {} };
const window = { addEventListener() {}, requestAnimationFrame() {}, CanvasRenderingContext2D: { prototype: canvasPrototype }, document: { querySelector() { return null; }, images: [] } };
const document = {
  readyState: "complete",
  querySelectorAll: () => [],
  querySelector: () => null,
  images: [],
  createElement: () => ({ getContext: () => ({ drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(4) }) }) })
};
vm.runInNewContext(runtimeScript, { window, document, Image: MockImage, performance: { now: () => 0 }, Date, console, Float32Array, Uint8Array, Math, JSON, Object, Array, String, Number, RegExp });
assert.deepEqual(Array.from(window.GENE_SPRITES.clips("assets/forge2d/character")), ["idle", "walk", "once"]);
assert.equal(window.GENE_SPRITES.draw(context, "assets/forge2d/character", "walk", 10, 20, 30, 40, 0), true);
assert.equal(draws[0][0].src.includes("frame-00.svg"), true, "walk animation starts on its first individual frame");
assert.equal(window.GENE_SPRITES.draw(context, "assets/forge2d/character", "walk", 10, 20, 30, 40, 200), true);
assert.equal(draws[1][0].src.includes("frame-02.svg"), true, "elapsed time advances the animation to a different individual frame");
assert.equal(window.GENE_SPRITES.draw(context, "assets/forge2d/character", "missing", 0, 0, 10, 10, 0), true, "unknown clips safely fall back to idle/first clip");
assert.equal(window.GENE_SPRITES.draw(context, "assets/forge2d/character", "once", 0, 0, 10, 10, 900), true);
assert.equal(draws[3][0].src.includes("frame-01.svg"), true, "non-looping animation stays on its final frame");
assert.equal(window.GENE_SPRITES.draw(context, "assets/forge2d/missing", "walk", 0, 0, 10, 10, 0), false, "missing animation manifests fail safely");
assert.equal(window.GENE_DIAGNOSTICS.snapshot().spriteDraws, 4, "runtime diagnostics count only successful animated sprite draws");

const gl = { ARRAY_BUFFER: 1, STATIC_DRAW: 2, next: 0, created: [], createBuffer() { const b = { id: ++this.next }; this.created.push(b); return b; }, bindBuffer() {}, bufferData() {}, deleteBuffer() {} };
const meshes = window.GENE3D.createMeshBuffers(gl, "assets/models/character.obj");
assert.equal(meshes.length, 1, "OBJ mesh groups become one WebGL buffer");
assert.equal(meshes[0].vertexCount, 3, "mesh buffers preserve triangulated vertex counts");
assert.deepEqual(Array.from(meshes[0].diffuse), [0.2, 0.4, 0.6], "OBJ material color comes from the paired MTL file");
const multiMeshes = window.GENE3D.createMeshBuffers(gl, "assets/models/multi.obj");
assert.equal(multiMeshes.length, 2, "OBJ groups can use materials from multiple declared MTL files");
assert.deepEqual(Array.from(multiMeshes.find(mesh => mesh.material === "painted").diffuse), [0.2, 0.4, 0.6], "first declared MTL contributes its material");
assert.deepEqual(Array.from(multiMeshes.find(mesh => mesh.material === "accent").diffuse), [0.9, 0.1, 0.3], "second declared MTL contributes its material");
const traversalFiles = {
  "assets/models/traversal.obj": "mtllib ../../outside.mtl\nv 0 0 0\nv 1 0 0\nv 0 1 0\nusemtl painted\nf 1 2 3",
  "outside.mtl": "newmtl painted\nKd 1 0 0"
};
const traversalBootstrap = buildRuntimeAssetBootstrap(traversalFiles);
const traversalContext = { console, Float32Array, Uint8Array, Math, Number, String, Object, Array, Set, Map, Error };
traversalContext.window = traversalContext;
traversalContext.__GENE_ASSETS__ = traversalFiles;
vm.runInNewContext(traversalBootstrap, traversalContext);
const traversalGl = { ARRAY_BUFFER: 1, STATIC_DRAW: 2, createBuffer() { return {}; }, bindBuffer() {}, bufferData() {}, deleteBuffer() {} };
const traversalMesh = traversalContext.GENE3D.createMeshBuffers(traversalGl, "assets/models/traversal.obj");
assert.deepEqual(Array.from(traversalMesh[0].diffuse), [0.72, 0.76, 0.82], "material libraries outside packaged assets are not loaded");
traversalMesh.dispose();
multiMeshes.dispose();
const failedBuffers = [];
let bufferAttempts = 0;
const failingGl = { ARRAY_BUFFER: 1, STATIC_DRAW: 2, createBuffer() { const buffer = { id: ++bufferAttempts }; failedBuffers.push(buffer); return buffer; }, bindBuffer() {}, bufferData() { if (bufferAttempts === 2) throw new Error("simulated GPU upload failure"); }, deleteBuffer(buffer) { buffer.deleted = true; } };
assert.throws(() => window.GENE3D.createMeshBuffers(failingGl, "assets/models/multi.obj"), /simulated GPU upload failure/, "mesh loading propagates GPU upload failures");
assert.equal(failedBuffers.length, 2, "all allocated buffers are tracked before uploads can fail");
assert.ok(failedBuffers.every(buffer => buffer.deleted), "all allocated GPU buffers are released when a later upload fails");
assert.equal(window.GENE_DIAGNOSTICS.snapshot().meshBuffersCreated, 3, "runtime diagnostics count buffers across the single-material and multi-material OBJ loads");
assert.equal(window.GENE_DIAGNOSTICS.snapshot().meshVerticesPrepared, 9, "runtime diagnostics total prepared vertices across all successfully loaded OBJ groups");
assert.deepEqual(Array.from(window.GENE_DIAGNOSTICS.assess({ requireCanvas: true, requireRenderActivity: true, requireSpriteDraws: true, requireMeshBuffers: true, failOnRuntimeErrors: true }).issues), ["missing-canvas"], "acceptance assessment reports missing evidence rather than falsely passing a blank document");
assert.equal(window.GENE_DIAGNOSTICS.assess({ requireRenderActivity: true, requireSpriteDraws: true, requireMeshBuffers: true }).passed, true, "runtime acceptance passes when the required render evidence exists");
assert.deepEqual(Array.from(window.GENE_DIAGNOSTICS.assess({ requireSpriteDraws: true }).issues), ["missing-sprite-draws"], "sprite-specific acceptance reports missing animated rendering");
canvasPrototype.clearRect();
assert.equal(window.GENE_DIAGNOSTICS.assess({ requireRenderActivity: true }).passed, false, "clearing a canvas alone is not evidence of visible game rendering");
canvasPrototype.fillRect();
assert.equal(window.GENE_DIAGNOSTICS.assess({ requireRenderActivity: true }).passed, true, "meaningful canvas drawing counts as render activity");
meshes.dispose();
console.log("Runtime 2D animation and 3D mesh evidence passed.\n");