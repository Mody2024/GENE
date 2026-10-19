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
  "native-menu": "Diegetic case file / journal",
  "native-progression": "Story chapters and clues",
  "native-audio": "Creepy ambient soundscape"
};
const firstQuestion = await createNativeResult({ operation: "interview", message: interviewProject.initialPrompt, project: interviewProject, answers: {} });
assert.equal(firstQuestion.question.id, "native-core-loop");
assert.equal(firstQuestion.question.total, 6);
const secondQuestion = await createNativeResult({ operation: "interview", message: "Solve mysteries or puzzles", project: interviewProject, answers: { "native-core-loop": "Solve mysteries or puzzles" } });
assert.equal(secondQuestion.question.id, "native-perspective");
const completedInterview = await createNativeResult({ operation: "interview", message: "Creepy ambient soundscape", project: interviewProject, answers: interviewAnswers });
assert.equal(completedInterview.question, null);
assert.match(completedInterview.plan.design.menuDirection, /case file/i);
assert.equal(completedInterview.plan.design.soundtrack.mood, "uneasy");
assert.equal(completedInterview.plan.stages.length, 4);
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
const horrorBuild = await createNativeResult({
  operation: "build",
  message: "A psychological horror game with a case file menu and creepy ambient soundtrack",
  project: { kind: "game", preferredEngine: "canvas2d", name: "Case File", initialPrompt: "A psychological horror game with a case file menu and creepy ambient soundtrack" }
});
const racingBuild = await createNativeResult({
  operation: "build",
  message: "A high-speed racing game with a racing garage and energetic soundtrack",
  project: { kind: "game", preferredEngine: "canvas2d", name: "Velocity", initialPrompt: "A high-speed racing game with a racing garage and energetic soundtrack" }
});
const horrorFiles = Object.fromEntries(horrorBuild.files.map(file => [file.path, file.content]));
const racingFiles = Object.fromEntries(racingBuild.files.map(file => [file.path, file.content]));
assert.notEqual(horrorBuild.plan.design.visualIdentity, racingBuild.plan.design.visualIdentity);
assert.notEqual(horrorBuild.plan.design.soundtrack.mood, racingBuild.plan.design.soundtrack.mood);
assert.equal(JSON.parse(horrorFiles["game-spec.json"]).designProfile.id, "cinematic");
assert.equal(JSON.parse(racingFiles["game-spec.json"]).designProfile.id, "velocity");
assert.equal(JSON.parse(horrorFiles["game-spec.json"]).audio.mood, "uneasy");
assert.ok(JSON.parse(racingFiles["game-spec.json"]).implementationPlan.testMatrix.length >= 3);
assert.notEqual(horrorFiles["game.css"], racingFiles["game.css"]);
assert.match(horrorFiles["game.html"], /Something is waiting|CASE FILE/);
assert.match(horrorFiles["game.html"], /menu-case/);
assert.match(racingFiles["game.html"], /menu-arcade/);
assert.match(horrorFiles["game.css"], /\.menu-case/);
assert.match(racingFiles["game.css"], /\.menu-arcade/);
assert.match(horrorFiles["game.js"], /FIELD NOTES|ctx\.fillStyle/);
assert.doesNotMatch(horrorFiles["game.js"], /\\$\\{profile\\.(panel|accent|glow)\\}/, "generated 2D backgrounds must resolve all palette placeholders");
assert.match(racingFiles["game.html"], /Ready to run|GARAGE/);
assert.match(horrorFiles["game.js"], /55,58\.27,82\.41|55/);
const racing3d = await createNativeResult({
  operation: "build",
  message: "A 3D racing game with a garage, car model and speed challenges",
  project: { kind: "game", preferredEngine: "webgl3d", name: "3D Velocity", initialPrompt: "A 3D racing game with a garage, car model and speed challenges" }
});
const cosmic3d = await createNativeResult({
  operation: "build",
  message: "A 3D space exploration game with a spaceship and cosmic shards",
  project: { kind: "game", preferredEngine: "webgl3d", name: "Starbound", initialPrompt: "A 3D space exploration game with a spaceship and cosmic shards" }
});
const racing3dJs = racing3d.files.find(file => file.path === "game.js").content;
const cosmic3dJs = cosmic3d.files.find(file => file.path === "game.js").content;
assert.match(racing3dJs, /player\.x-\.48/);
assert.match(cosmic3dJs, /player\.x-\.58/);
assert.notEqual(racing3dJs, cosmic3dJs);
const research = await createNativeResult({ operation: "research", message: "webgl collision detection" });
assert.equal(research.research.externalAiUsed, false);
assert.equal(research.research.liveSearchAttempted, true);
assert.ok(research.research.searches.some(item => item.url.includes("github.com/search")));
console.log("native-generator: generated JS parses for 2D, 3D, and web-app targets; references are labeled honestly");
