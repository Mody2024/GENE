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
