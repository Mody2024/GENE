import assert from "node:assert/strict";
import { aabbIntersects, auditSceneLayout, getWorldAabb, recommendCameraFraming, recommendJumpLayout, formatSpatialContract } from "../apps/web/app/lib/spatial-intelligence.mjs";

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

const objectiveAudit = auditSceneLayout({
  objects: [
    { id: "spawn", role: "player", position: [0, 1, 0], scale: [1, 2, 1] },
    { id: "goal", role: "goal", position: [5, 1, 0], scale: [1, 2, 1] },
    { id: "wall", role: "obstacle", solid: true, position: [5, 1, 0], scale: [2, 3, 2] }
  ],
  bounds: { min: [-10, -2, -10], max: [10, 10, 10] },
  spawnId: "spawn",
  goalId: "goal"
});
assert.ok(objectiveAudit.warnings.some(item => item.code === "GOAL_BLOCKED"), "solid blockers intersecting the goal are reported");
const missingObjectiveAudit = auditSceneLayout({ objects: [], spawnId: "missing-spawn", goalId: "missing-goal" });
assert.ok(missingObjectiveAudit.warnings.some(item => item.code === "MISSING_SPAWN_OBJECT"));
assert.ok(missingObjectiveAudit.warnings.some(item => item.code === "MISSING_GOAL_OBJECT"));

const jump = recommendJumpLayout({ horizontalSpeed: 5, jumpVelocity: 8, gravity: 16, playerWidth: 1, safetyMargin: 0.5 });
assert.equal(jump.airtimeSeconds, 1);
assert.equal(jump.theoreticalDistance, 5);
assert.equal(jump.recommendedMaximumGap, 3.5);
const noJump = recommendJumpLayout({ horizontalSpeed: 5, jumpVelocity: 0, gravity: 16 });
assert.equal(noJump.recommendedMaximumGap, 0, "a game with no jump impulse must not recommend a positive jump gap");

const camera = recommendCameraFraming({ bounds: { min: [-10, 0, -10], max: [10, 8, 10] }, fov: 68 });
assert.ok(camera.distance > 10 && camera.far > camera.distance);
assert.match(formatSpatialContract("third person city game", "webgl3d"), /3D sizing/);
assert.match(formatSpatialContract("platformer", "canvas2d"), /world-to-screen transform/);
console.log("Spatial intelligence tests passed (rotated bounds, layout warnings, jump-gap estimates, camera framing, and 2D/3D contracts).");
