import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createExperienceStore, createNativeBrief } from "../packages/native-brain/src/index.mjs";

const root = await mkdtemp(path.join(os.tmpdir(), "gene-native-brain-"));
try {
  const store = createExperienceStore({ root });
  const unverified = await store.add({
    task: "jump bug", engine: "canvas2d", summary: "Attempted a fix but did not test it.",
    tests: [{ name: "jump", passed: false }], verified: true
  });
  assert.equal(unverified.verified, false, "failed tests must never become verified memory");
  await store.add({
    task: "platformer jump", engine: "canvas2d", summary: "Fixed jump state reset on landing.",
    tags: ["platformer", "collision"], tests: [{ name: "jump", passed: true }], verified: true
  });
  assert.equal((await store.list({ verifiedOnly: true })).length, 1);
  assert.equal((await store.retrieve("platformer jump collision")).length, 1);

  const brief = createNativeBrief({ prompt: "Make a third-person 3D mystery game with quests and save checkpoints." });
  assert.equal(brief.engine, "webgl3d");
  assert.equal(brief.externalAiUsed, false);
  assert.equal(brief.modelUsed, false);
  assert.ok(brief.systems.includes("objectives and story progression"));
  assert.throws(() => createNativeBrief({ prompt: "" }), /non-empty/);
  assert.throws(() => createNativeBrief({ prompt: "test", engine: "unknown" }), /Unsupported engine/);
  console.log("native-brain: all contract tests passed");
} finally {
  await rm(root, { recursive: true, force: true });
}
