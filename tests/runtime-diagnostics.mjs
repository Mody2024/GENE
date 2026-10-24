import assert from "node:assert/strict";
import { classifyRuntime, looksLikeSpriteSheet, PROBE_INIT_SCRIPT } from "../apps/web/app/lib/runtime-diagnostics.mjs";

const healthy = {
  probe: { draw2d: 400, drawGL: 0, raf: 60, listeners: { keydown: 1, click: 1 }, errors: [], shaderErrors: [], imageWhole: [], slices: {} },
  dom: { textLength: 12, controls: 1 }, canvas: { width: 800, height: 480 },
  visible: { contentRatio: 0.4, colors: 12 }, motion: { idleDelta: 0.02, inputDelta: 0.05, domChanged: false }, pageErrors: []
};
const ids = (r, status) => r.checks.filter(check => check.status === status).map(check => check.id);

let r = classifyRuntime(healthy);
assert.equal(r.verdict, "playable");
assert.ok(r.unverified.length >= 3 && r.unverified.some(text => /objective/i.test(text)), "a pass never claims the whole game was tested");

// Audio-only ghost game: audio plays, loop runs, input is wired, nothing is visible.
r = classifyRuntime({ ...healthy, probe: { ...healthy.probe, draw2d: 0, audioStarts: 3 }, visible: { contentRatio: 0, colors: 1 }, motion: { idleDelta: 0, inputDelta: 0 } });
assert.equal(r.verdict, "audio-only-ghost");
assert.match(r.reasons[0], /audio-only ghost game/);
assert.ok(ids(r, "fail").includes("draw-calls") && ids(r, "fail").includes("visible-content"));

// Audio can never rescue an invisible game.
r = classifyRuntime({ ...healthy, probe: { ...healthy.probe, audioStarts: 9, mediaPlays: 2 }, visible: { contentRatio: 0.0, colors: 1 } });
assert.notEqual(r.verdict, "playable");

// Blank canvas: draws happen but only a flat background.
r = classifyRuntime({ ...healthy, visible: { contentRatio: 0.0, colors: 1 } });
assert.equal(r.verdict, "not-playable"); assert.ok(ids(r, "fail").includes("visible-content"));

// Errors, missing renderer, unresponsive and frozen scenes.
r = classifyRuntime({ ...healthy, probe: { ...healthy.probe, errors: ["ReferenceError: hazards is not defined"] } });
assert.equal(r.verdict, "not-playable"); assert.match(r.reasons.join(" "), /hazards/);
r = classifyRuntime({ ...healthy, probe: { ...healthy.probe, shaderErrors: ["shader: ERROR 0:3 undeclared"] } });
assert.ok(ids(r, "fail").includes("no-runtime-errors"));
r = classifyRuntime({ ...healthy, canvas: null });
assert.ok(ids(r, "fail").includes("renderer-present"));
r = classifyRuntime({ ...healthy, motion: { idleDelta: 0, inputDelta: 0, domChanged: false } });
assert.ok(ids(r, "fail").includes("input-response") && ids(r, "fail").includes("scene-alive"));
r = classifyRuntime({ ...healthy, motion: { idleDelta: 0, inputDelta: 0.04, domChanged: false } });
assert.equal(r.verdict, "playable", "a scene that waits for the player is still alive");
r = classifyRuntime({ ...healthy, probe: { ...healthy.probe, listeners: {} }, dom: { textLength: 0, controls: 0 } });
assert.ok(ids(r, "fail").includes("input-handlers"));
// Self-animation is not input response: with an identical control run, no difference means no response.
r = classifyRuntime({ ...healthy, motion: { idleDelta: 0.04, noise: 0, inputDelta: 0.0005, domChanged: false } });
assert.ok(ids(r, "fail").includes("input-response"));
r = classifyRuntime({ ...healthy, motion: { idleDelta: 0.04, noise: 0, inputDelta: 0.03, domChanged: false } });
assert.equal(r.verdict, "playable", "a self-animating game that reacts to input is playable");
// A game whose identical runs differ cannot attribute changes to input: reported as unverified, never as a pass or a failure.
r = classifyRuntime({ ...healthy, motion: { idleDelta: 0.04, noise: 0.03, inputDelta: 0.04, domChanged: false } });
assert.ok(ids(r, "warn").includes("input-response") && !ids(r, "pass").includes("input-response") && !ids(r, "fail").includes("input-response"));

// Genre-aware: a text/visual-novel game has no avatar but needs visible, interactive content.
const novel = { probe: { listeners: { click: 2 }, errors: [] }, dom: { textLength: 200, controls: 2 }, canvas: null, motion: { idleDelta: 0, inputDelta: 0, domChanged: true }, pageErrors: [] };
assert.equal(classifyRuntime(novel, { textGame: true, engine: "dom", requiresMotion: false }).verdict, "playable");
assert.equal(classifyRuntime({ ...novel, dom: { textLength: 0, controls: 0 } }, { textGame: true, engine: "dom", requiresMotion: false }).verdict, "not-playable");
assert.equal(classifyRuntime({ ...novel, motion: { idleDelta: 0, inputDelta: 0, domChanged: false } }, { textGame: true, engine: "dom", requiresMotion: false }).verdict, "not-playable", "a novel whose choices change nothing is not playable");

// Sprite sheets: a whole sheet drawn as one static image fails; sliced frames pass; one frame only is not animation.
const sheet = { src: "data:image/svg+xml;sheet", w: 256, h: 64, dw: 300, dh: 100 };
assert.equal(looksLikeSpriteSheet(sheet), true);
assert.equal(looksLikeSpriteSheet({ w: 64, h: 64 }), false);
r = classifyRuntime({ ...healthy, probe: { ...healthy.probe, imageWhole: [sheet] } });
assert.ok(ids(r, "fail").includes("sprite-sheet-sliced"));
r = classifyRuntime({ ...healthy, probe: { ...healthy.probe, imageWhole: [], slices: { "data:image/svg+xml;sheet|0,0,64,64": 20, "data:image/svg+xml;sheet|64,0,64,64": 20, "data:image/svg+xml;sheet|128,0,64,64": 20 } } }, { expectsSpriteAnimation: true });
assert.ok(ids(r, "pass").includes("sprite-animation") && !ids(r, "fail").includes("sprite-sheet-sliced"));
r = classifyRuntime({ ...healthy, probe: { ...healthy.probe, slices: { "sheet|0,0,64,64": 99 } } }, { expectsSpriteAnimation: true });
assert.ok(ids(r, "fail").includes("sprite-animation"), "drawing only one frame is not an animation");
r = classifyRuntime(healthy, { expectsSpriteAnimation: true });
assert.ok(ids(r, "fail").includes("sprite-animation"), "declared animation with no sheet frames fails");

for (const needle of ["drawArrays", "drawImage", "AudioScheduledSourceNode", "addEventListener", "COMPILE_STATUS", "LINK_STATUS"]) assert.ok(PROBE_INIT_SCRIPT.includes(needle), "probe instruments " + needle);
console.log("Runtime diagnostics classifier tests passed (ghost game, blank canvas, input, genre-aware text games, sprite sheets).");
