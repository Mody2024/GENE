import assert from "node:assert/strict";
import { aabbIntersects, auditSceneLayout, getWorldAabb, recommendCameraFraming, formatSpatialContract } from "../apps/web/app/lib/spatial-intelligence.mjs";

const a = getWorldAabb({ position: [0, 1, 0], scale: [2, 2, 2] });
const b = getWorldAabb({ position: [1, 1, 0], scale: [2, 2, 2] });
assert.equal(aabbIntersects(a, b), true);
assert.equal(getWorldAabb({ position: [0,0,0], scale: [2,1,1], rotation: [0,45,0] }).size[0] > 2, true, "rotated objects use conservative world-space bounds");

const audit = auditSceneLayout({
  objects: [
    { id: "spawn", role: "player", position: [0, 1, 0], scale: [1, 2, 1] },
    { id: "spike", role: "hazard", position: [0, 1, 0], scale: [1, 1, 1] },
    { id: "far", role: "decoration", position: [100, 0, 0], scale: [2, 2, 2] }
  ],
  bounds: { min: [-10, -2, -10], max: [10, 10, 10] },
  spawnId: "spawn"
});
assert.equal(audit.passed, false);
assert.ok(audit.warnings.some(item => item.code === "HAZARD_OVERLAPS_SPAWN"));
assert.ok(audit.warnings.some(item => item.code === "OUTSIDE_PLAYABLE_BOUNDS"));

const camera = recommendCameraFraming({ bounds: { min: [-10, 0, -10], max: [10, 8, 10] }, fov: 68 });
assert.ok(camera.distance > 10 && camera.far > camera.distance);
assert.match(formatSpatialContract("third person city game", "webgl3d"), /3D sizing/);
assert.match(formatSpatialContract("platformer", "canvas2d"), /world-to-screen transform/);
console.log("Spatial intelligence tests passed (rotated bounds, layout warnings, camera framing, and 2D/3D contracts).");
