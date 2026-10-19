import assert from "node:assert/strict";

const base = (process.env.GENE_TEST_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const response = await fetch(base + "/api/agent", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    operation: "build",
    mode: "build",
    thinking: "native",
    message: "A 2D platformer with jumping, collectibles and hazards",
    project: {
      id: "native-api-smoke",
      name: "Native API Smoke",
      kind: "game",
      preferredEngine: "canvas2d",
      initialPrompt: "A 2D platformer with jumping, collectibles and hazards",
      files: {},
      references: [],
      answers: {}
    },
    history: []
  })
});
const payload = await response.json();
assert.equal(response.status, 200, JSON.stringify(payload.error || payload).slice(0, 800));
assert.equal(payload.ok, true);
assert.equal(payload.aiMode, "native", "native mode must select the provider-free route");
assert.equal(payload.model, "Gene Native (deterministic)");
assert.equal(payload.result.nativeGeneration.externalAiUsed, false);
assert.equal(payload.result.files.length, 4);
assert.ok(payload.result.files.some(file => file.path === "game.js"));
console.log("native-api: /api/agent generated a project in explicit native mode without invoking provider routing");
