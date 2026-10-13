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
const publishApi = read("apps/web/app/api/publish/route.ts");
const buildApi = read("apps/web/app/api/builds/route.ts");
const buildStatusApi = read("apps/web/app/api/builds/[buildId]/route.ts");
const buildWorkflow = read(".github/workflows/cloud-build.yml");
const buildHelper = read("scripts/cloud-build.mjs");
const buildUpload = read("scripts/upload-cloud-output.mjs");
const page = read("apps/web/app/page.tsx");
const prompts = read("apps/web/app/lib/prompts.ts");
const forge = read("apps/web/app/api/forge/route.ts");
const runtimeAssets = read("apps/web/app/lib/runtime-assets.ts");
const gameGuides = read("apps/web/app/lib/game-guides.ts");
const playPage = read("apps/web/app/play/[id]/page.tsx");
const css = read("apps/web/app/globals.css");
const browserSmoke = read("tests/browser-smoke.mjs");

assert.ok(rootPackage.workspaces.includes("apps/*"), "root must be a workspace");
assert.equal(webPackage.dependencies.next, "14.2.35", "web app uses the pinned Next version");
assert.equal(webPackage.dependencies.jszip, "3.10.1", "project ZIP packaging is installed");
assert.ok(existsSync(new URL("../apps/web/app/layout.tsx", import.meta.url)), "app layout exists");
assert.ok(api.includes("GEMINI_NOT_CONFIGURED"), "missing Gemini key is explicit");
assert.ok(api.includes("GEMINI_API_KEY_2") && api.includes("GEMINI_API_KEY_3"), "Gemini failover supports multiple independently configured keys");
assert.ok(api.includes("gemini-3.6-flash") && api.includes("gemini-3.5-flash-lite"), "Gemini failover includes supported stable fallback models");
assert.ok(api.includes("GEMINI_QUOTA_EXHAUSTED") && api.includes("GEMINI_CAPACITY_BUSY"), "quota and overload errors are reported distinctly");
assert.ok(api.includes("successfulModel = attempt.model"), "successful fallback model is tracked per request");
assert.ok(api.includes("totalBudgetMs = 52_000"), "Gemini retries stay inside the serverless runtime budget");
assert.ok(api.includes("signal: AbortSignal.timeout(Math.min(attempt.fallback ? 18_000 : 22_000"), "Gemini requests allow realistic generation time without exceeding route budget");
assert.ok(api.includes("GEMINI_TIMEOUT"), "Gemini timeout errors are explicit and actionable");
assert.ok(!api.includes('"gemini-3.7-flash"'), "fallbacks avoid deprecated aliases that route back to the slow primary model");
assert.ok(api.includes('"gemini-3.5-flash-lite"'), "timeouts can fall back to the documented low-latency Flash-Lite model");
assert.ok(api.includes("attempts < 8"), "fallback attempts remain bounded");
const health = read("apps/web/app/api/health/route.ts");
assert.ok(health.includes('export const dynamic = "force-dynamic"'), "Gemini health reads deployment env at request time instead of build time");
assert.ok(health.includes('"Cache-Control": "no-store, max-age=0, must-revalidate"'), "Gemini health response cannot be cached stale");
assert.ok(api.includes("validateFiles"), "server validates model output");
assert.ok(api.includes("ensureProjectSpecTitle"), "missing spec titles are repaired before build and edit validation");
assert.ok(api.includes("body.project?.plan?.title") && api.includes("body.project?.initialPrompt"), "title repair uses the existing plan, project name, or original prompt");
assert.ok(api.includes("const mergedFiles = ensureProjectSpecTitle"), "chat edits normalize legacy specs before validating the merged project");

assert.ok(api.includes("normalizeAgentResult"), "API validates structured response shapes before updating the UI");
assert.ok(api.includes("GEMINI_OUTPUT_TRUNCATED"), "truncated Gemini JSON gets a specific recoverable error");
assert.ok(api.includes('"buildPart"') && api.includes('"validateBuild"'), "API supports single-file build stages and offline final assembly validation");
assert.ok(api.includes("GENE_STAGED_BUILD_VALIDATION_FAILED"), "assembled staged projects receive explicit final validation errors");
assert.ok(page.includes("let stagePaths = recovery") && page.includes(': ["game-spec.json", "game.html", "game.css", "game.js"]'), "builds begin with four boot stages and can expand into dependency-aware project-specific files");
assert.ok(page.includes('operation: "buildPart"') && page.includes('operation: "validateBuild"'), "client orchestrates file stages and validates the assembled project before saving");
assert.ok(page.includes("stageAttempt <= 3") && page.includes("RETRY ") && page.includes("LAST-RESORT SAFE SLICE"), "failed file stages retry twice plus a compact last-resort playable slice");
assert.ok(page.includes("GENE_BUILD_STAGE_FAILED"), "failed stages produce a clear error without committing partial project files");
assert.ok(page.includes("TARGETED FINAL-VALIDATION REPAIR") && page.includes("validationAttempt < 3"), "final structural validation failures trigger bounded targeted file repairs before rejecting a build");
assert.ok(prompts.includes("STAGED BUILD MODE: Return exactly ONE requested file"), "model receives a strict one-file staged-generation contract");
assert.ok(prompts.includes("GENE 1.6") && prompts.includes("GENE 1.6 MODE CONTRACT") && prompts.includes("EXTENDED PLAN FORMAT") && prompts.includes("PROMPT ENHANCER MODE"), "GENE 1.6 supports mode-specific orchestration, detailed plans, and read-only prompt enhancement");
assert.ok(api.includes("GENE_THINKING_MODEL") && api.includes("GENE_BALANCED_MODEL") && api.includes("requestedThinking"), "Flash, Balanced, and Thinking route through mode-specific configured Gemini models");
assert.ok(page.includes("thinking: nextProject.thinking") && !page.includes("model: aiModel,\n        thinking: nextProject.thinking"), "normal agent requests allow server-side model routing for the selected GENE mode");
assert.ok(page.includes("GENE 1.6 Flash") && page.includes("GENE 1.6 Balanced") && page.includes("GENE 1.6 Thinking"), "workspace exposes the three named GENE 1.6 modes");
assert.ok(prompts.includes('const compactContext = ["chat", "research", "enhancePrompt", "plan", "interview"].includes(input.operation)'), "planning and conversational operations use bounded project context");
assert.ok(prompts.includes("selectedFileExcerpts: compactFiles") && prompts.includes("manifest: contextManifest") && prompts.includes("26000"), "planning and conversational requests receive a bounded source manifest and prioritized file excerpts");
assert.ok(prompts.includes("const compactPlan = p?.plan") && prompts.includes("JSON.stringify(compactContext ? compactPlan"), "plan updates receive a compact, bounded plan summary instead of resending every plan field");
assert.ok(page.includes("pinned-plan-strip") && page.includes("PINNED PROJECT PLAN"), "the active project plan stays visible above the scrolling chat");
assert.ok(page.includes("GENE 1.6 FLASH") && page.includes("GENE 1.6 BUILD SYSTEM"), "workspace branding identifies the current GENE 1.6 release line");
assert.ok(css.includes(".pinned-plan-strip") && css.includes("@media(max-width:760px)"), "pinned plan remains compact and responsive on mobile");
assert.ok(page.includes("extendedPlanning") && page.includes("enhanceDraftPrompt") && page.includes("✦ Enhance prompt"), "workspace exposes extended planning and prompt enhancement controls");
assert.ok(page.includes("gene-custom-selection") && page.includes("gene-custom-edit-mode") && page.includes("Select to edit"), "live preview supports selecting an element to prepare a targeted edit");
assert.ok(page.includes("files in the current manifest") && page.includes("input handlers|no keyboard.*touch.*controller"), "build progress avoids a changing denominator and missing input handlers target runtime code for repair");
assert.ok(api.includes("body.operation === \"enhancePrompt\"") && api.includes("extendedPlanning: body.extendedPlanning === true"), "API accepts the prompt enhancer operation and extended planning flag");
assert.ok(api.includes("no keyboard, touch, or controller input handlers were found"), "final validation reports absent input handlers without inventing keyboard controls");
assert.ok(css.includes(".gene15-tools") && css.includes(".extended-plan-toggle"), "GENE 1.5 planning controls have responsive styling");
assert.ok(prompts.includes("UNIFIED BRAIN CONTRACT") && prompts.includes("AUTONOMOUS DESIGN PASS") && prompts.includes("CONTINUITY CONTRACT"), "all project types share one continuous autonomous design brain");
assert.ok(api.includes('body.operation === "research" ? {} : { responseMimeType: "application/json" }'), "web research is not forced into JSON MIME mode that can interfere with grounding");

assert.ok(prompts.includes("GENE 1.3 QUALITY BAR") && prompts.includes("PROFESSIONAL 3D ART DIRECTION") && prompts.includes("AUTOMATIC STAGED BUILD STRATEGY"), "GENE 1.3 enforces professional art direction and staged vertical-slice development");
assert.ok(prompts.includes("LOCAL MULTIPLAYER QUALITY") && prompts.includes("map by stable index") && prompts.includes("mixed keyboard/controller"), "multiplayer generation requires independent player input ownership and mixed input support");
assert.ok(api.includes('body.operation === "buildPart"') && api.includes('attempt.fallback ? 5_120 : 6_144') && api.includes('alternateFinish === "length"'), "agent uses a larger single-file token budget with bounded fallback and detects alternate-provider truncation");
assert.ok(page.includes('for (let stageAttempt = 1; stageAttempt <= 3') && page.includes('workspace" + (!previewOpen ? " preview-minimized"'), "staged builds retry each file three times and explicitly expand chat when preview is hidden");
assert.ok(css.includes(".workspace.preview-minimized .conversation-scroll") && css.includes(".workspace.preview-minimized .composer"), "minimized preview widens both chat content and composer");
assert.ok(forge.includes('"wedge" | "torus"') && forge.includes("senior hard-surface/prop artist"), "Forge produces additional wedge/torus geometry with stronger professional modelling guidance");
assert.ok(api.includes("finishReason === \"MAX_TOKENS\""), "Gemini MAX_TOKENS finish reason is detected before parsing");
assert.ok(api.includes("compactInstruction"), "invalid or truncated model output is retried with a compact complete-response instruction");
assert.ok(api.includes("JSON.parse(cleaned)"), "candidate JSON is validated before it can reach file validation");

assert.ok(api.includes("at least three concrete implementation tasks"), "plans with no implementation tasks are rejected");
assert.ok(api.includes("exactly one next question or a completed plan"), "interview responses must be sequential and complete");
assert.ok(api.includes("GENE_PLAN_MODE_READ_ONLY"), "plan mode is enforced at the API boundary");
assert.ok(api.includes('new Function(byPath["game.js"])'), "model-generated JS syntax is checked");
assert.ok(api.includes("No files were changed"), "failed generation does not claim source changes");
assert.ok(api.includes("x-goog-api-key"), "Gemini key is passed in server-side request header");
assert.ok(api.includes("inlineData"), "image references can be sent to Gemini");
assert.ok(api.includes("googleSearch: {}"), "research mode enables Google Search grounding");
assert.ok(api.includes("groundingChunks"), "grounding sources are returned to user");
assert.ok(api.includes("project spec needs a title"), "builder requires meaningful project specs");
assert.ok(api.includes('projectKind === "app"'), "agent validation distinguishes apps from games");
assert.ok(api.includes("app spec needs a concise summary"), "app builds require structured app metadata");
assert.ok(page.includes('createNewProject("app")'), "workspace can create a dedicated web app project");
assert.ok(page.includes('"game.html": "index.html"') && page.includes('"game.js": "app.js"'), "app exports use standard HTML/CSS/JavaScript file names");
assert.ok(page.includes("importProjectPaths(currentFiles, importedKind)"), "app-friendly exported source names import back into editable files");
assert.ok(page.includes('sandbox={isApp ? "allow-scripts allow-forms" : "allow-scripts"}'), "only app previews enable form events; game previews keep the tighter sandbox");
assert.ok(page.includes("connect-src 'none'; form-action 'none'"), "generated previews block outbound connections and native form destinations with CSP");
assert.ok(playPage.includes('sandbox={isApp ? "allow-scripts allow-forms" : "allow-scripts"}'), "fullscreen app previews retain the app-only sandbox policy");
assert.ok(playPage.includes("connect-src 'none'; form-action 'none'"), "fullscreen previews retain restrictive network/form CSP");
assert.ok(playPage.includes('isApp ? "min-height:100%;height:auto;overflow:auto;"'), "full-screen app previews remain scrollable");
assert.ok(page.includes('project.kind === "app"'), "preview and workspace logic respect project kind");
assert.ok(prompts.includes("WEB APP ACCEPTANCE CHECKLIST"), "AI prompt defines app-specific acceptance rules");
assert.ok(api.includes("external runtime dependency"), "builder blocks external runtime dependencies");
assert.ok(prompts.includes("Ask at most ONE high-impact question"), "interview is sequential");
assert.ok(prompts.includes("Avoid empty black screens"), "prompt explicitly rejects placeholder games");
assert.ok(prompts.includes("navigator.getGamepads"), "game builder contract requires real Gamepad API polling");
assert.ok(prompts.includes("window.__GENE_ASSETS__"), "game builder contract teaches the model how to consume real Forge assets");
assert.ok(prompts.includes("local couch multiplayer"), "game builder contract distinguishes local and online multiplayer");
assert.ok(prompts.includes("dedicated Local Multiplayer 2D guide"), "local multiplayer has a dedicated build contract");
assert.ok(gameGuides.includes("localMultiplayer2d"), "genre guide has a dedicated local multiplayer implementation guide");
assert.ok(gameGuides.includes("localMultiplayer3d"), "3D local multiplayer has a dedicated guide");
assert.ok(gameGuides.includes("base.engine === \"webgl3d\" || is3d(text) ? GUIDES.localMultiplayer3d : GUIDES.localMultiplayer2d"), "local multiplayer guide selection respects the requested engine");
assert.ok(gameGuides.includes("implementation: [...base.implementation, ...multiplayer.implementation]"), "local multiplayer keeps the requested genre's implementation checklist");
assert.ok(gameGuides.includes("Pressing a Player 1 key changes only Player 1 state"), "local multiplayer guide requires isolated per-player input");
assert.ok(gameGuides.includes("Both players can move during the same frame"), "local multiplayer guide requires simultaneous gameplay");
assert.ok(gameGuides.includes("couch co.?op") && gameGuides.includes("GUIDES.localMultiplayer2d"), "local co-op prompts select the dedicated multiplayer guide");
assert.ok(gameGuides.includes("localMultiplayer2d"), "game guide registry contains a dedicated local multiplayer implementation guide");
assert.ok(gameGuides.includes("Player 1 key changes only Player 1 state"), "local multiplayer guide requires independent player input ownership");
assert.ok(gameGuides.includes("Pause freezes both players"), "local multiplayer guide covers shared pause and complete reset behavior");
assert.ok(gameGuides.includes("localMultiplayer2d"), "game guide catalog has a dedicated local multiplayer 2D implementation guide");
assert.ok(gameGuides.includes("Pressing a Player 1 key changes only Player 1 state"), "local multiplayer guide requires independent input ownership");
assert.ok(gameGuides.includes("Pause freezes both players"), "local multiplayer guide checks shared pause and reset behavior");
assert.ok(prompts.includes("WASD+F for P1"), "multiplayer prompt defines distinct default keyboard layouts");
assert.ok(prompts.includes("custom controls") || prompts.includes("remappable keyboard actions"), "game builder contract requires customizable controls");
assert.ok(read("apps/web/app/lib/starter-game.ts").includes("navigator.getGamepads"), "playable starter exercises browser gamepad support");
assert.ok(prompts.includes('input.operation === "research"'), "research uses its own agent instruction");
assert.ok(page.includes('localStorage.setItem(STORAGE_KEY'), "projects persist in browser storage");
assert.ok(page.includes('title="GENE live game preview"'), "preview runs in a sandboxed iframe");
assert.ok(page.includes("buildRuntimeAssetBootstrap(project.files)"), "live game preview exposes generated model assets");
assert.ok(playPage.includes("buildRuntimeAssetBootstrap(project?.files)"), "fullscreen play route exposes generated model assets");
assert.ok(runtimeAssets.includes("MAX_RUNTIME_ASSET_BYTES") && runtimeAssets.includes("window.__GENE_ASSETS__"), "asset runtime bridge has a size cap and explicit namespace");
assert.ok(runtimeAssets.includes("window.GENE3D.parseOBJ") && runtimeAssets.includes("window.GENE3D.parseMTL"), "asset runtime bridge provides real OBJ geometry and MTL material parsers");
assert.ok(page.includes("Save as version"), "manual edits create a snapshot");
assert.ok(page.includes("new JSZip()"), "export packages actual game source");
assert.ok(page.includes("JSZip.loadAsync(file)"), "project ZIP import is implemented");
assert.ok(page.includes('zip.file("references/" + safeName'), "export preserves reference files");
assert.ok(page.includes("referenceInputRef.current?.click()"), "reference uploads are wired");
assert.ok(page.includes("setSearchMode(!searchMode)"), "grounded search mode is toggleable");
assert.ok(page.includes("ONE DECISION AT A TIME"), "sequential question UI is present");
assert.ok(page.includes("Automated runtime repair"), "preview failure triggers bounded repair");
assert.ok(page.includes("!previewOpen || !iframeRef.current"), "collapsed or unmounted previews cannot trigger false render-timeout failures");
assert.ok(page.includes("current === \"rendered\" && state === \"loaded\" ? \"rendered\" : state"), "late monitor samples cannot downgrade a confirmed visible frame");
assert.ok(page.includes("window.__geneFrameConfirmed"), "canvas and WebGL render monitor remembers successful frame evidence");
assert.ok(page.includes("opaquePixels:alpha"), "solid-color canvas frames count as visible even without color variation");
assert.ok(page.includes("}, 9000);"), "preview gets a longer startup window before a render timeout");

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
const goodAppFiles = {
  "game.html": '<main class="app-shell"><nav aria-label="Main navigation"><button id="home-tab">Home</button></nav><section><h1>Studio dashboard</h1><label for="project-name">Project name</label><input id="project-name" value="My project"><button id="save-project">Save project</button><p id="status" aria-live="polite">Ready</p></section></main>',
  "game.css": 'body{font:16px Arial,sans-serif;background:#f5f6f8;color:#18202b}.app-shell{max-width:960px;margin:auto;padding:24px}button,input{font:inherit;padding:8px}',
  "game.js": 'const button=document.getElementById("save-project");button.addEventListener("click",()=>{document.getElementById("status").textContent="Saved "+document.getElementById("project-name").value;});',
  "game-spec.json": JSON.stringify({title:"Studio dashboard",kind:"app",engine:"webapp",summary:"A working small studio dashboard.",features:["Edit project name","Save feedback"],routes:["/"],userFlows:["Edit a project and save it"],performanceBudget:{targetFps:60}})
};
assert.equal(validateSourceProject(goodAppFiles).ok, true, "semantic web apps with interactive JavaScript pass local-agent validation");
assert.equal(validateSourceProject({...goodAppFiles,"game.js":"const = ;"}).ok, false, "invalid app JavaScript is rejected");
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


assert.ok(api.includes("normalizeExecutableHtmlScripts"), "inline executable HTML scripts are migrated into game.js before final validation");
assert.ok(api.includes("Migrated from inline HTML script"), "script normalization preserves inline behavior instead of discarding it");
assert.ok(api.includes("GROQ_API_KEY") && api.includes("OPENROUTER_API_KEY"), "builder can fall back across Groq and OpenRouter providers");
assert.ok(api.includes("successfulProvider = provider.name") && api.includes('aiMode: successfulProvider'), "API reports the provider that actually completed the request");
assert.ok(api.includes("apiKeys.length === 0 && !process.env.GROQ_API_KEY") && api.includes("apiKeys.length ? ["), "alternate providers can run even without a Gemini key");
assert.ok(api.includes('split(/[.!?\\n]/)'), "title normalization handles punctuation and newlines correctly");
assert.ok(page.includes("function deleteProject(projectId: string)"), "saved chat projects can be deleted");
assert.ok(page.includes("preview-reopen-tab") && css.includes(".workspace:has(.preview-reopen-tab)"), "minimized preview restores from a right-edge floating control without leaving a blank grid column");
assert.ok(page.includes("packageProgress") && page.includes("metadata.percent"), "source ZIP packaging reports real progress");
assert.ok(prompts.includes("Never add Gemini, OpenAI, Groq, OpenRouter, GENE, or AI-generated watermarks"), "generated app/game UIs avoid provider watermarks unless requested");


assert.ok(publishApi.includes("GENE_PUBLISH_PASSWORD") && publishApi.includes("VERCEL_TOKEN") && publishApi.includes("VERCEL_PROJECT_ID"), "web publishing is protected and uses server-side Vercel credentials");
assert.ok(publishApi.includes('target: "preview"'), "publishing user projects cannot overwrite GENE production deployment");
assert.ok(publishApi.includes("MAX_BYTES = 4_000_000") && publishApi.includes("GENE_PUBLISH_RATE_LIMIT"), "publishing validates upload size and rate limits");
assert.ok(page.includes("async function publishProject()") && page.includes('fetch("/api/publish"'), "workspace can publish the current web build and receive a live URL");
assert.ok(page.includes("desktop-wrapper/package.json") && page.includes("android-wrapper/package.json"), "source export includes real Electron and Capacitor wrapper projects");
assert.ok(page.includes("manifest.webmanifest") && page.includes("service-worker.js") && page.includes("standaloneDocument"), "web export creates a standalone installable PWA shell");
assert.ok(page.includes("expanded-live-editor") && page.includes("Apply edit"), "fullscreen live preview supports chat-driven edits without closing the preview");
assert.ok(page.includes("<GeneMark />") && css.includes(".gene-logo-svg"), "the UI uses the new custom geometric GENE mark");
assert.ok(health.includes("GROQ_API_KEY") && health.includes("OPENROUTER_API_KEY") && health.includes("publishConfigured"), "health status detects alternate AI providers and publish setup");


assert.ok(buildApi.includes("aes-256-gcm") && buildApi.includes("GENE_BUILD_ENCRYPTION_KEY") && buildApi.includes("timingSafeEqual"), "cloud build source is encrypted and password protected");
assert.ok(buildApi.includes("GENE_BUILD_RATE_LIMIT") && buildApi.includes("MAX_BYTES = 3_000_000"), "cloud build submissions have request limits");
assert.ok(buildStatusApi.includes("cloud-build.yml/runs") && buildStatusApi.includes(".result.json"), "workspace can poll real GitHub Actions cloud build status");
assert.ok(buildWorkflow.includes("runs-on: windows-latest") && buildWorkflow.includes("assembleDebug") && buildWorkflow.includes("electron-builder"), "cloud workers compile Windows installers and Android APKs with real platform toolchains");
assert.ok(buildWorkflow.includes("BLOB_READ_WRITE_TOKEN") && buildWorkflow.includes("publish-result"), "cloud workers publish direct artifact links and report completion");
assert.ok(buildHelper.includes("aes-256-gcm") && buildHelper.includes("prepareElectron") && buildHelper.includes("prepareAndroid"), "cloud helper decrypts source safely and prepares desktop/mobile wrappers");
assert.ok(buildUpload.includes("from \"@vercel/blob\"") && buildUpload.includes("access: \"public\""), "binary upload helper returns direct Vercel Blob download URLs");
assert.ok(page.includes('fetch("/api/builds"') && page.includes('fetch("/api/builds/" + id') && page.includes("binaryBuildLinks"), "workspace submits cloud builds, polls progress, and displays direct binary links");
assert.ok(css.includes(".binary-build-button") && css.includes(".binary-build-result"), "cloud build UI is styled for desktop and mobile");
assert.ok(buildHelper.includes('artifactName:"${productName}-Setup-${version}.${ext}"') && !buildHelper.includes('artifactName:"\\${productName}'), "Electron Builder receives valid artifact-name placeholders without path-escaping backslashes");
assert.ok(buildWorkflow.includes("valid Windows MZ executable header") && buildWorkflow.includes("APK failed ZIP integrity validation") && buildWorkflow.includes("sdkmanager --licenses"), "cloud workers validate EXE/APK outputs and prepare Android SDK licenses");
assert.ok(buildUpload.includes("createHash(\"sha256\")") && buildUpload.includes("sha256=") && buildUpload.includes("bytes="), "binary upload reports artifact size and SHA-256 checksum");
assert.ok(buildWorkflow.includes("WINDOWS_SHA256") && buildWorkflow.includes("ANDROID_SHA256") && buildWorkflow.includes("sizeBytes"), "cloud build result records binary integrity metadata per target");
assert.ok(page.includes("item.sizeBytes") && page.includes("item.sha256"), "download results display verified artifact size and checksum");


assert.ok(prompts.includes("GENE 1.3 QUALITY BAR") && prompts.includes("PROFESSIONAL 3D ART DIRECTION") && prompts.includes("AUTOMATIC STAGED BUILD STRATEGY"), "GENE 1.3 enforces professional art direction and staged vertical-slice development");
assert.ok(prompts.includes("stagePath?: string") && prompts.includes("fileBudget") && prompts.includes("isStageRepair"), "staged generation budgets context and repair stages can inspect their failing source");
assert.ok(api.indexOf('finishReason === "MAX_TOKENS"') < api.indexOf("if (candidate.ok && candidateText.trim())"), "MAX_TOKENS is handled before JSON parsing even when Gemini returns no text");
assert.ok(api.includes('body.operation === "buildPart"') && api.includes('attempt.fallback ? 5_120 : 6_144'), "single-file generation uses an adaptive larger output budget to reduce truncation");
assert.ok(forge.includes("beveledBox") && forge.includes("cornerIndices.values()") && forge.includes('"wedge"') && forge.includes('"torus"'), "Forge builds actual chamfered hard-surface, sloped and ring meshes");
assert.ok(gameGuides.includes("PROFESSIONAL MODELING PASS") && gameGuides.includes("up to four local player slots"), "game guides require professional 3D forms and scalable local multiplayer");
assert.ok(page.includes("GENE 1.6 FLASH") && page.includes("reduce this file output by at least 35 percent") && page.includes("setShowActivity(true)"), "GENE 1.6 exposes build progress and adapts retries after cutoff");
assert.ok(css.includes(".workspace:has(.preview-reopen-tab){grid-template-columns:minmax(0,1fr)}") && css.includes(".preview-reopen-tab{position:fixed;right:14px;top:auto;bottom:88px"), "minimized preview leaves the chat full-width and moves restore control out of the center");

assert.ok(forge.includes("type Surface =") && forge.includes("surface:'matte'|'metal'|'rubber'|'glass'|'emissive'") && forge.includes("const specular") && forge.includes("Ke "), "Forge exports material-aware metal, rubber, glass and emissive surface properties");
assert.ok(forge.includes("GROQ_API_KEY") && forge.includes("OPENROUTER_API_KEY") && forge.includes("successfulProvider = provider.name"), "Forge can use configured non-Gemini providers when Gemini cannot complete a mesh recipe");
console.log("GENE contract tests passed, including true WebGL contract checks, authenticated local filesystem sync, disk-backed play URL, import/export, grounded research and browser-test contracts.");


// GENE 1.4 Flash orchestration contracts: durable checkpoints, dependency ordering,
// interruption handling, prototype/full-game separation, and patch vocabulary.
const types14 = read("apps/web/app/lib/types.ts");
const orchestrator14 = read("apps/web/app/lib/build-orchestrator.ts");
assert.ok(types14.includes("export type BuildCheckpoint") && types14.includes("lastKnownGoodFiles"), "GENE 1.4 defines recoverable build checkpoints");
assert.ok(types14.includes("prototype?: { targetMinutes?: number") && types14.includes("fullGame?: { targetMinutes?: number"), "prototype and full-game targets are stored separately");
assert.ok(types14.includes("export type PatchOperation"), "GENE 1.4 declares explicit, scoped source patch operations");
assert.ok(orchestrator14.includes("assertAcyclic"), "build planning rejects cyclic task dependencies");
assert.ok(orchestrator14.includes("getReadyTasks"), "the coordinator gates work on passed dependencies");
assert.ok(orchestrator14.includes("checkpointBuild") && orchestrator14.includes("lastKnownGoodFiles"), "checkpointing stores known-good source snapshots");
assert.ok(orchestrator14.includes("queueUserChange") && orchestrator14.includes("planRevision"), "user interruptions queue changes and revise the plan");
assert.ok(orchestrator14.includes("recoverFromCheckpoint"), "failed builds can restore a checkpoint rather than restart from scratch");

assert.ok(prompts.includes("PROTOTYPE VS FULL GAME CONTRACT") && prompts.includes("20 minutes and 2 hours are examples only"), "prototype and full-game content budgets must be meaningfully distinct");
assert.ok(page.includes("Build checkpoints") && page.includes("Full-game target:"), "workspace exposes GENE 1.4 checkpoint and duration targets");
assert.ok(page.includes("browser runtime still needs to render") && page.includes("Gameplay objectives still require manual verification"), "source validation is not mislabeled as proof of gameplay");

const patchEngine = read("apps/web/app/lib/patch-engine.ts");
assert.ok(patchEngine.includes("export function applyPatchBatch"), "GENE 1.4 provides an atomic multi-file patch engine");
assert.ok(patchEngine.includes("Patch context is stale or missing") && patchEngine.includes("Patch context is ambiguous"), "patches reject stale and ambiguous contexts instead of overwriting unrelated source");
assert.ok(patchEngine.includes("applyUnifiedDiff") && patchEngine.includes("rename_file") && patchEngine.includes("replace_range"), "patch engine supports unified diffs, renames, and focused range edits");
assert.ok(patchEngine.includes("A patch batch must contain at least one operation"), "empty patch batches are rejected");

assert.ok(api.includes("const MAX_PROJECT_FILES = 100") && api.includes("isSafeProjectPath"), "agent supports dependency-aware projects with up to 100 safe relative paths");
assert.ok(!api.includes("fileCount > 4") && !api.includes("changed too many files for the current browser-game scope"), "edit operations are no longer capped at four files");
assert.ok(prompts.includes("NOT a four-file project limit") && prompts.includes("preserve directories and filenames"), "model is instructed to plan multi-file projects and preserve paths");

assert.ok(page.includes("stagePaths = [...stagePaths, ...extras]"), "staged builds expand from the model-generated file manifest");
assert.ok(page.includes("additionalFiles") && page.includes("dependency-aware project files"), "additional project files become tracked build tasks");
assert.ok(prompts.includes("DYNAMIC FILE MANIFEST") && prompts.includes("must not use import/export syntax") && prompts.includes("CORE RUNTIME CONTRACT:"), "dynamic modules follow the actual preview loading contract");

assert.ok(api.includes("Project exceeds \" + MAX_PROJECT_FILES + \" files") && api.includes("8 MB safety budget"), "API enforces project-wide file and source budgets");
assert.ok(api.includes("additionalFiles must be a bounded array") && api.includes("seenAdditional"), "dynamic file manifests are validated for safe unique paths");

assert.ok(api.includes("value.includes(String.fromCharCode(92))") && api.includes("value.split(\"\").some(char => char.charCodeAt(0) < 32"), "project path validation rejects backslashes and control characters");
assert.ok(page.includes("path.includes(String.fromCharCode(92))") && page.includes("additionalFiles"), "dynamic stage path validation uses the same safe relative-path policy");


// GENE 1.4 executable utility tests (not only source-string assertions).
const tsCompiler = await import("typescript");
const patchSource = read("apps/web/app/lib/patch-engine.ts");
const patchJs = tsCompiler.transpileModule(patchSource, {
  compilerOptions: { module: tsCompiler.ModuleKind.ESNext, target: tsCompiler.ScriptTarget.ES2022 }
}).outputText;
const patchModule = await import("data:text/javascript;base64," + Buffer.from(patchJs).toString("base64"));
const { applyPatchBatch } = patchModule;
const originalTree = { "src/main.js": "const speed = 2;\nstart();", "README.md": "GENE test" };
const changedTree = applyPatchBatch(originalTree, [
  { op: "replace_exact", path: "src/main.js", expected: "const speed = 2;", replacement: "const speed = 4;" },
  { op: "add_file", path: "data/levels.json", content: JSON.stringify({ levels: [1, 2] }) }
]);
assert.equal(changedTree.files["src/main.js"], "const speed = 4;\nstart();", "exact-context edits update only the requested source span");
assert.equal(changedTree.files["data/levels.json"], JSON.stringify({ levels: [1, 2] }), "atomic batches can add project data files");
assert.equal(originalTree["src/main.js"], "const speed = 2;\nstart();", "patching never mutates the caller's known-good tree");
assert.throws(() => applyPatchBatch(originalTree, [
  { op: "replace_exact", path: "src/main.js", expected: "const speed = 2;", replacement: "const speed = 5;" },
  { op: "delete_file", path: "missing.js" }
]), /Cannot delete a missing file/, "one invalid operation rejects the whole patch batch");
assert.throws(() => applyPatchBatch(originalTree, [
  { op: "replace_exact", path: "src/main.js", expected: "const speed = 9;", replacement: "broken" }
]), /stale or missing/, "stale edit context is rejected");
assert.throws(() => applyPatchBatch(originalTree, [
  { op: "add_file", path: "../outside.js", content: "unsafe" }
]), /Unsafe project path/, "path traversal is rejected");
const renamedTree = applyPatchBatch(originalTree, [{ op: "rename_file", path: "README.md", newPath: "docs/README.md" }]);
assert.equal(renamedTree.files["docs/README.md"], "GENE test", "rename preserves file content");
assert.equal(renamedTree.files["README.md"], undefined, "rename removes the old manifest path");
const diffTree = applyPatchBatch(originalTree, [{
  op: "apply_diff", path: "src/main.js",
  patch: "@@ -1,2 +1,2 @@\n-const speed = 2;\n+const speed = 3;\n start();"
}]);
assert.equal(diffTree.files["src/main.js"], "const speed = 3;\nstart();", "unified diffs apply only when their source context matches");

const coordinatorSource = read("apps/web/app/lib/build-orchestrator.ts");
const coordinatorJs = tsCompiler.transpileModule(coordinatorSource, {
  compilerOptions: { module: tsCompiler.ModuleKind.ESNext, target: tsCompiler.ScriptTarget.ES2022 }
}).outputText;
const coordinator = await import("data:text/javascript;base64," + Buffer.from(coordinatorJs).toString("base64"));
const baseRun = coordinator.createBuildRun({
  projectId: "test", now: "2026-01-01T00:00:00.000Z",
  tasks: [
    { id: "design", title: "Design", kind: "design", acceptance: ["Spec is valid"] },
    { id: "core", title: "Core", kind: "implement", dependsOn: ["design"], files: ["game.js"], acceptance: ["Core loop works"] }
  ],
  fullGameContent: ["Extra missions", "Distinct ending"]
});
assert.deepEqual(coordinator.getReadyTasks(baseRun).map(task => task.id), ["design"], "only dependency-ready tasks may start");
assert.throws(() => coordinator.createBuildRun({ projectId: "cycle", tasks: [
  { id: "a", title: "A", kind: "design", dependsOn: ["b"], acceptance: [] },
  { id: "b", title: "B", kind: "implement", dependsOn: ["a"], acceptance: [] }
] }), /cycle detected/, "dependency cycles are rejected");
let checkpointRun = coordinator.setTaskStatus(baseRun, "design", "running");
checkpointRun = coordinator.setTaskStatus(checkpointRun, "design", "passed");
checkpointRun = coordinator.setTaskStatus(checkpointRun, "core", "running");
checkpointRun = coordinator.checkpointBuild(checkpointRun, { "game.js": "known-good" }, { passed: ["design"], failed: [] }, "task-complete", "Resume at core");
const recovered = coordinator.recoverFromCheckpoint(checkpointRun, checkpointRun.checkpoints[0].id);
assert.equal(recovered.files["game.js"], "known-good", "recovery restores the checkpoint source snapshot");
assert.equal(recovered.run.tasks.find(task => task.id === "design").status, "passed", "recovery preserves completed tasks");
assert.equal(recovered.run.tasks.find(task => task.id === "core").status, "queued", "recovery requeues unfinished tasks");
assert.equal(baseRun.prototype.targetMinutes, undefined, "prototype duration stays project-specific when no estimate is supplied");
assert.equal(baseRun.fullGame.targetMinutes, undefined, "full-game duration stays project-specific when no estimate is supplied");
console.log("GENE 1.4 executable patch-engine and build-recovery tests passed.");

assert.ok(api.includes('import { applyPatchBatch } from "../../lib/patch-engine"'), "agent edit validation uses the patch engine");
assert.ok(api.includes("const patchOperations = files.map") && api.includes("const patched = applyPatchBatch(body.project.files, patchOperations)"), "AI edits are applied as an atomic patch batch before project validation");

assert.ok(prompts.includes("Plan an update") || prompts.includes("UPDATE PLAN"), "planning prompts support updates to existing projects");
assert.ok(prompts.includes("Plan only") && prompts.includes("PLANNING INTENT"), "plan mode distinguishes new-project planning from update planning");
assert.ok(page.includes('aria-label="Planning intent"') && page.includes("Plan an update"), "workspace exposes an explicit plan-update choice");
assert.ok(!page.includes("prototypeMinutes: 20") && !page.includes("fullGameMinutes: 120"), "build coordinator does not force fixed playtime durations");
assert.ok(page.includes("project-specific estimate pending"), "workspace labels unknown duration estimates instead of inventing defaults");

assert.ok(existsSync(new URL("../apps/web/app/error.tsx", import.meta.url)), "app-level error boundary exists");
const appErrorBoundary = read("apps/web/app/error.tsx");
assert.ok(appErrorBoundary.includes("reset()") && appErrorBoundary.includes("GENE · RECOVERY"), "unexpected workspace errors offer a retry path without clearing project state");
assert.ok(page.includes("function explainAgentError") && page.includes("quota reset") && page.includes("request timed out"), "agent failures provide actionable quota and timeout guidance");

assert.ok(page.includes("const canChatDuringBuild = buildInProgress && canQueueBuildRequests && isReadOnlyConversation") && page.includes("setParallelChatInProgress(true)"), "conversation-only chat can run during a playable build preview while edits queue");
assert.ok(page.includes("pendingBuildRequests.current.push(prompt)") && page.includes("pendingBuildRequests.current.shift()"), "build-time changes are queued and processed in order");
assert.ok(page.includes("Playable prototype published.") && page.includes('status: "playable"'), "the live preview becomes playable before the complete project build ends");
assert.ok(page.includes("setCanQueueBuildRequests(true)") && page.includes("Continue playing and chatting"), "the workspace enables chat and safely queues code changes during builds");
assert.ok(page.includes("Describe what to update, fix, or add to this project"), "update planning composer explains its intended task");
assert.ok(page.includes('aria-label="Planning intent"') && page.includes(">Plan an update</button>") && page.includes('className="composer-toolbar"'), "plan intent controls and composer toolbar are present in the workspace JSX");

assert.ok(api.includes("app declares interactive controls but game.js contains no detectable event handlers"), "app validation rejects fake interactive controls without handlers");
assert.ok(page.includes("FULL GAME EXPANSION PASS — NOT A PROTOTYPE POLISH PASS") && page.includes("Final content pass completed") === false, "build pipeline requests a distinct full-game expansion pass rather than treating the prototype as the finished game");
assert.ok(page.includes("final-content-pass") && page.includes("Expand the prototype into the full game"), "build task ledger includes a separate full-game expansion stage");

assert.ok(page.includes("const isReadOnlyReply = operation === \"chat\" || operation === \"research\""), "concurrent read-only chat merges into the live project without replacing build files");
assert.ok(page.includes("const knownIds = new Set(current.messages.map(item => item.id))"), "concurrent build/chat responses deduplicate and preserve conversation messages");
assert.ok(page.includes("finalContentPassSucceeded ? \"completed\" : \"failed\""), "build status cannot report full completion when the final expansion pass failed");

assert.ok(page.includes("const moduleScripts = Object.entries(project.files)") && page.includes("window.GeneModules"), "generated browser modules are loaded in the live preview and have a documented shared namespace");
assert.ok(prompts.includes("must not use import/export syntax") && prompts.includes("window.GeneModules"), "generated modules follow the live preview's script-loading contract");
assert.ok(page.includes('(moduleScripts ? "<script>" + moduleScripts + "<\\/script>" : "")'), "generated modules are injected before the core runtime in both app and game previews");


// GENE 1.4 regressions: the builder must grow beyond the four boot files,
// run a real one-question-at-a-time interview, and recover rather than restart.
assert.ok(page.includes('project.mode === "plan") operation = planIntent === "update" && project.initialPrompt ? "plan" : project.plan ? "plan" : "interview"'), "new Plan Mode projects begin with the interview instead of jumping straight to a shallow plan");
assert.ok(page.includes("const plannedModules: string[] = []") && page.includes("src/systems/progression.js"), "game scope automatically derives meaningful modules beyond the four core files");
assert.ok(page.includes('new Set(["json","js","svg"') && page.includes("test(stagePath)"), "JavaScript modules are accepted and scheduled as real generation stages");
assert.ok(page.includes("recoverFromCheckpoint(nextProject.buildRun)") && page.includes("Checkpoint recovery: kept completed stage"), "failed builds restore the latest checkpoint and skip already-passed stages");
assert.ok(page.includes("Resume from checkpoint") && page.includes('finalAttempt <= 3'), "users can resume a failed build and final expansion retries length/provider failures");
assert.ok(page.includes("MUST integrate the already generated modules"), "the final full-game pass must connect generated modules rather than leave them orphaned");


assert.ok(page.includes('plannedModules.push("src/systems/input.js")') && page.includes('plannedModules.push("src/systems/progression.js")') && page.includes('plannedModules.push("src/systems/content.js")'), "game modules are selected from actual scope instead of forcing unnecessary files into every game");
assert.ok(page.includes('task.id === "final-content-pass").map(task => ({ ...task, dependsOn: ["stage-" + (stagePaths.length - 1)] }))'), "dynamic file expansion moves the final content pass behind every generated module");
assert.ok(api.includes("const gameQuestions = [") && api.includes("const appQuestions = [") && api.includes("bank.find(question => !Object.prototype.hasOwnProperty.call(answers, question.id))"), "fallback interview asks multiple adaptive questions one at a time");
assert.ok(api.includes("const original = String(body.message || body.project?.initialPrompt"), "update planning uses the requested update instead of only the original project prompt");

assert.ok(api.includes("const answersSummary = Object.entries(answers)") && api.includes("plan: starterPlan") && api.includes("AI-powered planning and code generation still require a configured provider key."), "fallback interview ends with an answer-informed starter plan and honestly discloses missing AI configuration");

assert.ok(prompts.includes("CORE RUNTIME CONTRACT:") && prompts.includes("Give staged modules enough neighboring source"), "staged generation may return manifest paths and receives the source needed to integrate modules");
assert.ok(api.includes("spec promises keyboard controls") && api.includes("spec promises touch/pointer controls") && api.includes("spec promises controller support"), "validation checks declared keyboard, touch, and gamepad controls instead of only checking for any event handler");
assert.ok(api.includes("const runtimeSource = Object.entries(byPath).filter(([path, content]) => /\\.js$/i.test(path)") && api.includes("test(runtimeSource)"), "control validation scans all assembled JavaScript modules, not only game.js");
assert.ok(api.includes("spec.controls = inferred") && api.includes("normalizedSpecChanged") && api.includes("validationFiles"), "final validation deterministically repairs and returns a missing game controls contract");
assert.ok(api.includes("const recoveredControls: string[] = []") && api.includes("game controls are missing and no keyboard, touch, or controller handlers were found"), "build contract recovers controls from the complete assembled runtime and gives a precise error when no input handlers exist");
assert.ok(page.includes("Add app modules only when the actual requested feature scope needs them") && page.includes("A module is justified by a feature, not by a fixed template"), "additional modules are selected from project scope instead of a fixed file template");

assert.ok(page.includes("const safeManifest =") && page.includes("spec.additionalFiles = safeManifest"), "manifest paths and generated extra files stay synchronized after filtering unsafe paths");
assert.ok(api.includes(String.raw`if (/\.js$/i.test(file.path)) new Function(file.content);`) && api.includes("declared project module/asset"), "every generated JavaScript module is syntax-checked and every declared extra file must exist");

assert.ok(page.includes("Playable prototype published.") && page.includes('status: "playable"') && page.includes("Continue playing and chatting"), "the core game is exposed in the live workspace before full-game expansion completes");
assert.ok(page.includes("if (isReadOnlyReply) {\n          return { ...current, messages: [...current.messages, ...appendedMessages], updatedAt: now() };"), "concurrent chat replies cannot overwrite newer build files or checkpoints");
assert.ok(page.includes('setTaskStatus(activeBuildRun, "validate-assembled", "skipped"') && page.includes("Skipped release completion because the final-content task failed"), "failed full-game expansion remains a recoverable partial build without breaking task dependencies");

assert.ok(page.includes("Playable prototype published.") && page.includes('status: "playable"') && page.includes("Continue playing and chatting"), "the core game is exposed in the live workspace before full-game expansion completes");
assert.ok(page.includes("const canChatDuringBuild = buildInProgress && canQueueBuildRequests && isReadOnlyConversation") && page.includes("setParallelChatInProgress(true)"), "read-only AI chat can run concurrently with the playable prototype build");
assert.ok(page.includes("if (isReadOnlyReply) {\n          return { ...current, messages: [...current.messages, ...appendedMessages], updatedAt: now() };"), "concurrent chat replies cannot overwrite newer build files or checkpoints");
assert.ok(page.includes('setTaskStatus(activeBuildRun, "validate-assembled", "skipped"') && page.includes("Skipped release completion because the final-content task failed"), "failed full-game expansion remains a recoverable partial build without breaking task dependencies");

assert.ok(page.includes("isRuntimeLoadablePath") && page.includes("only browser modules and the supported Forge OBJ/MTL asset paths"), "the staged build does not fabricate unsupported binary assets");
assert.ok(prompts.includes("binary media must come from the asset/Forge pipeline") && prompts.includes("assets/<asset-id>/model.obj"), "asset prompts match the runtime's actual Forge asset paths");

assert.ok(page.includes("key must match this filename exactly") && page.includes("window.GeneModules["), "generated modules use deterministic global API names the runtime can call");
assert.ok(page.includes("isRuntimeLoadablePath") && page.includes("model\\.obj"), "asset staging is gated by an explicit runtime-loadable path contract");


const studioContract = read("apps/web/app/lib/studio-contract.ts");
const capabilitiesApi = read("apps/web/app/api/capabilities/route.ts");
assert.ok(studioContract.includes("getStudioCapabilities") && studioContract.includes("buildStudioContract"), "GENE exposes a reusable studio capability registry and production contract");
assert.ok(studioContract.includes("pipeline-dependent") && studioContract.includes("not equivalent to a native game") && studioContract.includes("online multiplayer"), "capability registry honestly distinguishes conditional native builds and real networking");
assert.ok(studioContract.includes("event-driven audio layer") && studioContract.includes("autoplay restrictions") && studioContract.includes("independently adjustable buses"), "game production contract requires robust event-driven audio with browser-safe startup and separate buses");
assert.ok(studioContract.includes("SOUND HONESTY") && studioContract.includes("positional 3D audio") && studioContract.includes("never let audio errors stop gameplay"), "audio capability guidance distinguishes real spatial audio and non-blocking fallbacks");
assert.ok(studioContract.includes("3D ASSET ACCEPTANCE") && studioContract.includes("triangle/material budgets"), "3D asset guidance requires coherent silhouettes, reusable assets and performance budgets");
assert.ok(studioContract.includes("polished, coherent vertical slice") && studioContract.includes("art direction") && studioContract.includes("weak hardware"), "studio contract prioritizes coherent game quality and target performance over asset count");
assert.ok(prompts.includes('import { buildStudioContract } from "./studio-contract";') && prompts.includes("buildStudioContract(projectKind"), "all AI operations receive the capability-aware production contract");
assert.ok(capabilitiesApi.includes("getStudioCapabilities") && capabilitiesApi.includes("INVALID_PROJECT_KIND") && capabilitiesApi.includes("INVALID_ENGINE"), "capability API validates requested project kind and engine before returning support information");


const projectMemorySource = read("apps/web/app/lib/project-memory.ts");
assert.ok(prompts.includes('import { formatCanonicalProjectMemory } from "./project-memory";') && prompts.includes("CANONICAL PROJECT MEMORY"), "AI prompt context includes structured project memory separately from chat");
assert.ok(projectMemorySource.includes("confirmedDecisions") && projectMemorySource.includes("latestCheckpoint") && projectMemorySource.includes("unfinishedTasks"), "project memory tracks decisions, checkpoint evidence, and unfinished work");
const memoryJs = tsCompiler.transpileModule(projectMemorySource, {
  compilerOptions: { module: tsCompiler.ModuleKind.ESNext, target: tsCompiler.ScriptTarget.ES2022 }
}).outputText;
const projectMemory = await import("data:text/javascript;base64," + Buffer.from(memoryJs).toString("base64"));
const memorySnapshot = projectMemory.buildCanonicalProjectMemory({
  id: "memory-test", name: "Test project", kind: "game", initialPrompt: "A small survival game",
  mode: "build", thinking: "deep", messages: [], answers: { engine: "WebGL 3D", playerCount: "Single player" },
  plan: { title: "Survival", summary: "Survive rounds", engine: "webgl3d", tasks: ["movement", "enemies"], mechanics: ["combat"], performanceBudget: { targetFps: 60, maxEnemies: 12, maxObjects: 800, maxParticles: 80 } },
  files: { "game.js": "start();", "game-spec.json": "{}" }, versions: [{ number: 3, label: "Known good", files: {}, createdAt: "2026-01-01", testSummary: "pass" }],
  activeFile: "game.js", references: [], updatedAt: "2026-01-01",
  buildRun: { ...checkpointRun, status: "recovering", lastError: "Temporary generation error" }
});
assert.equal(memorySnapshot.confirmedDecisions.length, 2, "canonical project memory preserves user-confirmed answers");
assert.equal(memorySnapshot.currentPlan.engine, "webgl3d", "canonical project memory preserves the selected engine");
assert.equal(memorySnapshot.source.fileCount, 2, "canonical project memory tracks the current source manifest");
assert.ok(memorySnapshot.source.revisionHash && memorySnapshot.source.fileHashes["game.js"], "canonical memory fingerprints the current source revision and individual files");
assert.equal(projectMemory.fingerprintProjectFiles({ "b.js": "b", "a.js": "a" }).revisionHash, projectMemory.fingerprintProjectFiles({ "a.js": "a", "b.js": "b" }).revisionHash, "source revision fingerprint is stable regardless of object key order");
assert.notEqual(projectMemory.fingerprintProjectFiles({ "game.js": "before" }).revisionHash, projectMemory.fingerprintProjectFiles({ "game.js": "after" }).revisionHash, "source revision fingerprint changes when source changes");
const nonOverlappingMerge = projectMemory.mergeConcurrentSourceChanges(
  { "game.js": "base-game", "game.css": "base-css" },
  { "game.js": "base-game", "game.css": "user-css" },
  { "game.js": "ai-game", "game.css": "base-css" },
  ["game.js"]
);
assert.deepEqual(nonOverlappingMerge.conflicts, [], "AI changes to a file do not conflict with a concurrent edit to a different file");
assert.equal(nonOverlappingMerge.files["game.js"], "ai-game", "non-overlapping AI changes are applied");
assert.equal(nonOverlappingMerge.files["game.css"], "user-css", "non-overlapping user edits are preserved");
const overlappingMerge = projectMemory.mergeConcurrentSourceChanges(
  { "game.js": "base" }, { "game.js": "user-edit" }, { "game.js": "ai-edit" }, ["game.js"]
);
assert.deepEqual(overlappingMerge.conflicts, ["game.js"], "concurrent edits to the same file are detected");
assert.equal(overlappingMerge.files["game.js"], "user-edit", "conflicting merge leaves the newer user source untouched");
const identicalMerge = projectMemory.mergeConcurrentSourceChanges(
  { "game.js": "base" }, { "game.js": "same" }, { "game.js": "same" }, ["game.js"]
);
assert.deepEqual(identicalMerge.conflicts, [], "identical concurrent results do not create a false conflict");
assert.ok(page.includes("mergeConcurrentSourceChanges") && page.includes("discarded this stale result") && page.includes("if (!current || current.id !== updated.id) return current;"), "workspace rejects stale overlapping AI results without switching active projects");
assert.ok(page.includes("if (!current || current.id !== failed.id) return current;"), "failed late responses cannot switch the workspace back to an inactive project");


assert.equal(memorySnapshot.build.lastError, "Temporary generation error", "canonical project memory retains the latest recoverable error");
assert.ok(projectMemory.formatCanonicalProjectMemory({ id: "minimal", name: "Minimal", initialPrompt: "x", mode: "plan", thinking: "balanced", messages: [], answers: {}, files: {}, versions: [], activeFile: "", references: [], updatedAt: "2026-01-01" }).includes('"schemaVersion":1'), "canonical memory has an explicit schema version");
let boundedHistoryRun = baseRun;
for (let index = 0; index < 12; index++) {
  boundedHistoryRun = coordinator.checkpointBuild(boundedHistoryRun, { "game.js": "snapshot-" + index }, { passed: [], failed: [] }, "task-complete", "bounded history test", "2026-01-01T00:00:" + String(index).padStart(2, "0") + ".000Z");
}
assert.equal(boundedHistoryRun.checkpoints.length, 8, "checkpoint history is bounded to eight full source snapshots");
assert.equal(boundedHistoryRun.checkpoints[0].lastKnownGoodFiles["game.js"], "snapshot-4", "bounded history retains the eight newest recovery snapshots");
let sizeBudgetRun = coordinator.checkpointBuild(baseRun, { "game.js": "a".repeat(800_000) }, { passed: [], failed: [] }, "task-complete", "large snapshot A");
sizeBudgetRun = coordinator.checkpointBuild(sizeBudgetRun, { "game.js": "b".repeat(800_000) }, { passed: [], failed: [] }, "task-complete", "large snapshot B");
assert.equal(sizeBudgetRun.checkpoints.length, 1, "checkpoint storage budget prunes older snapshots before browser storage grows without bound");
assert.equal(sizeBudgetRun.checkpoints[0].lastKnownGoodFiles["game.js"].charAt(0), "b", "checkpoint budget always preserves the newest recovery snapshot");


const projectStorageSource = read("apps/web/app/lib/project-storage.ts");
assert.ok(page.includes("buildProjectStorageCandidates(merged)") && page.includes("GENE could not save this change to browser storage"), "workspace retries storage with smaller snapshots and warns if every attempt fails");
assert.ok(page.includes("persistenceWarning &&") && page.includes("aria-live=\"polite\""), "storage quota recovery is visible and accessible");
const projectStorageJs = tsCompiler.transpileModule(projectStorageSource, {
  compilerOptions: { module: tsCompiler.ModuleKind.ESNext, target: tsCompiler.ScriptTarget.ES2022 }
}).outputText;
const projectStorage = await import("data:text/javascript;base64," + Buffer.from(projectStorageJs).toString("base64"));
const storageFixture = {
  id: "storage-test", name: "Storage test", kind: "game", initialPrompt: "Keep source safe", mode: "build", thinking: "balanced",
  messages: Array.from({ length: 100 }, (_, index) => ({ id: String(index), role: "assistant", content: "history " + index, createdAt: "2026-01-01" })),
  answers: {}, plan: null, files: { "game.js": "keep-current-source" },
  versions: Array.from({ length: 5 }, (_, index) => ({ number: 5 - index, label: "v" + index, files: { "game.js": "version-" + index }, createdAt: "2026-01-01", testSummary: "test" })),
  activeFile: "game.js",
  references: [{ id: "image-ref", name: "reference.png", mimeType: "image/png", kind: "image", dataBase64: "VERY-LARGE-IMAGE-PAYLOAD", size: 1000000 }],
  updatedAt: "2026-01-01",
  buildRun: { ...checkpointRun, checkpoints: Array.from({ length: 4 }, (_, index) => ({ ...checkpointRun.checkpoints[0], id: "cp-" + index, lastKnownGoodFiles: { "game.js": "checkpoint-" + index } })) }
};
const storageCandidates = projectStorage.buildProjectStorageCandidates([storageFixture, { ...storageFixture, id: "older-project" }]);
assert.equal(storageCandidates.length, 4, "storage persistence has progressively smaller fallback snapshots");
assert.equal(storageCandidates[0].projects.length, 2, "first storage attempt preserves all supplied projects");
assert.equal(storageCandidates[1].projects.length, 2, "history trimming does not immediately discard project records");
assert.equal(storageCandidates[1].projects[0].versions.length, 2, "history fallback limits saved source versions");
assert.equal(storageCandidates[1].projects[1].buildRun.checkpoints.length, 0, "inactive projects drop duplicated checkpoint snapshots first");
assert.equal(storageCandidates[2].projects.length, 1, "next fallback preserves the active project and drops older project records");
assert.equal(storageCandidates[2].projects[0].files["game.js"], "keep-current-source", "storage fallback always preserves active source files");
assert.equal(storageCandidates[2].projects[0].references[0].dataBase64, undefined, "storage fallback removes large image payloads while retaining reference metadata");
assert.equal(storageCandidates[3].projects[0].versions.length, 0, "last fallback drops duplicate version snapshots before current source");
assert.equal(storageCandidates[3].projects[0].buildRun.checkpoints.length, 0, "last fallback removes checkpoint snapshots only after smaller options fail");
