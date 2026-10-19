import assert from "node:assert/strict";
import { Script } from "node:vm";
import { createNativeResult } from "../apps/web/lib/native-generator.mjs";

for (const [prompt, engine] of [
  ["A platformer with jumping and collectibles", "canvas2d"],
  ["A 3D low-poly exploration game", "webgl3d"],
  ["A task manager web app", "webapp"]
]) {
  const result = await createNativeResult({
    operation: "build",
    mode: "build",
    message: prompt,
    project: { kind: engine === "webapp" ? "app" : "game", preferredEngine: engine, name: "New project", initialPrompt: prompt }
  });
  assert.equal(result.nativeGeneration.externalAiUsed, false);
  assert.equal(result.files.length, 4);
  const files = Object.fromEntries(result.files.map(file => [file.path, file.content]));
  const spec = JSON.parse(files["game-spec.json"]);
  assert.equal(spec.engine, engine);
  assert.ok(files["game.html"].includes("game.js"));
  assert.ok(files["game.css"].length > 100);
  new Script(files["game.js"], { filename: prompt + ".js" });
  if (engine === "canvas2d") {
    assert.match(files["game.js"], /requestAnimationFrame/);
    assert.match(files["game.js"], /getContext\("2d"\)/);
    assert.match(files["game.js"], /addEventListener/);
  }
  if (engine === "webgl3d") {
    assert.match(files["game.js"], /getContext\("webgl"/);
    assert.match(files["game.js"], /drawArrays/);
    assert.match(files["game.js"], /pickups=\[\]/);
    assert.match(files["game.js"], /player\.z/);
    assert.match(files["game.js"], /function update\(dt\)/);
  }
  if (engine === "webapp") {
    assert.match(files["game.html"], /task-form/);
    assert.match(files["game.js"], /localStorage/);
  }
}
for (const engine of ["canvas2d", "webgl3d"]) {
  const expanded = await createNativeResult({
    operation: "buildPart",
    stagePath: "game.js",
    message: "FULL GAME EXPANSION PASS — add progression and a complete ending.",
    project: { kind: "game", preferredEngine: engine, name: "Expanded test", initialPrompt: "A game with collectibles and hazards", plan: { title: "Expanded test", engine }, files: {} }
  });
  const expandedJs = expanded.files.find(file => file.path === "game.js").content;
  new Script(expandedJs, { filename: engine + "-expanded.js" });
  assert.ok(expandedJs.includes('"STAGE "+stage+"/3"') || expandedJs.includes('"STAGE 1/3"'), "full-game mode should add staged progression");
  assert.equal(expanded.nativeGeneration.externalAiUsed, false);
}
const research = await createNativeResult({ operation: "research", message: "webgl collision detection" });
assert.equal(research.research.externalAiUsed, false);
assert.equal(research.research.liveSearchAttempted, true);
assert.ok(research.research.searches.some(item => item.url.includes("github.com/search")));
console.log("native-generator: generated JS parses for 2D, 3D, and web-app targets; references are labeled honestly");
