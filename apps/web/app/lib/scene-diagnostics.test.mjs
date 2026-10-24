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
  const source = "v 0 0 0\nv 1 0 0\nv 0 1 0\nvt 0 0\nvt 1 0\nvt 0 1\nf 1/1 2/2 3/3\nf -3 -2 -1\n";
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

test("rejects scenes that exceed the runtime object limit instead of silently truncating them", () => {
  const objects = Array.from({ length: 501 }, (_, index) => ({ id: "object-" + index, type: "box" }));
  const report = inspectSceneManifest({ engine: "webgl3d", scene: { objects } });
  assert.equal(report.ok, false);
  assert.match(report.errors.join(" "), /runtime limit is 500/i);
});

test("accepts standard OBJ vertex weights and common vertex-color extensions", () => {
  const source = "v 0 0 0 1\nv 1 0 0 1 1 0 0\nv 0 1 0\nf 1 2 3\n";
  const report = inspectSceneManifest(
    { engine: "webgl3d", scene: { objects: [{ id: "mesh", type: "mesh", modelPath: "assets/mesh.obj" }] } },
    { "assets/mesh.obj": source }
  );
  assert.equal(report.ok, true);
});

test("rejects OBJ vertex records with trailing non-numeric garbage", () => {
  const source = "v 0 0 0\nv 1 0 0 unexpected\nv 0 1 0\nf 1 2 3\n";
  const report = inspectSceneManifest(
    { engine: "webgl3d", scene: { objects: [{ id: "mesh", type: "mesh", modelPath: "assets/mesh.obj" }] } },
    { "assets/mesh.obj": source }
  );
  assert.equal(report.ok, false);
  assert.match(report.errors.join(" "), /malformed vertex record/i);
});

test("rejects WebGL3D scenes when a required OBJ asset is missing from the build package", () => {
  const report = inspectSceneManifest({
    engine: "webgl3d",
    scene: { objects: [{ id: "player", type: "mesh", modelPath: "assets/player.obj" }] }
  }, {});
  assert.equal(report.ok, false);
  assert.equal(report.missingModelAssets.length, 1);
  assert.match(report.errors.join(" "), /required OBJ asset is missing from the build package/i);
});

test("rejects OBJ face references to missing texture coordinates or normals", () => {
  const source = "v 0 0 0\nv 1 0 0\nv 0 1 0\nvt 0 0\nvn 0 0 1\nf 1/2/1 2/1/1 3/1/1\n";
  const report = inspectSceneManifest(
    { engine: "webgl3d", scene: { objects: [{ id: "mesh", type: "mesh", modelPath: "assets/mesh.obj" }] } },
    { "assets/mesh.obj": source }
  );
  assert.equal(report.ok, false);
  assert.match(report.errors.join(" "), /invalid vertex indices/i);
});

test("accepts valid OBJ vertex, texture and normal indices", () => {
  const source = "v 0 0 0\nv 1 0 0\nv 0 1 0\nvt 0 0\nvt 1 0\nvt 0 1\nvn 0 0 1\nf 1/1/1 2/2/1 3/3/1\n";
  const report = inspectSceneManifest(
    { engine: "webgl3d", scene: { objects: [{ id: "mesh", type: "mesh", modelPath: "assets/mesh.obj" }] } },
    { "assets/mesh.obj": source }
  );
  assert.equal(report.ok, true);
});

test("rejects non-finite texture coordinates and malformed normal records", () => {
  const textureReport = inspectSceneManifest(
    { engine: "webgl3d", scene: { objects: [{ id: "mesh", type: "mesh", modelPath: "assets/mesh.obj" }] } },
    { "assets/mesh.obj": "v 0 0 0\nv 1 0 0\nv 0 1 0\nvt NaN 0\nf 1 2 3\n" }
  );
  const normalReport = inspectSceneManifest(
    { engine: "webgl3d", scene: { objects: [{ id: "mesh", type: "mesh", modelPath: "assets/mesh.obj" }] } },
    { "assets/mesh.obj": "v 0 0 0\nv 1 0 0\nv 0 1 0\nvn 0 0\nf 1 2 3\n" }
  );
  assert.equal(textureReport.ok, false);
  assert.equal(normalReport.ok, false);
  assert.match(textureReport.errors.join(" "), /malformed.*texture-coordinate\/normal/i);
  assert.match(normalReport.errors.join(" "), /malformed.*texture-coordinate\/normal/i);
});

test("rejects OBJ texture references that use index zero", () => {
  const report = inspectSceneManifest(
    { engine: "webgl3d", scene: { objects: [{ id: "mesh", type: "mesh", modelPath: "assets/mesh.obj" }] } },
    { "assets/mesh.obj": "v 0 0 0\nv 1 0 0\nv 0 1 0\nvt 0 0\nf 1/0 2/1 3/1\n" }
  );
  assert.equal(report.ok, false);
  assert.match(report.errors.join(" "), /invalid vertex indices/i);
});

test("rejects OBJ material libraries that are missing or use unsafe paths", () => {
  const manifest = { engine: "webgl3d", scene: { objects: [{ id: "mesh", type: "mesh", modelPath: "assets/mesh.obj" }] } };
  const missing = inspectSceneManifest(manifest, {
    "assets/mesh.obj": "v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\nmtllib mesh.mtl\n"
  });
  const unsafe = inspectSceneManifest(manifest, {
    "assets/mesh.obj": "v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\nmtllib ../outside.mtl\n"
  });
  assert.equal(missing.ok, false);
  assert.match(missing.errors.join(" "), /references missing material file/i);
  assert.equal(unsafe.ok, false);
  assert.match(unsafe.errors.join(" "), /unsafe or unsupported material filename/i);
});

test("accepts an OBJ material library that exists beside the model", () => {
  const report = inspectSceneManifest(
    { engine: "webgl3d", scene: { objects: [{ id: "mesh", type: "mesh", modelPath: "assets/models/mesh.obj" }] } },
    {
      "assets/models/mesh.obj": "v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\nmtllib mesh.mtl\n",
      "assets/models/mesh.mtl": "newmtl default\nKd 0.8 0.8 0.8\n"
    }
  );
  assert.equal(report.ok, true);
});

test("rejects material files that reference missing textures", () => {
  const report = inspectSceneManifest(
    { engine: "webgl3d", scene: { objects: [{ id: "mesh", type: "mesh", modelPath: "assets/mesh.obj" }] } },
    {
      "assets/mesh.obj": "v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\nmtllib mesh.mtl\n",
      "assets/mesh.mtl": "newmtl surface\nmap_Kd missing-texture.png\n"
    }
  );
  assert.equal(report.ok, false);
  assert.match(report.errors.join(" "), /material file references missing texture/i);
});

test("accepts material files with packaged textures and rejects unsafe texture paths", () => {
  const manifest = { engine: "webgl3d", scene: { objects: [{ id: "mesh", type: "mesh", modelPath: "assets/mesh.obj" }] } };
  const valid = inspectSceneManifest(manifest, {
    "assets/mesh.obj": "v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\nmtllib mesh.mtl\n",
    "assets/mesh.mtl": "newmtl surface\nmap_Kd diffuse.png\n",
    "assets/diffuse.png": "test-image-payload"
  });
  const unsafe = inspectSceneManifest(manifest, {
    "assets/mesh.obj": "v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\nmtllib mesh.mtl\n",
    "assets/mesh.mtl": "newmtl surface\nmap_Kd ../diffuse.png\n"
  });
  assert.equal(valid.ok, true);
  assert.equal(unsafe.ok, false);
  assert.match(unsafe.errors.join(" "), /unsafe or unsupported texture path/i);
});

test("3D build gate rejects a manifest without renderer integration", async () => {
  const { readFile } = await import("node:fs/promises");
  const { fileURLToPath } = await import("node:url");
  const pagePath = fileURLToPath(new URL("../page.tsx", import.meta.url));
  const page = await readFile(pagePath, "utf8");
  assert.match(page, /add\("Scene renderer integration", sceneDrawn \? "warn" : "fail"/);
  assert.match(page, /Build rejected: the manifest alone cannot draw geometry/);
});

test("2D and imported-mesh scene builds fail when packaged code lacks renderer hooks", async () => {
  const { readFile } = await import("node:fs/promises");
  const { fileURLToPath } = await import("node:url");
  const pagePath = fileURLToPath(new URL("../page.tsx", import.meta.url));
  const page = await readFile(pagePath, "utf8");
  assert.match(page, /add\("Scene renderer integration", meshConnected \? "warn" : "fail"/);
  assert.match(page, /Build rejected: the editor manifest alone does not draw them/);
  assert.match(page, /add\("Scene renderer integration", sceneDrawn \? "warn" : "fail"/);
  assert.match(page, /Build rejected: the manifest alone does not draw them/);
});
