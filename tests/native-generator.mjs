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
const interviewProject = { kind: "game", name: "Psychological Mystery", initialPrompt: "A psychological horror game with disturbing mysteries" };
const interviewAnswers = {
  "native-core-loop": "Solve mysteries or puzzles",
  "native-perspective": "3D third-person",
  "native-visual-style": "Dark cinematic horror",
  "native-progression": "Story chapters and clues",
  "native-audio": "Creepy ambient soundscape"
};
const firstQuestion = await createNativeResult({ operation: "interview", message: interviewProject.initialPrompt, project: interviewProject, answers: {} });
assert.equal(firstQuestion.question.id, "native-core-loop");
assert.equal(firstQuestion.question.total, 5);
const secondQuestion = await createNativeResult({ operation: "interview", message: "Solve mysteries or puzzles", project: interviewProject, answers: { "native-core-loop": "Solve mysteries or puzzles" } });
assert.equal(secondQuestion.question.id, "native-perspective");
const completedInterview = await createNativeResult({ operation: "interview", message: "Creepy ambient soundscape", project: interviewProject, answers: interviewAnswers });
assert.equal(completedInterview.question, null);
assert.equal(completedInterview.plan.engine, "webgl3d");
assert.match(completedInterview.plan.summary, /psychological horror game/i);
assert.match(completedInterview.plan.summary, /Creepy ambient soundscape/i);
for (const engine of ["canvas2d", "webgl3d"]) {
  const audioBuild = await createNativeResult({
    operation: "build",
    message: "A game with original procedural ambient music and effects",
    project: { kind: "game", preferredEngine: engine, name: "Audio check", initialPrompt: "A game with original procedural ambient music and effects" }
  });
  const js = audioBuild.files.find(file => file.path === "game.js").content;
  assert.match(js, /function musicStart\(\)/);
  assert.match(js, /function musicStop\(\)/);
}
const research = await createNativeResult({ operation: "research", message: "webgl collision detection" });
assert.equal(research.research.externalAiUsed, false);
assert.equal(research.research.liveSearchAttempted, true);
assert.ok(research.research.searches.some(item => item.url.includes("github.com/search")));
console.log("native-generator: generated JS parses for 2D, 3D, and web-app targets; references are labeled honestly");
