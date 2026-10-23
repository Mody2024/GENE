import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const page = readFileSync(new URL("../apps/web/app/page.tsx", import.meta.url), "utf8");
const runtimeAssets = readFileSync(new URL("../apps/web/app/lib/runtime-assets.ts", import.meta.url), "utf8");
const prompts = readFileSync(new URL("../apps/web/app/lib/prompts.ts", import.meta.url), "utf8");
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

assert.match(prompts, /GAMEPLAY TELEMETRY CONTRACT[\s\S]{0,1600}Never treat game-authored telemetry as independent proof/, "generated games receive honest instructions for reporting real gameplay transitions");

assert.match(page, /state === "gameplay-event"[\s\S]{0,500}not independent gameplay verification/, "the workspace surfaces gameplay telemetry while explicitly avoiding false verification claims");

assert.match(runtimeAssets, /Sprite manifest\/frame integrity failed:/, "asset registry rejects animation manifests with missing or invalid frames");
assert.match(runtimeAssets, /GENE_SPRITES\.validateManifest\(spriteBase\)/, "asset registry delegates sprite frame validation to the animation runtime");

assert.match(runtimeAssets, /referenceInputs:Array\.isArray\(m\.referenceInputs\)\?m\.referenceInputs:\[\]/, "runtime asset listings expose recorded source-reference provenance");

assert.match(runtimeAssets, /World-space mesh bounds are missing or invalid/, "runtime asset validation reports absent or malformed model bounds");
assert.match(runtimeAssets, /Collision proxy metadata is missing/, "runtime asset validation warns when static models lack collision proxies");
assert.match(runtimeAssets, /Collision proxy '\+index\+' is malformed/, "runtime asset validation rejects malformed collision proxy dimensions");

assert.match(runtimeAssets, /sprite-sheet\|atlas\|reference\|texture/, "runtime asset bundles accept bounded imported reference and texture raster paths");

assert.match(runtimeAssets, /Imported image data URL is malformed/, "runtime integrity verification detects malformed imported image data URLs");
assert.match(runtimeAssets, /digestBytes=raw/, "runtime integrity verification hashes decoded raster bytes rather than the data URL string");
