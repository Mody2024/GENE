import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as ts from "typescript";
import vm from "node:vm";
import { analyzeProjectScripts, repairUninitializedCollections } from "../apps/web/app/lib/code-safety.mjs";
import { normalizeProjectFilePath, inspectProjectFilePaths } from "../apps/web/app/lib/project-file-safety.mjs";
import { orderRuntimeModulePaths } from "../apps/web/app/lib/runtime-module-order.mjs";
import { classifyProviderFailure, describeProviderError, parseFreeCatalog, extractJsonObjectText } from "../apps/web/app/lib/provider-utils.mjs";
import { sanitizeSvg } from "../apps/web/app/lib/svg-safety.mjs";
import { cleanQuery, buildSearchLinks, filterPolyHaven, formatResearchNotes } from "../apps/web/app/lib/research-sources.mjs";
import { GENE_AUDIO_SOURCE, buildRuntimeKitScript } from "../apps/web/app/lib/runtime-kit.mjs";
import { validateCloudBuildReport } from "../apps/web/app/lib/cloud-build-report.mjs";

// Provider routing: the exact error from the field must be treated as "unavailable", paid models never enter the pool.
assert.equal(classifyProviderFailure(400, "This model is unavailable for free. The paid version is available now - use this slug instead: qwen/qwen3-coder"), "unavailable");
assert.equal(describeProviderError({ error: { message: "Provider returned error", metadata: { raw: "upstream model returned 429", provider_name: "Example Provider" } } }), "Provider returned error | upstream model returned 429 | Example Provider", "generic gateway messages must preserve actionable upstream diagnostics");
assert.equal(classifyProviderFailure(400, describeProviderError({ error: { message: "Provider returned error", metadata: { raw: "This model is unavailable for free" } } })), "unavailable", "raw gateway metadata must drive dead-model cooldown instead of repeating broken free routes");

const catalog = parseFreeCatalog({ data: [
  { id: "qwen/qwen3-coder", pricing: { prompt: "0.0000003", completion: "0.0000012" }, context_length: 262144 },
  { id: "qwen/qwen3-coder:free", pricing: { prompt: "0", completion: "0" }, context_length: 262144 },
  { id: "vendor/paid-model", pricing: { prompt: "0.000001", completion: "0.000002" }, context_length: 32000 }
] }, 10);
const ids = catalog.map(model => (typeof model === "string" ? model : model.id));
assert.ok(ids.includes("qwen/qwen3-coder:free") && !ids.includes("qwen/qwen3-coder") && !ids.includes("vendor/paid-model"), "only verifiably free models are routed");
const textOnlyCatalog = parseFreeCatalog({ data: [
  { id: "google/lyria-3-clip-preview", pricing: { prompt: "0", completion: "0" }, context_length: 32000, architecture: { output_modalities: ["text", "audio"] } },
  { id: "vendor/free-tts", pricing: { prompt: "0", completion: "0" }, context_length: 32000, architecture: { output_modalities: ["audio"] } },
  { id: "vendor/free-chat", pricing: { prompt: "0", completion: "0" }, context_length: 32000, architecture: { output_modalities: ["text"] } }
] });
assert.deepEqual(textOnlyCatalog.map(model => model.id), ["vendor/free-chat"], "free audio/music endpoints must never enter the text/code fallback pool");

assert.equal(JSON.parse(extractJsonObjectText('Here:\n```json\n{"a":1}\n```')).a, 1);

// The reported crash: `let hazards;` later used as an array.
const fixed = repairUninitializedCollections("let hazards;\nfunction reset(){ hazards.push({x:1}); }\nreset();");
assert.ok(/let hazards\s*=\s*\[\]/.test(fixed.source), "uninitialized collection declarations are repaired");
const bad = analyzeProjectScripts([{ path: "game.js", content: "function tick(){ enemies.push(1); }\ntick();" }], { scopeChecks: true });
assert.ok(bad.errors.length > 0, "undeclared identifiers used as objects are caught");
const good = analyzeProjectScripts([{ path: "game.js", content: "const enemies = [];\nfunction tick(){ enemies.push(1); }\ntick();" }], { scopeChecks: true });
const commonJs = analyzeProjectScripts([{ path: "systems/enemies.cjs", content: "const enemies = [];\nfunction tick(){ enemies.push(1); }\ntick();" }], { scopeChecks: true });
assert.equal(commonJs.errors.length, 0, "CommonJS files receive the same identifier analysis as .js and .mjs");
assert.equal(good.errors.length, 0);

// Cross-platform project path contract: Windows installer paths and browser ZIPs
// must agree on path validity and collisions before packaging.
assert.equal(normalizeProjectFilePath("assets/hero-model.glb").ok, true);
for (const invalidPath of [
  "../outside.txt", "assets/../../secret", "/absolute/file.js", "C:/boot.ini",
  "folder\\nested.js", "assets/CON.txt", "assets/NUL", "file.js.", "folder/trailing ",
  "assets/bad:name.js", "assets/\u0007beep.js", "assets/\u202Eexe.js", "x".repeat(241)
]) {
  assert.equal(normalizeProjectFilePath(invalidPath).ok, false, "unsafe or non-portable path rejected: " + JSON.stringify(invalidPath));
}
const caseCollision = inspectProjectFilePaths(["Assets/Hero.png", "assets/hero.png"]);
assert.equal(caseCollision.ok, false, "case-insensitive collisions are rejected for Windows compatibility");
assert.equal(caseCollision.collisions.length, 1);
const unicodeCollision = inspectProjectFilePaths(["caf\u00e9.txt", "cafe\u0301.txt"]);
assert.equal(unicodeCollision.ok, false, "canonically equivalent Unicode paths cannot overwrite each other");
assert.equal(inspectProjectFilePaths(["game/index.html", "assets/hero.png"]).ok, true);
assert.equal(inspectProjectFilePaths(["assets", "assets/hero.png"]).ok, false, "file paths cannot also be directories");
assert.equal(inspectProjectFilePaths(["assets/hero.png", "assets"]).ok, false, "file/directory conflicts are rejected regardless of source order");
const orderedModules = orderRuntimeModulePaths({
  "game.js": "startGame();",
  "game-spec.json": JSON.stringify({ additionalFiles: ["src/core.mjs", "src/combat.cjs"] }),
  "src/ui.js": "window.GeneModules.ui = {};",
  "src/combat.cjs": "window.GeneModules.combat = {};",
  "src/core.mjs": "window.GeneModules.core = {};",
  "src/z-last.js": "window.GeneModules.last = {};",
  "node_modules/ignored.js": "ignored();"
});
assert.deepEqual(orderedModules, ["src/core.mjs", "src/combat.cjs", "src/ui.js", "src/z-last.js"], "runtime module order follows declared dependencies, then deterministically sorts undeclared modules and excludes node_modules");
assert.deepEqual(orderRuntimeModulePaths({ "game.js": "", "b.js": "", "a.js": "" }), ["a.js", "b.js"], "projects without a module manifest use deterministic alphabetical module order");

// SVG sanitizer.
const hostile = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" onload="alert(1)"><script>alert(1)</script><image href="https://evil.test/x.png"/><rect width="4" height="4" fill="red"/><circle cx="5" cy="5" r="2"/></svg>';
const clean = sanitizeSvg(hostile);
assert.ok(clean.ok && !/script|onload|evil|<image/i.test(clean.svg), "hostile SVG is neutralized");
assert.equal(sanitizeSvg("<svg></svg>").ok, false);

// Research helpers.
assert.equal(cleanQuery("  dragon   castle \n"), "dragon castle");
assert.ok(buildSearchLinks("castle").every(link => link.url.startsWith("https://") && link.license));
assert.ok(Array.isArray(filterPolyHaven({ barrel_01: { name: "Barrel", tags: ["barrel", "wood"], categories: ["props"] } }, "wooden barrel", 3)));
assert.ok(formatResearchNotes({ topic: "castle", wiki: [], models: [], links: buildSearchLinks("castle") }).includes("castle"));

// Audio kit: runs against a mock AudioContext and never throws.
const calls = { osc: 0 };
const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {}, setTargetAtTime() {} });
const node = () => ({ connect() { return this; }, disconnect() {}, gain: param(), frequency: param(), Q: param(), detune: param(), pan: param(), start() {}, stop() {}, type: "", buffer: null, addEventListener() {}, onended: null });
class MockCtx { constructor() { this.currentTime = 0; this.destination = node(); this.state = "running"; this.sampleRate = 44100; }
  createOscillator() { calls.osc++; return node(); } createGain() { return node(); } createBiquadFilter() { return node(); } createStereoPanner() { return node(); }
  createBuffer(c, n) { return { getChannelData: () => new Float32Array(n) }; } createBufferSource() { return node(); } createDynamicsCompressor() { return node(); }
  resume() { return Promise.resolve(); } suspend() { return Promise.resolve(); } close() { return Promise.resolve(); } }
const sandbox = { window: {}, AudioContext: MockCtx, document: { addEventListener() {}, createElement: () => ({ style: {}, appendChild() {}, addEventListener() {}, setAttribute() {} }), body: { appendChild() {} } }, localStorage: { getItem() { return null; }, setItem() {} }, setTimeout, clearTimeout, setInterval, clearInterval, console, Math, Date };
sandbox.window = sandbox; sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(GENE_AUDIO_SOURCE, sandbox);
assert.ok(sandbox.GeneAudio && typeof sandbox.GeneAudio.sfx === "function", "GeneAudio is defined by the runtime kit");
for (const name of ["jump", "coin", "hit", "explosion", "win", "does-not-exist"]) assert.doesNotThrow(() => sandbox.GeneAudio.sfx(name));
assert.doesNotThrow(() => { sandbox.GeneAudio.music.start("tense"); sandbox.GeneAudio.music.stop(); sandbox.GeneAudio.setMuted(true); });
assert.ok(buildRuntimeKitScript().includes("GeneAudio"));
console.log("GENE 2.0 module tests passed (provider routing, code safety, SVG sanitizer, research, audio kit).");


// Cloud-build result contract: successful artifacts need matching identity and verifiable metadata.
const cloudBuildId = "12345678-1234-4234-9234-123456789abc";
const goodArtifact = (name) => ({
  status: "success",
  url: "https://gene-builds.blob.vercel-storage.com/" + (name === "windows" ? "GENE-" + cloudBuildId + "-Setup.exe" : "GENE-" + cloudBuildId + "-debug.apk"),
  filename: name === "windows" ? "GENE-" + cloudBuildId + "-Setup.exe" : "GENE-" + cloudBuildId + "-debug.apk",
  sizeBytes: 250000,
  sha256: "a".repeat(64),
  ...(name === "android" ? { signing: "debug" } : {})
});
const cloudReport = {
  buildId: cloudBuildId,
  state: "success",
  targets: { windows: goodArtifact("windows"), android: goodArtifact("android") },
  runUrl: "https://github.com/Mody2024/GENE/actions/runs/12345",
  completedAt: "2026-10-17T12:00:00.000Z",
  note: "verified test fixture"
};
assert.equal(validateCloudBuildReport(cloudReport, cloudBuildId).ok, true, "valid report with artifact evidence is accepted");
assert.equal(validateCloudBuildReport({ ...cloudReport, buildId: "----1234----1234----1234----1234" }, cloudBuildId).ok, false, "malformed build identifiers are rejected even when they have 36 characters");
assert.equal(validateCloudBuildReport({ ...cloudReport, buildId: cloudBuildId }, "----1234----1234----1234----1234").ok, false, "a malformed requested build identifier cannot validate a report");
const extraFieldReport = validateCloudBuildReport({ ...cloudReport, targets: { windows: { ...goodArtifact("windows"), accessToken: "must-not-be-exposed" }, android: goodArtifact("android") } }, cloudBuildId);
assert.equal(extraFieldReport.ok, true, "documented artifact evidence remains valid when unknown metadata is present");
assert.equal(extraFieldReport.ok && Object.hasOwn(extraFieldReport.report.targets.windows, "accessToken"), false, "unknown artifact metadata is stripped before the report reaches the browser");
assert.equal(validateCloudBuildReport({ ...cloudReport, runUrl: "https://github.com/Mody2024/GENE/issues/123" }, cloudBuildId).ok, false, "workflow evidence must link to an actual Actions run, not an arbitrary GitHub page");
assert.equal(validateCloudBuildReport({ ...cloudReport, targets: { windows: { status: "failure" }, android: goodArtifact("android") }, state: "partial" }, cloudBuildId).ok, false, "all target outcomes must use the expected artifact identity");
assert.equal(validateCloudBuildReport({ ...cloudReport, buildId: "87654321-1234-4234-9234-123456789abc" }, cloudBuildId).ok, false, "cross-build report substitution is rejected");
assert.equal(validateCloudBuildReport({ ...cloudReport, targets: { windows: { ...goodArtifact("windows"), sha256: "bad" }, android: goodArtifact("android") } }, cloudBuildId).ok, false, "successful artifacts without valid SHA-256 are rejected");
assert.equal(validateCloudBuildReport({ ...cloudReport, targets: { windows: { ...goodArtifact("windows"), url: "https://gene-builds.blob.vercel-storage.com/GENE-" + cloudBuildId + "-other.exe" }, android: goodArtifact("android") } }, cloudBuildId).ok, false, "download URL path must match the claimed artifact filename");
assert.equal(validateCloudBuildReport({ ...cloudReport, targets: { windows: { ...goodArtifact("windows"), url: "https://user@gene-builds.blob.vercel-storage.com/GENE-" + cloudBuildId + "-Setup.exe" }, android: goodArtifact("android") } }, cloudBuildId).ok, false, "artifact URLs with embedded credentials are rejected");
assert.equal(validateCloudBuildReport({ ...cloudReport, state: "partial" }, cloudBuildId).ok, false, "state cannot contradict successful target outcomes");
assert.equal(validateCloudBuildReport({ ...cloudReport, targets: { windows: { status: "failure", url: "https://evil.test/file.exe" } }, state: "failed" }, cloudBuildId).ok, false, "failed targets cannot expose untrusted downloads");
assert.equal(validateCloudBuildReport({ ...cloudReport, targets: { windows: goodArtifact("windows") }, state: "success", runUrl: "http://github.com/actions/run" }, cloudBuildId).ok, false, "workflow evidence must use HTTPS");
const buildRouteSource = readFileSync(new URL("../apps/web/app/api/builds/[buildId]/route.ts", import.meta.url), "utf8");
assert.ok(buildRouteSource.includes('String(item.display_title || "") === id'), "cloud build status must match the exact requested workflow run ID");
assert.ok(buildRouteSource.includes("GENE_BUILD_STATUS_UNAVAILABLE"), "GitHub API errors must be reported as unavailable rather than a fabricated queued state");
assert.ok(buildRouteSource.includes("Could not verify the cloud build result with GitHub"), "status lookup failures must be visible to the user");
console.log("GENE cloud-build report contract tests passed.");


// Build orchestration: skipped required work must never be mistaken for a successful build.
const orchestratorSource = readFileSync(new URL("../apps/web/app/lib/build-orchestrator.ts", import.meta.url), "utf8");
const orchestratorJs = ts.transpileModule(orchestratorSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
}).outputText;
const orchestratorUrl = "data:text/javascript;base64," + Buffer.from(orchestratorJs).toString("base64");
const { createBuildRun, setTaskStatus, resumeBuild, getReadyTasks } = await import(orchestratorUrl);
assert.throws(() => createBuildRun({ projectId: "empty", tasks: [] }), /at least one task/, "empty build plans are rejected instead of creating idle runs");
assert.throws(() => createBuildRun({ projectId: "bad-id", tasks: [{ id: " ", title: "Bad ID", kind: "design", acceptance: [] }] }), /stable identifiers/, "blank task IDs are rejected before dependency scheduling");
assert.throws(() => createBuildRun({ projectId: "bad-title", tasks: [{ id: "task-1", title: " ", kind: "design", acceptance: [] }] }), /non-empty title/, "tasks must have a meaningful visible title");
assert.throws(() => createBuildRun({ projectId: " ", tasks: [{ id: "task-1", title: "Task", kind: "design", acceptance: [] }] }), /Build project IDs/, "blank project IDs are rejected");
assert.throws(() => createBuildRun({ projectId: "bad-kind", tasks: [{ id: "task-1", title: "Task", kind: "invalid", acceptance: [] }] }), /kind is not supported/, "unsupported task kinds are rejected");
assert.throws(() => createBuildRun({ projectId: "bad-acceptance", tasks: [{ id: "task-1", title: "Task", kind: "design", acceptance: [1] }] }), /acceptance criteria/, "malformed acceptance criteria are rejected before execution");
const skippedRun = createBuildRun({
  projectId: "verification-test",
  now: "2026-10-17T12:00:00.000Z",
  tasks: [{ id: "required-check", title: "Required check", kind: "test", acceptance: ["must pass"] }]
});
const skippedResult = setTaskStatus(skippedRun, "required-check", "skipped", "2026-10-17T12:00:01.000Z");
assert.throws(() => setTaskStatus(skippedRun, "required-check", "passed", "2026-10-17T12:00:01.000Z"), /Invalid task status transition/, "queued tasks cannot be marked passed without running");
assert.notEqual(skippedResult.status, "completed", "a skipped required task must not produce completed status");
assert.equal(skippedResult.status, "needs-input", "skipped work should require an explicit decision");
const startedRun = setTaskStatus(skippedRun, "required-check", "running", "2026-10-17T12:00:01.000Z");
const passedRun = setTaskStatus(startedRun, "required-check", "passed", "2026-10-17T12:00:02.000Z");
assert.equal(passedRun.status, "completed", "a task that actually passes may complete the build");
assert.throws(() => setTaskStatus(passedRun, "required-check", "failed", "2026-10-17T12:00:03.000Z"), /Invalid task status transition/, "a passed task cannot be retroactively marked failed in the same run");
assert.throws(() => resumeBuild(passedRun), /completed build cannot be resumed/, "completed work cannot be reopened by the resume action");
const retryBase = createBuildRun({ projectId: "retry-test", now: "2026-10-17T12:00:03.000Z", tasks: [{ id: "retry-check", title: "Retry check", kind: "test", acceptance: ["must pass"] }] });
const retryStart = setTaskStatus(retryBase, "retry-check", "running", "2026-10-17T12:00:04.000Z");
const failedAttempt = setTaskStatus(retryStart, "retry-check", "failed", "2026-10-17T12:00:05.000Z", "temporary runtime error");
const retried = resumeBuild(failedAttempt, "2026-10-17T12:00:06.000Z");
assert.equal(retried.tasks[0].status, "queued", "resume requeues failed work instead of leaving an active run with no runnable task");
assert.deepEqual(getReadyTasks(retried).map(task => task.id), ["retry-check"], "retried failed work becomes ready again");
const blockedStart = setTaskStatus(skippedRun, "required-check", "blocked", "2026-10-17T12:00:07.000Z", "missing user input");
assert.throws(() => resumeBuild(blockedStart), /blocked tasks that need user input/, "resume does not silently bypass a blocked task");
console.log("GENE build-orchestrator completion and recovery tests passed.");


// GENE identity: light-first default, persistent explicit theme choice, and restrained genie-inspired accents.
const themePage = readFileSync(new URL("../apps/web/app/page.tsx", import.meta.url), "utf8");
assert.ok(themePage.includes("analyzeProjectScripts(safetyFiles, { scopeChecks: true })") && themePage.includes("Runtime identifier safety"), "workspace build checks expose the same conservative runtime identifier analysis used by the build API");
assert.ok(themePage.includes("/\\.(?:m?js|cjs)$/i.test(path)") && themePage.includes("syntaxFiles.length + \" JavaScript file(s) parse without executing them.\""), "workspace syntax QA checks every JavaScript module rather than only game.js");
assert.ok(["Project file paths", "Source size budget", "Self-contained runtime"].every(label => themePage.includes('add("' + label + '"')), "workspace quality gate checks safe paths, source budgets and self-contained runtime constraints");
assert.ok(themePage.includes("inspectProjectFilePaths(allPaths)"), "workspace and cloud builder use the shared cross-platform file path policy");
assert.ok(themePage.includes("const allJavaScript = fileEntries.filter(([path, source]) => /\\.(?:m?js|cjs)$/i.test(path)"), "external-runtime and inline-script checks inspect CommonJS modules too");
const cloudBuildRoute = readFileSync(new URL("../apps/web/app/api/builds/route.ts", import.meta.url), "utf8");
assert.ok(cloudBuildRoute.includes("normalizeProjectFilePath(value)") && cloudBuildRoute.includes("path.normalize(\"NFC\").toLowerCase()") && cloudBuildRoute.includes("inspectProjectFilePaths(files.map(file => file.path))"), "cloud build rejects unsafe, conflicting, case- and Unicode-colliding paths");
const cloudWorkerSource = readFileSync(new URL("../scripts/cloud-build.mjs", import.meta.url), "utf8");
assert.ok(cloudWorkerSource.includes("normalizeProjectFilePath(value)") && cloudWorkerSource.includes("inspectProjectFilePaths(payload.files.map(item=>item&&item.path))"), "the cloud worker revalidates path safety and collisions before writing decrypted files");
assert.ok(cloudBuildRoute.includes('files.some(file => file.path === "index.html")'), "cloud builds require the exact canonical index.html entry point");
const agentRoute = readFileSync(new URL("../apps/web/app/api/agent/route.ts", import.meta.url), "utf8");
const codeSafetySource = readFileSync(new URL("../apps/web/app/lib/code-safety.mjs", import.meta.url), "utf8");
assert.ok(agentRoute.includes("inspectProjectFilePaths(normalized.map(file => file.path))") && agentRoute.includes("normalizeProjectFilePath(value).ok"), "AI-generated files use the same portable path and collision policy as workspace QA and cloud packaging");
assert.ok(agentRoute.includes("/\\.(?:m?js|cjs)$/i.test(file.path)") && codeSafetySource.includes("/\\.(?:m?js|cjs)$/i.test(file.path)"), "server syntax checks and static identifier analysis include .js, .mjs and .cjs files");
assert.ok(agentRoute.includes("const runtimeSource = Object.entries(byPath).filter(([path, content]) => /\\.(?:m?js|cjs)$/i.test(path)"), "audio and gameplay-control contract checks inspect all executable module extensions");
assert.ok(agentRoute.includes("path.normalize(\"NFC\").toLowerCase()"), "additionalFiles declarations reject case/Unicode-equivalent duplicate paths");
assert.ok(cloudBuildRoute.includes('method: "DELETE" }).catch(() => null);') && cloudBuildRoute.includes("temporary source branch was cleaned up"), "failed build dispatch attempts to remove the temporary encrypted source branch");
assert.ok(["Win / loss state hooks", "Restart / reset hooks", "Pause / resume hooks"].every(label => themePage.includes('add("' + label + '"')), "game QA reports recognizable outcome, restart and pause paths without claiming they are playtested");
const themeLayout = readFileSync(new URL("../apps/web/app/layout.tsx", import.meta.url), "utf8");
const themeCss = readFileSync(new URL("../apps/web/app/studio-redesign.css", import.meta.url), "utf8");
assert.ok(themePage.includes('useState<"light" | "dark">("light")'), "new workspaces default to the light theme");
assert.ok(themePage.includes('localStorage.getItem("gene.theme")') && themePage.includes('localStorage.setItem("gene.theme", theme)'), "user theme choice remains persisted");
assert.ok(themePage.includes("if (!themeReady) return") && themePage.includes("[theme, themeReady]"), "saved theme is read before the default theme can overwrite it");
assert.ok(themePage.includes("IDEAS, BROUGHT TO LIFE"), "GENE welcome screen carries its own concise creation-focused identity");
assert.ok(themeLayout.includes('data-theme="light"'), "the document starts light to avoid a dark first-paint flash");
assert.ok(themeCss.includes("--studio-accent:#3e795f") && themeCss.includes("rgba(211,166,82,.07)"), "GENE light theme uses restrained green and warm-gold identity tokens");
assert.ok(themeCss.includes("--studio-accent:#b7d9c2") && themeCss.includes("rgba(211,166,82,.055)") && !themeCss.includes("#bbb2ff"), "dark theme uses muted forest-green and warm-gold tokens instead of the old purple accent");
assert.ok(themePage.includes("GENE genie lamp and wish spark mark") && themePage.includes("gene-logo-spark") && themePage.includes("gene-logo-orbit") && themePage.includes("viewBox=\"0 0 48 48\""), "GENE brand mark uses a custom genie lamp, wish spark and orbit");
assert.ok(themeCss.includes(".studio-v2 .brand:focus-visible"), "the brand home control has a visible keyboard focus state");

console.log("GENE light-first genie identity tests passed.");

const modelingPromptSource = readFileSync(new URL("../apps/web/app/lib/prompts.ts", import.meta.url), "utf8");
const agentRouteSource = readFileSync(new URL("../apps/web/app/api/agent/route.ts", import.meta.url), "utf8");
assert.ok(agentRouteSource.includes("fallbackTitle") && agentRouteSource.includes("fallbackEngine"), "agent normalizer recovers missing plan title and engine from trusted project context");
assert.ok(agentRouteSource.includes("GeneAudio.music.start") && agentRouteSource.includes("GeneAudio.createSettingsPanel"), "fallback game builders receive the runtime audio contract required by build validation");
assert.ok(agentRouteSource.includes("FINAL GAME BUILD CONTRACT") && agentRouteSource.includes("plan.title, plan.summary and plan.engine"), "primary and fallback build requests repeat required plan and playable-game deliverables");
assert.ok(agentRouteSource.includes("perCallMs: isBuild ? 12_000 : 7_000") && agentRouteSource.includes("maxAttempts: isBuild ? 4 : 7"), "whole-game fallback attempts get a realistic generation window within the overall request deadline");
assert.ok(agentRouteSource.includes("plan.description") && agentRouteSource.includes("input.reply.trim().slice(0, 600)"), "agent normalizer fills a missing plan summary without discarding an otherwise usable game build");
const researchRouteSource = readFileSync(new URL("../apps/web/app/api/research/route.ts", import.meta.url), "utf8");
assert.ok(modelingPromptSource.includes("GENE PRO-GAME QUALITY BAR"), "game build prompts enforce a production-quality vertical-slice bar");
assert.ok(modelingPromptSource.includes("GAMEPLAY FIRST") && modelingPromptSource.includes("PRO ART DIRECTION"), "game prompts prioritize playable mechanics and cohesive art direction");
assert.ok(modelingPromptSource.includes("ENGINE INTEGRITY") && modelingPromptSource.includes("QA BEFORE RETURN"), "game prompts require engine-specific implementation and a boot-to-ending audit");
assert.ok(researchRouteSource.includes("Promise.all([wikipedia(wikiQuery), polyHavenCatalog()])"), "game research fetches the real Poly Haven asset catalogue rather than skipping 3D assets");
assert.ok(modelingPromptSource.includes("REAL 3D MODEL PIPELINE") && modelingPromptSource.includes("modelRequests") && modelingPromptSource.includes("GENE3D.parseOBJ"), "3D builds explicitly request real Forge meshes and wire OBJ/MTL geometry into the renderer");
assert.ok(modelingPromptSource.includes("DETAILED EDIT PRESERVATION") && modelingPromptSource.includes("SELF-REPAIR AND TASK DECOMPOSITION"), "detailed changes preserve unrelated systems and large failures have a module-splitting recovery contract");
assert.ok(themePage.includes("shouldSplitLongGameTask") && themePage.includes("gameplay-core.js") && themePage.includes("gameplay-ui.js"), "truncated game.js output automatically splits into two dependency-aware modules and retries integration");
assert.ok(themePage.includes("Attached real research before generation") && themePage.includes('spec.modelingStatus = generatedModels.length ? "forge-generated-obj-mtl"'), "research is awaited before a build and actual Forge asset generation is recorded honestly");
assert.ok(themePage.includes("hasSource && asksForChange") && themePage.includes('operation = "edit"'), "specific changes typed in Chat are routed to source edits for existing projects");
assert.ok(themePage.includes("skip (?:the )?interview") && themePage.includes('operation = "interview"'), "new builds start the interview unless the user explicitly opts out");
