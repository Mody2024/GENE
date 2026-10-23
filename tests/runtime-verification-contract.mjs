import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const page = readFileSync(new URL("../apps/web/app/page.tsx", import.meta.url), "utf8");
const runtimeAssets = readFileSync(new URL("../apps/web/app/lib/runtime-assets.ts", import.meta.url), "utf8");
assert.match(page, /const persistRun = \(run: BuildRun, previewStatus: "booting" \| "stale" \| "error"/, "source validation/build checkpoints cannot set gameplay-verified status");
assert.match(page, /livingPreview: \{ status: previewStatus[\s\S]{0,260}canContinuePlaying: false/, "a build checkpoint must not claim the game is playable before runtime verification");
assert.match(page, /livingPreview: \{ status: "rendered"[\s\S]{0,260}Verify player controls, interaction, and the core gameplay loop/, "a visible render is explicitly not the same as verified gameplay");
assert.match(page, /state === "rendered"/, "runtime render telemetry remains the separate preview-state transition");
assert.match(runtimeAssets, /state:'input-observed'/, "the isolated runtime reports first input separately from render status");
assert.match(runtimeAssets, /inputEvents:state.inputEvents/, "runtime diagnostics expose observed input counts");
assert.match(page, /event\.data\.state === "input-observed"/, "the workspace handles input telemetry without promoting it to gameplay-verified");
assert.match(page, /not that gameplay responded/, "the UI explicitly distinguishes input arrival from actual gameplay response");
console.log("Runtime verification contract passed (build/source checks cannot masquerade as gameplay verification).");

assert.match(runtimeAssets, /canvasSize:/, "runtime diagnostics expose canvas dimensions for blank or off-screen render diagnosis");
assert.match(runtimeAssets, /hasWebGLContext:/, "runtime diagnostics distinguish a canvas element from a live WebGL context");
assert.match(runtimeAssets, /renderEvidence:\{canvasEntityOps:state\.canvasEntityOps,webglDrawCalls:state\.webglDrawCalls,animationFrames:state\.animationFrames\}/, "runtime snapshots include observed draw and frame evidence");
assert.match(runtimeAssets, /inputObserved:state\.inputEvents>0/, "runtime snapshots distinguish observed input from a successful gameplay response");
assert.match(runtimeAssets, /hasRuntimeErrors:state\.errors\.length>0/, "runtime snapshots expose whether runtime errors were captured");

assert.match(runtimeAssets, /renderAssessment:state\.errors\.length\?'runtime-errors'/, "runtime diagnostics classify observed render/error evidence");
assert.match(runtimeAssets, /gameplayAssessment:'not-verified-by-runtime-telemetry'/, "draw calls and input events never claim gameplay was verified");

assert.match(runtimeAssets, /originalGetContext\.apply\(this,arguments\)/, "renderer diagnostics observe existing getContext calls rather than creating a competing context");
assert.match(runtimeAssets, /contextTypes:state\.contextTypes\.slice\(\)/, "runtime diagnostics report the context types actually requested by the game");
assert.doesNotMatch(runtimeAssets, /hasWebGLContext:Array\.prototype\.some\.call\(w\.document\.querySelectorAll\('canvas'\),function\(c\)\{try\{return !!\(c\.getContext\('webgl'\)/, "diagnostics must not create a WebGL context just to probe for one");

assert.match(runtimeAssets, /S\.validateManifest=function\(base\)/, "sprite runtime exposes a reusable manifest validator");
assert.match(runtimeAssets, /MANIFEST_MISSING/, "sprite validation reports missing manifests explicitly");
assert.match(runtimeAssets, /MANIFEST_INVALID_JSON/, "sprite validation detects malformed manifests");
assert.match(runtimeAssets, /FRAMES_MISSING/, "sprite validation detects referenced animation frames that were not imported");
assert.match(runtimeAssets, /Duplicate animation clip:/, "sprite validation detects duplicate clip names");
assert.match(runtimeAssets, /invalid frame duration/, "sprite validation catches invalid animation timing");

assert.match(runtimeAssets, /R\.validate=function\(p\)/, "runtime asset registry validates manifests against imported files");
assert.match(runtimeAssets, /ASSET_INTEGRITY_FAILED/, "runtime asset validation reports broken assets");
assert.match(runtimeAssets, /OBJ mesh is missing or has no recognizable geometry records/, "runtime asset validation rejects absent or empty mesh files");
assert.match(runtimeAssets, /MTL material file is missing/, "runtime asset validation identifies missing material definitions");
assert.match(runtimeAssets, /Collision shapes must be supplied by scene integration/, "runtime asset validation discloses required scene integration work");
assert.match(runtimeAssets, /validation:report/, "resolving a runtime asset returns its validation report");

assert.match(runtimeAssets, /frame-\\\\d\{2,3\}/, "sprite asset paths must accept three-digit frame numbers emitted by the manifest renderer");

assert.match(runtimeAssets, /contentIntegrity:m\.contentIntegrity\|\|null/, "runtime asset listings expose exact-file fingerprints");
assert.match(runtimeAssets, /Exact OBJ\/MTL SHA-256 fingerprints are missing or invalid/, "runtime asset validation warns on manifests without valid fingerprints");

assert.match(runtimeAssets, /R\.verifyContentIntegrity=async function\(p\)/, "runtime assets support actual asynchronous SHA-256 verification");
assert.match(runtimeAssets, /SHA-256 mismatch:/, "runtime integrity verification detects file contents changed after fingerprinting");
assert.match(runtimeAssets, /FINGERPRINT_MISMATCH/, "tampered asset files produce an explicit integrity failure");
assert.match(runtimeAssets, /crypto\.subtle\.digest\('SHA-256'/, "runtime verifier hashes the exact loaded text bytes with Web Crypto");

assert.match(runtimeAssets, /Sprite sheet\/frame SHA-256 fingerprints are missing/, "2D animation manifests are checked for source and frame fingerprints too");
