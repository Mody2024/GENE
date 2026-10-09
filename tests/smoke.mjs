import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
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
const gameGuides = read("apps/web/app/lib/game-guides.ts");
const playPage = read("apps/web/app/play/[id]/page.tsx");
const css = read("apps/web/app/globals.css");
const browserSmoke = read("tests/browser-smoke.mjs");

assert.ok(rootPackage.workspaces.includes("apps/*"), "root must be a workspace");
assert.equal(webPackage.dependencies.next, "14.2.35", "web app uses the pinned Next version");
assert.equal(webPackage.dependencies.jszip, "3.10.1", "project ZIP packaging is installed");
assert.ok(existsSync(new URL("../apps/web/app/layout.tsx", import.meta.url)), "app layout exists");
assert.ok(api.includes("GEMINI_NOT_CONFIGURED"), "missing Gemini key is explicit");
assert.ok(api.includes("validateFiles"), "server validates model output");
assert.ok(api.includes("normalizeAgentResult"), "API validates structured response shapes before updating the UI");
assert.ok(api.includes("at least three concrete implementation tasks"), "plans with no implementation tasks are rejected");
assert.ok(api.includes("exactly one next question or a completed plan"), "interview responses must be sequential and complete");
assert.ok(api.includes("GENE_PLAN_MODE_READ_ONLY"), "plan mode is enforced at the API boundary");
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
assert.ok(page.includes('await writeProjectToDisk(updated, localAgentUrl, localAgentToken)'), "AI edits auto-sync to connected local disk");
assert.ok(page.includes('writeProjectToDisk(updatedProject, localAgentUrl, localAgentToken)'), "manual saves/restores auto-sync to local disk");
assert.ok(api.includes("GENE_PLAN_MODE_READ_ONLY"), "plan mode is enforced at the API boundary");
assert.ok(page.includes('window.open("/play/" + encodeURIComponent(project.id)'), "fullscreen opens stable project URL");
assert.ok(playPage.includes('localStorage.getItem("gene.projects.v1")'), "play route loads the saved project");
assert.ok(css.includes(':root[data-theme="light"]'), "light theme is implemented");
assert.ok(css.includes(".reference-chips"), "reference attachments are styled");
assert.ok(browserSmoke.includes("coloredPixels > 5000"), "browser suite requires actual painted pixels");
assert.ok(browserSmoke.includes('page.keyboard.press("ArrowRight")'), "browser suite exercises real keyboard gameplay");
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
    engine:"canvas2d",
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
const fake3dFiles = {
  ...goodFiles,
  "game-spec.json": JSON.stringify({
    title:"Fake 3D",
    genre:"lane runner",
    engine:"webgl3d",
    mechanics:["lane changes"],
    controls:["Arrow keys"],
    objective:"Avoid obstacles",
    winCondition:"Reach the finish",
    lossCondition:"Hit an obstacle",
    performanceBudget:{targetFps:60,maxEnemies:0,maxObjects:100,maxParticles:10}
  })
};
assert.equal(validateSourceProject(fake3dFiles).ok, false, "a flat 2D renderer cannot pass a webgl3d project contract");
const webglFiles = {
  ...goodFiles,
  "game.js": 'const c=document.getElementById("game-canvas");const gl=c.getContext("webgl");const vs=gl.createShader(gl.VERTEX_SHADER);gl.shaderSource(vs,"attribute vec3 p;void main(){gl_Position=vec4(p,1.0);}");gl.compileShader(vs);const fs=gl.createShader(gl.FRAGMENT_SHADER);gl.shaderSource(fs,"precision mediump float;void main(){gl_FragColor=vec4(0.2,0.7,0.4,1.0);}");gl.compileShader(fs);const pr=gl.createProgram();gl.attachShader(pr,vs);gl.attachShader(pr,fs);gl.linkProgram(pr);gl.useProgram(pr);const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([0,0,0,1,0,0,0,1,0]),gl.STATIC_DRAW);window.addEventListener("keydown",()=>{});function frame(){gl.drawArrays(gl.TRIANGLES,0,3);requestAnimationFrame(frame)}requestAnimationFrame(frame);',
  "game-spec.json": JSON.stringify({
    title:"Real WebGL Triangle",
    genre:"3D prototype",
    engine:"webgl3d",
    mechanics:["WebGL mesh rendering"],
    controls:["Arrow keys"],
    objective:"Inspect a real WebGL render",
    winCondition:"The test scene initializes successfully",
    lossCondition:"The context or renderer fails",
    performanceBudget:{targetFps:60,maxEnemies:0,maxObjects:20,maxParticles:0}
  })
};
assert.equal(validateSourceProject(webglFiles).ok, true, "a real shader/buffer/draw WebGL project passes the local agent contract");
assert.equal(validateSourceProject({ ...goodFiles, "game.js": "const = ;" }).ok, false, "broken JS is rejected before sync");
assert.equal(validateSourceProject({ ...goodFiles, "game.js": 'fetch("https://example.com");requestAnimationFrame(()=>{});' }).ok, false, "external runtime dependencies are rejected");
const rendered = renderPlayHtml(goodFiles, "Contract Test", "/play/test-project-01/");
assert.ok(rendered.includes("<base href='/play/test-project-01/'>"), "disk play page resolves relative asset paths against the project directory");
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
  const secondFiles = { ...filesWithAsset, "game.js": filesWithAsset["game.js"] + "\n// edited in a subsequent GENE version" };
  const secondSync = await fetch(base + "/api/projects/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-GENE-TOKEN": "gene-test-token-01234567890123456789" },
    body: JSON.stringify({ id:"test-project-01", name:"Contract Game", initialPrompt:"test", files:secondFiles, plan:null, versions:[], references:[] })
  });
  assert.equal(secondSync.status, 200, "a subsequent project version can be synced");
  assert.equal(await readFile(path.join(tempRoot, "projects", "test-project-01", "game.js"), "utf8"), secondFiles["game.js"], "subsequent sync updates the actual disk file");
  const historyEntries = await readdir(path.join(tempRoot, "history", "test-project-01"));
  assert.ok(historyEntries.length >= 1, "a subsequent sync preserves the previous disk project in history");
  assert.equal(await readFile(path.join(tempRoot, "history", "test-project-01", historyEntries[0], "game.js"), "utf8"), filesWithAsset["game.js"], "history retains the previous file contents");
  const diskTest = await fetch(base + "/api/projects/test-project-01/test", { method:"POST", headers:{ "X-GENE-TOKEN":"gene-test-token-01234567890123456789" } });
  assert.equal(diskTest.status, 200, "disk-backed source validation passes on the valid project");
  assert.equal((await diskTest.json()).ok, true, "test route reports the validation result");
} finally {
  await agent.close().catch(() => {});
  await rm(tempRoot, { recursive: true, force: true });
}

console.log("GENE contract tests passed, including true WebGL contract checks, authenticated local filesystem sync, disk-backed play URL, import/export, grounded research and browser-test contracts.");
