import test from "node:test";
import assert from "node:assert/strict";
import { inspectSceneManifest } from "./scene-diagnostics.mjs";

test("rejects a missing or invalid game specification", () => {
  assert.equal(inspectSceneManifest(null).ok, false);
  assert.equal(inspectSceneManifest("{not json").ok, false);
});

test("flags an empty scene so an empty 3D world is not mistaken for a complete scene", () => {
  const report = inspectSceneManifest({ engine: "webgl3d", scene: { objects: [] } });
  assert.equal(report.ok, false);
  assert.match(report.errors.join(" "), /no objects/i);
});

test("flags hidden objects and duplicate IDs", () => {
  const report = inspectSceneManifest({ scene: { objects: [
    { id: "player", visible: false },
    { id: "player", visible: false }
  ] } });
  assert.equal(report.ok, false);
  assert.deepEqual(report.duplicateIds, ["player"]);
  assert.match(report.errors.join(" "), /hidden/i);
});

test("reports visible scene objects and missing OBJ assets", () => {
  const report = inspectSceneManifest({ scene: { objects: [
    { id: "player", visible: true, modelPath: "assets/player.obj" }
  ] } }, {});
  assert.equal(report.visibleCount, 1);
  assert.equal(report.ok, true);
  assert.equal(report.missingModelAssets.length, 1);
  assert.equal(report.warnings.length, 1);
});

test("accepts a referenced OBJ file present in project files", () => {
  const report = inspectSceneManifest({ scene: { objects: [
    { id: "player", modelPath: "assets/player.obj" }
  ] } }, { "assets/player.obj": "v 0 0 0\nf 1 2 3" });
  assert.equal(report.ok, true);
  assert.equal(report.missingModelAssets.length, 0);
});
