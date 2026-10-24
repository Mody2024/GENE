import test from "node:test";
import assert from "node:assert/strict";
import { buildGameplayDirector, formatGameplayDirectorContract } from "./gameplay-director.mjs";

test("puzzle games select the puzzle profile instead of the broader exploration profile", () => {
  assert.equal(buildGameplayDirector({ intent: "A logic puzzle with clues and switches" }).profile, "puzzle-strategy");
});

test("exploration games still select the exploration profile", () => {
  assert.equal(buildGameplayDirector({ intent: "Explore an open world dungeon and complete quests" }).profile, "exploration-adventure");
});

test("platformer contract includes fair jump guidance and a reachable objective gate", () => {
  const contract = buildGameplayDirector({ intent: "precision platformer with jumping" });
  assert.equal(contract.profile, "precision-platformer");
  assert.ok(contract.fairness.some(item => /jump impulse|jump buffering/i.test(item)));
  assert.ok(contract.acceptance.some(item => /critical route\/objective is reachable/i.test(item)));
});

test("mobile intent selects touch-friendly platform guidance", () => {
  const contract = buildGameplayDirector({ intent: "casual puzzle", platform: "Android mobile" });
  assert.ok(contract.platformGuidance.some(item => /touch controls/i.test(item)));
});

test("formatted contract does not claim that suggestions are playtest evidence", () => {
  const text = formatGameplayDirectorContract("racing runner", "canvas2d", "desktop");
  assert.match(text, /not a claim that the game has been tested/i);
  assert.match(text, /Acceptance checklist/);
});

test("puzzle intent wins over exploration wording in mixed-genre prompts", () => {
  assert.equal(buildGameplayDirector({ intent: "A puzzle adventure inside a dungeon" }).profile, "puzzle-strategy");
});

test("engine aliases normalize to the 3D guidance contract", () => {
  const contract = buildGameplayDirector({ intent: "exploration game", engine: "three.js webgl 3D" });
  assert.equal(contract.engine, "webgl3d");
  assert.ok(contract.engineGuidance.some(item => /world-unit convention/i.test(item)));
});
