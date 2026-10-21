import assert from "node:assert/strict";
import { recommendCamera, formatCameraContract } from "../apps/web/app/lib/camera-intelligence.mjs";

const cases = [
  ["first-person shooter", "webgl3d", "first-person"],
  ["third person skeleton character action game", "webgl3d", "third-person"],
  ["top-down funny arena", "canvas2d", "top-down"],
  ["isometric tactics game", "webgl3d", "isometric"],
  ["side-scrolling precision platformer", "canvas2d", "side-scroller"],
  ["truck driving delivery game", "webgl3d", "chase-driving"],
  ["Geometry Dash rhythm platformer", "canvas2d", "forward-runner"]
];
for (const [intent, engine, expected] of cases) {
  const result = recommendCamera({ intent, engine });
  assert.equal(result.profile, expected, intent);
  assert.ok(result.fov >= 35 && result.fov <= 95);
  assert.ok(result.smoothing >= 0.02 && result.smoothing <= 0.35);
  assert.ok(result.checks.length >= 4);
}
const mobile = recommendCamera({ intent: "top-down mobile game", engine: "canvas2d", platform: "mobile" });
assert.equal(mobile.mobile, true);
assert.ok(mobile.checks.some(check => /touch controls/i.test(check)));
assert.equal(recommendCamera({ intent: "anything", engine: "webgl3d" }).projection, "perspective");
assert.equal(recommendCamera({ intent: "anything", engine: "canvas2d" }).projection, "orthographic");
const contract = formatCameraContract("third-person city exploration", "webgl3d");
assert.match(contract, /CAMERA INTELLIGENCE CONTRACT/);
assert.match(contract, /wall\/geometry clipping/);
console.log("Camera intelligence tests passed (genre profiles, bounds, mobile safe areas, and honest capability contract).");
