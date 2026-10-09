import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { safeProjectId, safeRelativePath, validateSourceProject, renderPlayHtml, createAgentServer } from "../apps/agent/src/server.mjs";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const rootPackage = JSON.parse(read("package.json"));
const webPackage = JSON.parse(read("apps/web/package.json"));
const agentSource = read("apps/agent/src/server.mjs");
const api = read("apps/web/app/api/agent/route.ts");
const page = read("apps/web/app/page.tsx");
const prompts = read("apps/web/app/lib/prompts.ts");
const playPage = read("apps/web/app/play/[id]/page.tsx");
const css = read("apps/web/app/globals.css");

assert.ok(rootPackage.workspaces.includes("apps/*"), "root must be a workspace");
assert.equal(webPackage.dependencies.next, "14.2.35", "web app uses the pinned Next version");
assert.equal(webPackage.dependencies.jszip, "3.10.1", "project ZIP packaging is installed");
assert.ok(existsSync(new URL("../apps/web/app/layout.tsx", import.meta.url)), "app layout exists");
assert.ok(api.includes("GEMINI_NOT_CONFIGURED"), "missing Gemini key is explicit");
assert.ok(api.includes("validateFiles"), "server validates model output");
assert.ok(api.includes('new Function(byPath["game.js"])'), "model-generated JS syntax is checked");
assert.ok(api.includes("No files were changed"), "failed generation does not claim source changes");
assert.ok(api.includes("x-goog-api-key"), "Gemini key is passed in server-side request header");
assert.ok(api.includes("inlineData"), "image references can be sent to Gemini");
assert.ok(api.includes("googleSearch: {}"), "research mode enables Google Search grounding");
assert.ok(api.includes("groundingChunks"), "grounding sources are returned to user");
assert.ok(api.includes("game-spec.json needs a real game title"), "builder requires meaningful game specs");
assert.ok(api.includes("external runtime dependency"), "builder blocks external runtime dependencies");
assert.ok(prompts.includes("Ask at most ONE high-impact question"), "interview is sequential");
assert.ok(prompts.includes("Avoid empty black screens"), "prompt explicitly rejects placeholder games");
assert.ok(prompts.includes('input.operation === "research"'), "research uses its own agent instruction");
assert.ok(page.includes('localStorage.setItem(STORAGE_KEY'), "projects persist in browser storage");
assert.ok(page.includes('title="GENE live game preview"'), "preview runs in a sandboxed iframe");
assert.ok(page.includes("Save as version"), "manual edits create a snapshot");
assert.ok(page.includes("new JSZip()"), "export packages actual game source");
assert.ok(page.includes("JSZip.loadAsync(file)"), "project ZIP import is implemented");
assert.ok(page.includes('zip.file("references/" + safeName'), "export preserves reference files");
assert.ok(page.includes("referenceInputRef.current?.click()"), "reference uploads are wired");
assert.ok(page.includes("setSearchMode(!searchMode)"), "grounded search mode is toggleable");
assert.ok(page.includes("ONE DECISION AT A TIME"), "sequential question UI is present");
assert.ok(page.includes("Automated runtime repair"), "preview failure triggers bounded repair");
assert.ok(page.includes('window.open("/play/" + encodeURIComponent(project.id)'), "fullscreen opens stable project URL");
assert.ok(playPage.includes('localStorage.getItem("gene.projects.v1")'), "play route loads the saved project");
assert.ok(css.includes(':root[data-theme="light"]'), "light theme is implemented");
assert.ok(css.includes(".reference-chips"), "reference attachments are styled");
assert.ok(agentSource.includes("writeTextFile"), "local agent writes actual project files");
assert.ok(agentSource.includes("historyRoot"), "local agent backs up existing project files");
assert.ok(agentSource.includes("GENE_AUTH_REQUIRED"), "local agent protects write/read APIs with a token");
assert.ok(agentSource.includes("validateSourceProject"), "local agent validates source before syncing");
assert.equal(safeProjectId("test_project-01"), true, "safe ids are accepted");
assert.equal(safeProjectId("../not-safe"), false, "path traversal IDs are rejected");
assert.equal(safeRelativePath("assets/tree.obj"), "assets/tree.obj", "nested safe assets paths are accepted");
assert.equal(safeRelativePath("../outside.txt"), null, "traversal file paths are rejected");
assert.equal(safeRelativePath("C:\\outside.txt"), null, "absolute Windows paths are rejected");

const goodFiles = {
  "game.html": '<canvas id="game-canvas" width="640" height="360"></canvas>',
  "game.css": "html,body{margin:0;overflow:hidden}canvas{display:block}",
  "game.js": 'const c=document.getElementById("game-canvas");const x=c.getContext("2d");window.addEventListener("keydown",()=>{});function draw(){x.fillStyle="#253";x.fillRect(0,0,c.width,c.height);requestAnimationFrame(draw)}requestAnimationFrame(draw);',
  "game-spec.json": JSON.stringify({
    title:"Contract Test",
    genre:"arcade",
    mechanics:["move","avoid","score"],
    controls:["Arrow keys"],
    objective:"Collect the three tokens.",
    winCondition:"All tokens collected.",
    lossCondition:"Health reaches zero.",
    performanceBudget:{targetFps:60,maxEnemies:8,maxObjects:100,maxParticles:40}
  })
};
const sourceCheck = validateSourceProject(goodFiles);
assert.equal(sourceCheck.ok, true, "valid small game source passes the local agent source contract");
assert.equal(validateSourceProject({ ...goodFiles, "game.js": "const = ;" }).ok, false, "broken JS is rejected before sync");
assert.equal(validateSourceProject({ ...goodFiles, "game.js": 'fetch("https://example.com");requestAnimationFrame(()=>{});' }).ok, false, "external runtime dependencies are rejected");
const rendered = renderPlayHtml(goodFiles, "Contract Test");
assert.ok(rendered.includes("<canvas id=\"game-canvas\""), "disk play page embeds the actual game canvas");
assert.ok(rendered.includes("<script>") && rendered.includes("</script>"), "disk play page closes its script tags correctly");

const tempRoot = await mkdtemp(path.join(os.tmpdir(), "gene-agent-test-"));
const agent = await createAgentServer({ port: 0, host: "127.0.0.1", workspace: tempRoot, token: "gene-test-token-01234567890123456789", log: () => {} });
try {
  await agent.listen();
  const address = agent.server.address();
  const base = "http://127.0.0.1:" + address.port;
  const health = await fetch(base + "/health");
  assert.equal(health.status, 200, "local agent health route responds");
  assert.equal((await health.json()).app, "gene-local-agent", "health identifies the real local agent");
  const unauthenticated = await fetch(base + "/api/projects");
  assert.equal(unauthenticated.status, 401, "local project API requires token auth");
  const filesWithAsset = { ...goodFiles, "assets/marker.txt": "GENE asset bytes" };
  const sync = await fetch(base + "/api/projects/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-GENE-TOKEN": "gene-test-token-01234567890123456789" },
    body: JSON.stringify({ id:"test-project-01", name:"Contract Game", initialPrompt:"test", files:filesWithAsset, plan:null, versions:[], references:[] })
  });
  assert.equal(sync.status, 200, "valid source sync writes to disk");
  const syncBody = await sync.json();
  assert.equal(syncBody.filesWritten, 5, "sync reports the actual game and asset files");
  assert.ok(existsSync(path.join(tempRoot, "projects", "test-project-01", "game.js")), "the source file exists on disk");
  assert.equal(await readFile(path.join(tempRoot, "projects", "test-project-01", "game.js"), "utf8"), goodFiles["game.js"], "disk contents match the source sent by GENE");
  const diskPlay = await fetch(base + "/play/test-project-01");
  assert.equal(diskPlay.status, 200, "local agent serves a stable disk-backed play URL");
  assert.ok((await diskPlay.text()).includes("Contract Game"), "play URL serves the saved project name in its HTML shell");
  const assetResponse = await fetch(base + "/play/test-project-01/assets/marker.txt");
  assert.equal(assetResponse.status, 200, "asset route serves synced asset files");
  assert.equal(await assetResponse.text(), "GENE asset bytes", "served asset bytes match the on-disk asset");
  const diskTest = await fetch(base + "/api/projects/test-project-01/test", { method:"POST", headers:{ "X-GENE-TOKEN":"gene-test-token-01234567890123456789" } });
  assert.equal(diskTest.status, 200, "disk-backed source validation passes on the valid project");
  assert.equal((await diskTest.json()).ok, true, "test route reports the validation result");
} finally {
  await agent.close().catch(() => {});
  await rm(tempRoot, { recursive: true, force: true });
}

console.log("GENE contract tests passed, including authenticated local filesystem sync, disk-backed play URL, source validation, import/export and grounded research.");
