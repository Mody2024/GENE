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
  assert.ok(result.files.length >= 4, "native builds may create additional task-specific source modules");
  const files = Object.fromEntries(result.files.map(file => [file.path, file.content]));
  const spec = JSON.parse(files["game-spec.json"]);
  assert.equal(spec.engine, engine);
  for (const path of spec.additionalFiles || []) {
    assert.ok(files[path], "declared source module must exist: " + path);
    assert.ok(files["game.html"].includes('src="' + path + '"'), "HTML must load the declared module: " + path);
  }
  assert.ok(files["game.html"].includes("game.js"));
  assert.ok(files["game.css"].length > 100);
  new Script(files["game.js"], { filename: prompt + ".js" });
  for (const file of result.files.filter(file => /\\.(?:m?js|cjs)$/i.test(file.path))) new Script(file.content, { filename: file.path });
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
const preservedBrief = "A 2D detective game set in an abandoned Egyptian cinema. Search rooms for film reels, connect clues on a case board, avoid a shadow that reacts to sound, and reveal who changed the final reel. Use hand-drawn monochrome art and a tense ambient soundtrack.";
const preservedBuild = await createNativeResult({
  operation: "build",
  message: "Continue",
  project: { kind: "game", preferredEngine: "canvas2d", name: "The Last Reel", initialPrompt: preservedBrief, plan: { title: "The Last Reel", engine: "canvas2d", summary: "A detective investigation inside an abandoned cinema.", genre: "mystery", mechanics: ["Search rooms", "Connect clues", "Avoid sound-reactive shadow", "Reveal final reel"] } }
});
const preservedSpec = JSON.parse(preservedBuild.files.find(file => file.path === "game-spec.json").content);
assert.match(preservedBuild.plan.summary, /abandoned Egyptian cinema/i, "generic stage commands must not overwrite the original game brief");
assert.match(preservedSpec.summary, /abandoned Egyptian cinema/i, "generated game spec must retain the exact original setting");
assert.match(preservedSpec.summary, /sound-reactive shadow/i, "generated game spec must preserve named mechanics from the brief");
const interviewAnswers = {
  "native-core-loop": "Solve mysteries or puzzles",
  "native-perspective": "3D third-person",
  "native-visual-style": "Dark cinematic horror",
  "native-menu": "Diegetic case file / journal",
  "native-progression": "Story chapters and clues",
  "native-audio": "Creepy ambient soundscape"
};
const firstQuestion = await createNativeResult({ operation: "interview", message: "A game", project: { ...interviewProject, initialPrompt: "A game" }, answers: {} });
assert.equal(firstQuestion.question.id, "native-core-loop");
assert.equal(firstQuestion.question.total, 1);
const specificBrief = await createNativeResult({ operation: "interview", message: interviewProject.initialPrompt, project: interviewProject, answers: {} });
assert.equal(specificBrief.question, null, "a detailed brief should not trigger unrelated interview questions");
const secondQuestion = await createNativeResult({ operation: "interview", message: "Solve mysteries or puzzles", project: interviewProject, answers: { "native-core-loop": "Solve mysteries or puzzles" } });
assert.equal(secondQuestion.question, null, "answered or inferable decisions should not be asked again");
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
const progressionPart = await createNativeResult({
  operation: "buildPart",
  stagePath: "src/systems/progression.js",
  message: "Complete a robust 2D game progression system with stage unlocks and local saves",
  project: { kind: "game", preferredEngine: "canvas2d", name: "Progression Recovery", initialPrompt: "A 2D platformer with three stages, collectibles and checkpoints" }
});
assert.equal(progressionPart.files.length, 1, "buildPart must return exactly one requested file");
assert.equal(progressionPart.files[0].path, "src/systems/progression.js", "buildPart must preserve the requested path exactly");
assert.match(progressionPart.files[0].content, /completeStage/);
assert.match(progressionPart.files[0].content, /localStorage/);
new Script(progressionPart.files[0].content, { filename: "src/systems/progression.js" });
const research = await createNativeResult({ operation: "research", message: "webgl collision detection" });
assert.equal(research.research.externalAiUsed, false);
assert.equal(research.research.liveSearchAttempted, true);
assert.ok(research.research.searches.some(item => item.url.includes("github.com/search")));

for (const [prompt, expectedProfile, expectedMenu] of [
  ["A deep sea submarine expedition under the ocean", "abyss", "menu-dive"],
  ["A wild west bounty hunting game", "western", "menu-wanted"],
  ["A rhythm game that syncs to drums and melody", "rhythm", "menu-rhythm"],
  ["A comic book adventure with cel shaded panels", "comic", "menu-comic"],
  ["An exploration game inside an ancient museum archive", "museum", "menu-archive"],
  ["A shortwave radio transmission mystery", "radio", "menu-radio"],
  ["A cooking restaurant time management game", "kitchen", "menu-kitchen"]
]) {
  const result = await createNativeResult({
    operation: "build",
    message: prompt,
    project: { kind: "game", preferredEngine: "canvas2d", name: "Creative variation", initialPrompt: prompt }
  });
  const generated = Object.fromEntries(result.files.map(file => [file.path, file.content]));
  const spec = JSON.parse(generated["game-spec.json"]);
  assert.equal(spec.designProfile.id, expectedProfile, "concept should select its own creative profile: " + prompt);
  assert.ok(spec.designProfile.creativeSignature, "design signature must be saved for comparison");
  assert.ok(spec.designProfile.menuLayout, "menu layout metaphor must be recorded");
  assert.ok(generated["game.html"].includes(expectedMenu), "menu composition must change for " + expectedProfile);
  assert.ok(generated["game.css"].length > 100);
  new Script(generated["game.js"], { filename: expectedProfile + ".js" });
}

console.log("native-generator: generated JS parses for 2D, 3D, and web-app targets; references are labeled honestly");
