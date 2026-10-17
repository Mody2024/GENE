import assert from "node:assert/strict";
import vm from "node:vm";
import { analyzeProjectScripts, repairUninitializedCollections } from "../apps/web/app/lib/code-safety.mjs";
import { classifyProviderFailure, parseFreeCatalog, extractJsonObjectText } from "../apps/web/app/lib/provider-utils.mjs";
import { sanitizeSvg } from "../apps/web/app/lib/svg-safety.mjs";
import { cleanQuery, buildSearchLinks, filterPolyHaven, formatResearchNotes } from "../apps/web/app/lib/research-sources.mjs";
import { GENE_AUDIO_SOURCE, buildRuntimeKitScript } from "../apps/web/app/lib/runtime-kit.mjs";
import { validateCloudBuildReport } from "../apps/web/app/lib/cloud-build-report.mjs";

// Provider routing: the exact error from the field must be treated as "unavailable", paid models never enter the pool.
assert.equal(classifyProviderFailure(400, "This model is unavailable for free. The paid version is available now - use this slug instead: qwen/qwen3-coder"), "unavailable");
const catalog = parseFreeCatalog({ data: [
  { id: "qwen/qwen3-coder", pricing: { prompt: "0.0000003", completion: "0.0000012" }, context_length: 262144 },
  { id: "qwen/qwen3-coder:free", pricing: { prompt: "0", completion: "0" }, context_length: 262144 },
  { id: "vendor/paid-model", pricing: { prompt: "0.000001", completion: "0.000002" }, context_length: 32000 }
] }, 10);
const ids = catalog.map(model => (typeof model === "string" ? model : model.id));
assert.ok(ids.includes("qwen/qwen3-coder:free") && !ids.includes("qwen/qwen3-coder") && !ids.includes("vendor/paid-model"), "only verifiably free models are routed");
assert.equal(JSON.parse(extractJsonObjectText('Here:\n```json\n{"a":1}\n```')).a, 1);

// The reported crash: `let hazards;` later used as an array.
const fixed = repairUninitializedCollections("let hazards;\nfunction reset(){ hazards.push({x:1}); }\nreset();");
assert.ok(/let hazards\s*=\s*\[\]/.test(fixed.source), "uninitialized collection declarations are repaired");
const bad = analyzeProjectScripts([{ path: "game.js", content: "function tick(){ enemies.push(1); }\ntick();" }], { scopeChecks: true });
assert.ok(bad.errors.length > 0, "undeclared identifiers used as objects are caught");
const good = analyzeProjectScripts([{ path: "game.js", content: "const enemies = [];\nfunction tick(){ enemies.push(1); }\ntick();" }], { scopeChecks: true });
assert.equal(good.errors.length, 0);

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
assert.equal(validateCloudBuildReport({ ...cloudReport, buildId: "87654321-1234-4234-9234-123456789abc" }, cloudBuildId).ok, false, "cross-build report substitution is rejected");
assert.equal(validateCloudBuildReport({ ...cloudReport, targets: { windows: { ...goodArtifact("windows"), sha256: "bad" }, android: goodArtifact("android") } }, cloudBuildId).ok, false, "successful artifacts without valid SHA-256 are rejected");
assert.equal(validateCloudBuildReport({ ...cloudReport, state: "partial" }, cloudBuildId).ok, false, "state cannot contradict successful target outcomes");
assert.equal(validateCloudBuildReport({ ...cloudReport, targets: { windows: { status: "failure", url: "https://evil.test/file.exe" } }, state: "failed" }, cloudBuildId).ok, false, "failed targets cannot expose untrusted downloads");
assert.equal(validateCloudBuildReport({ ...cloudReport, targets: { windows: goodArtifact("windows") }, state: "success", runUrl: "http://github.com/actions/run" }, cloudBuildId).ok, false, "workflow evidence must use HTTPS");
console.log("GENE cloud-build report contract tests passed.");
