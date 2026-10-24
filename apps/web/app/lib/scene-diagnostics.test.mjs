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
  ] } }, { "assets/player.obj": "v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3" });
  assert.equal(report.ok, true);
  assert.equal(report.missingModelAssets.length, 0);
});

test("rejects OBJ path traversal and non-project paths", () => {
  for (const modelPath of ["../secret.obj", "assets/../secret.obj", "assets\\\\secret.obj", "/assets/player.obj", "assets/player.obj?raw=1"]) {
    const report = inspectSceneManifest({ scene: { objects: [{ id: "player", modelPath }] } }, {});
    assert.equal(report.ok, false, "expected unsafe path to fail: " + modelPath);
    assert.match(report.errors.join(" "), /unsafe|unsupported/i);
  }
});

test("does not treat inherited object properties as uploaded assets", () => {
  const files = Object.create({ "assets/player.obj": "fake inherited asset" });
  const report = inspectSceneManifest({ scene: { objects: [{ id: "player", modelPath: "assets/player.obj" }] } }, files);
  assert.equal(report.missingModelAssets.length, 1);
});

test("rejects unsupported WebGL scene types and mesh placeholders without OBJ files", () => {
  const unsupported = inspectSceneManifest({ engine: "webgl3d", scene: { objects: [
    { id: "mystery", type: "unicorn" }
  ] } });
  assert.equal(unsupported.ok, false);
  assert.match(unsupported.errors.join(" "), /unsupported WebGL scene type/i);

  const placeholder = inspectSceneManifest({ engine: "webgl3d", scene: { objects: [
    { id: "empty-mesh", type: "mesh" }
  ] } });
  assert.equal(placeholder.ok, false);
  assert.match(placeholder.errors.join(" "), /no OBJ model path/i);
});

test("accepts supported WebGL primitive geometry without OBJ files", () => {
  const report = inspectSceneManifest({ engine: "webgl3d", scene: { objects: [
    { id: "floor", type: "plane" },
    { id: "player", type: "box" },
    { id: "orb", type: "sphere" },
    { id: "light", type: "light" },
    { id: "camera", type: "camera" }
  ] } });
  assert.equal(report.ok, true);
});

test("rejects non-finite or malformed scene transforms", () => {
  const report = inspectSceneManifest({ engine: "webgl3d", scene: { objects: [
    { id: "nan-position", type: "box", position: [0, "NaN", 2] },
    { id: "bad-scale", type: "sphere", scale: { x: 1, y: null, z: 1 } }
  ] } });
  assert.equal(report.ok, false);
  assert.equal(report.errors.filter(error => /invalid (position|scale) transform/i.test(error)).length, 2);
});

test("warns when a scene object has a zero scale", () => {
  const report = inspectSceneManifest({ engine: "webgl3d", scene: { objects: [
    { id: "flat", type: "box", scale: [1, 0, 1] }
  ] } });
  assert.equal(report.ok, true);
  assert.match(report.warnings.join(" "), /zero scale/i);
});

test("rejects empty and malformed OBJ assets", () => {
  for (const source of ["", "not an OBJ file", "v 0 0 0\nv 1 0 0\nv 0 1 0\n"]) {
    const report = inspectSceneManifest(
      { engine: "webgl3d", scene: { objects: [{ id: "mesh", type: "mesh", modelPath: "assets/mesh.obj" }] } },
      { "assets/mesh.obj": source }
    );
    assert.equal(report.ok, false);
    assert.match(report.errors.join(" "), /OBJ asset/i);
  }
});

test("accepts a small OBJ with vertices and faces", () => {
  const source = "v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n";
  const report = inspectSceneManifest(
    { engine: "webgl3d", scene: { objects: [{ id: "mesh", type: "mesh", modelPath: "assets/mesh.obj" }] } },
    { "assets/mesh.obj": source }
  );
  assert.equal(report.ok, true);
  assert.equal(report.missingModelAssets.length, 0);
});

test("rejects OBJ faces with out-of-range or invalid vertex indices", () => {
  for (const face of ["f 1 2 4", "f 1 nope 3", "f 0 2 3", "f -1 -2 -9"]) {
    const source = "v 0 0 0\nv 1 0 0\nv 0 1 0\n" + face + "\n";
    const report = inspectSceneManifest(
      { engine: "webgl3d", scene: { objects: [{ id: "mesh", type: "mesh", modelPath: "assets/mesh.obj" }] } },
      { "assets/mesh.obj": source }
    );
    assert.equal(report.ok, false, "expected invalid face to fail: " + face);
    assert.match(report.errors.join(" "), /invalid vertex indices/i);
  }
});

test("accepts valid OBJ face references using slash notation and negative indices", () => {
  const source = "v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1/1 2/2 3/3\nf -3 -2 -1\n";
  const report = inspectSceneManifest(
    { engine: "webgl3d", scene: { objects: [{ id: "mesh", type: "mesh", modelPath: "assets/mesh.obj" }] } },
    { "assets/mesh.obj": source }
  );
  assert.equal(report.ok, true);
});

test("validates repeated OBJ face lines without confusing their source positions", () => {
  const source = "v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\nf 1 2 3\n";
  const report = inspectSceneManifest(
    { engine: "webgl3d", scene: { objects: [{ id: "mesh", type: "mesh", modelPath: "assets/mesh.obj" }] } },
    { "assets/mesh.obj": source }
  );
  assert.equal(report.ok, true);
});

test("rejects transform arrays with more than three components", () => {
  const report = inspectSceneManifest({ engine: "webgl3d", scene: { objects: [
    { id: "bad-position", type: "box", position: [0, 1, 2, 3] }
  ] } });
  assert.equal(report.ok, false);
  assert.match(report.errors.join(" "), /invalid position transform/i);
});

test("accepts OBJ geometry records with inline comments and ignores comment-only lines", () => {
  const source = "# a triangle\nv 0 0 0 # origin\nv 1 0 0 # right\nv 0 1 0 # top\nf 1 2 3 # triangle\n";
  const report = inspectSceneManifest(
    { engine: "webgl3d", scene: { objects: [{ id: "mesh", type: "mesh", modelPath: "assets/mesh.obj" }] } },
    { "assets/mesh.obj": source }
  );
  assert.equal(report.ok, true);
});

test("rejects OBJ vertices with non-finite numeric coordinates", () => {
  const source = "v 0 0 0\nv 1e999 0 0\nv 0 1 0\nf 1 2 3\n";
  const report = inspectSceneManifest(
    { engine: "webgl3d", scene: { objects: [{ id: "mesh", type: "mesh", modelPath: "assets/mesh.obj" }] } },
    { "assets/mesh.obj": source }
  );
  assert.equal(report.ok, false);
  assert.match(report.errors.join(" "), /non-finite coordinates/i);
});

test("rejects malformed OBJ vertex records even when other valid vertices exist", () => {
  const source = "v 0 0 0\nv nope 0 0\nv 0 1 0\nf 1 2 3\n";
  const report = inspectSceneManifest(
    { engine: "webgl3d", scene: { objects: [{ id: "mesh", type: "mesh", modelPath: "assets/mesh.obj" }] } },
    { "assets/mesh.obj": source }
  );
  assert.equal(report.ok, false);
  assert.match(report.errors.join(" "), /non-finite coordinates/i);
});
