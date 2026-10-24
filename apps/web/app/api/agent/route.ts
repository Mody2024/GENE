import { NextRequest, NextResponse } from "next/server";
import { AGENT_SYSTEM, makeAgentInput } from "../../lib/prompts";
import type { AgentResponse } from "../../lib/types";
import { applyPatchBatch } from "../../lib/patch-engine";
import { ensurePlanMechanics, ensurePlanTasks } from "../../lib/plan-contract.mjs";
import { extractJsonObjectText, hasAlternateProviderKeys, runAlternateChain } from "../../lib/providers";
import { analyzeProjectScripts } from "../../lib/code-safety.mjs";
import { normalizeProjectFilePath, inspectProjectFilePaths } from "../../lib/project-file-safety.mjs";
import { nextInterviewQuestion } from "../../lib/design-doc";
import { createNativeResult } from "../../../lib/native-generator.mjs";
import { hasToolApproval } from "../../lib/tool-permissions.mjs";

export const runtime = "nodejs";
export const maxDuration = 60;

const CORE_FILES = new Set(["game.html", "game.css", "game.js", "game-spec.json"]);
const MAX_PROJECT_FILES = 100;
function isSafeProjectPath(value: unknown): value is string {
  if (!normalizeProjectFilePath(value).ok || typeof value !== "string") return false;
  const extension = value.slice(value.lastIndexOf(".") + 1).toLowerCase();
  return new Set(["html","css","js","mjs","cjs","json","svg","png","jpg","jpeg","webp","gif","obj","mtl","glsl","txt","md","gd","ts","wav","mp3","ogg","woff","woff2"]).has(extension);
}
const requestBuckets = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 18;
const RATE_WINDOW_MS = 60_000;

function jsonError(message: string, status = 400, code = "GENE_REQUEST_ERROR") {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}

function getGeminiKeys(): string[] {
  const configured = [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
    process.env.GEMINI_API_KEY_4,
    process.env.GEMINI_API_KEY_5,
    ...(process.env.GEMINI_API_KEYS || "").split(",").flatMap(value => value.split(";")).flatMap(value => value.split(String.fromCharCode(10)))
  ];
  return [...new Set(configured.map(key => key?.trim()).filter((key): key is string => Boolean(key)))];
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function describeGeminiFailure(status: number, detail: string, attempts: number): { code: string; message: string } {
  if (status === 429 || /resource_exhausted|quota exceeded|rate.?limit/i.test(detail)) {
    return {
      code: "GEMINI_QUOTA_EXHAUSTED",
      message: "Gemini rejected the request because a quota or rate limit was reached after " + attempts + " attempt(s). " +
        "GENE tried the configured fallback path. Add keys from separate Google Cloud projects with available Gemini quota, or wait for the limit to reset / enable billing. " +
        "More detail: " + detail + ". No files were changed."
    };
  }
  if (status === 503 || /overloaded|high demand|temporarily unavailable/i.test(detail)) {
    return {
      code: "GEMINI_CAPACITY_BUSY",
      message: "Gemini is temporarily overloaded. GENE tried its configured fallback path " + attempts + " time(s), but no attempt succeeded. Please retry shortly. No files were changed. Detail: " + detail
    };
  }
  if (status === 401 || status === 403) {
    return {
      code: "GEMINI_KEY_REJECTED",
      message: "Gemini rejected the configured API key(s). Verify that each key is valid, its Generative Language API access is enabled, and its Google Cloud project is permitted to use the selected model. No files were changed. Detail: " + detail
    };
  }
  return {
    code: "GEMINI_API_ERROR",
    message: "Gemini request failed after " + attempts + " attempt(s) (HTTP " + status + "): " + detail + ". No files were changed."
  };
}

function parseModelJson(text: string): AgentResponse {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const value = JSON.parse(cleaned);
  if (!value || typeof value !== "object" || typeof value.reply !== "string") {
    throw new Error("The AI response did not match GENE's response contract.");
  }
  value.files = Array.isArray(value.files) ? value.files : [];
  value.question = value.question || null;
  value.plan = value.plan || null;
  return value as AgentResponse;
}

function normalizeAgentResult(input: AgentResponse, operation: string, existingPlan?: AgentResponse["plan"], projectKind: "game" | "app" = "game", fallbackTitle = "Untitled Project", fallbackEngine: "canvas2d" | "webgl3d" | "webapp" = projectKind === "app" ? "webapp" : "canvas2d"): AgentResponse {
  if (typeof input.reply !== "string" || !input.reply.trim()) throw new Error("GENE response needs a non-empty user-facing reply.");
  const result: AgentResponse = {
    reply: input.reply.trim(),
    files: Array.isArray(input.files) ? input.files : [],
    question: null,
    plan: null,
    complete: Boolean(input.complete),
    needsUserDecision: Boolean(input.needsUserDecision)
  };

  if (input.question != null) {
    const q = input.question as any;
    if (!q || typeof q !== "object" || typeof q.text !== "string" || !q.text.trim()) {
      throw new Error("The interview question was malformed; it must contain one clear question.");
    }
    if (typeof q.id !== "string" || !q.id.trim()) throw new Error("The interview question is missing its stable id.");
    result.question = {
      id: q.id.trim().slice(0, 100),
      text: q.text.trim().slice(0, 1400),
      ...(typeof q.why === "string" && q.why.trim() ? { why: q.why.trim().slice(0, 800) } : {}),
      ...(Array.isArray(q.choices) ? { choices: q.choices.filter((choice: unknown): choice is string => typeof choice === "string" && choice.trim().length > 0).slice(0, 8).map((choice: string) => choice.trim().slice(0, 180)) } : {}),
      ...(typeof q.recommended === "string" && q.recommended.trim() ? { recommended: q.recommended.trim().slice(0, 180) } : {}),
      ...(q.multi === true ? { multi: true } : {}),
      ...(Number.isInteger(q.step) && Number.isInteger(q.total) && q.step >= 1 && q.total >= q.step && q.total <= 20 ? { step: q.step, total: q.total } : {})
    };
  }

  if (input.plan != null) {
    const plan = input.plan as any;
    if (!plan || typeof plan !== "object") throw new Error("The implementation plan was malformed.");
    // Repair recoverable omissions from trusted project context instead of rejecting
    // an otherwise useful build before the source can reach validation.
    if (typeof plan.title !== "string" || !plan.title.trim()) {
      plan.title = typeof existingPlan?.title === "string" && existingPlan.title.trim()
        ? existingPlan.title.trim()
        : fallbackTitle.trim().slice(0, 100) || "Untitled Project";
    }
    if (typeof plan.summary !== "string" || !plan.summary.trim()) {
      plan.summary = typeof plan.description === "string" && plan.description.trim()
        ? plan.description.trim()
        : input.reply.trim().slice(0, 600);
    }
    if (!["canvas2d", "webgl3d", "webapp"].includes(plan.engine)) {
      plan.engine = existingPlan?.engine || fallbackEngine;
    }
    const validEngine = projectKind === "app" ? plan.engine === "webapp" : (plan.engine === "canvas2d" || plan.engine === "webgl3d");
    if (!validEngine) throw new Error(projectKind === "app" ? "Web app plans must use the webapp engine." : "Game plans must use canvas2d or webgl3d.");
    if (plan.kind && plan.kind !== projectKind) throw new Error("The plan project kind does not match the current project.");
    const tasks = ensurePlanTasks(plan.tasks, projectKind);
    const mechanics = ensurePlanMechanics(plan.mechanics, projectKind);
    const budget = plan.performanceBudget || {};
    const targetFps = Number(budget.targetFps ?? 60);
    const maxEnemies = Number(budget.maxEnemies ?? 0);
    const maxObjects = Number(budget.maxObjects ?? 200);
    const maxParticles = Number(budget.maxParticles ?? 0);
    if (![targetFps, maxEnemies, maxObjects, maxParticles].every(Number.isFinite)) throw new Error("The plan performance budget is malformed.");
    if (targetFps < 30 || targetFps > 120 || maxEnemies < 0 || maxEnemies > 40 || maxObjects < 0 || maxObjects > 1200 || maxParticles < 0 || maxParticles > 300) {
      throw new Error("The plan exceeds GENE's supported performance budget.");
    }
    result.plan = {
      title: plan.title.trim().slice(0, 140),
      summary: plan.summary.trim().slice(0, 3000),
      kind: projectKind,
      engine: plan.engine,
      tasks,
      mechanics,
      performanceBudget: { targetFps, maxEnemies: Math.floor(maxEnemies), maxObjects: Math.floor(maxObjects), maxParticles: Math.floor(maxParticles) }
    };
  }

  if (operation === "interview") {
    if (result.question && result.plan) throw new Error("Interview must return either one next question or a completed plan, not both.");
    if (!result.question && !result.plan) throw new Error("Interview must return exactly one next question or a completed plan.");
  }
  if (operation === "plan" && !result.plan) throw new Error("Planning response is missing its structured plan. No files were changed.");
  if ((operation === "build" || operation === "surprise") && !result.plan && existingPlan) result.plan = existingPlan;
  if (operation === "build" || operation === "surprise") {
    if (!result.plan) throw new Error("Build response is missing its implementation plan.");
    if (!Array.isArray(result.files) || result.files.length < 4) throw new Error("Build response is missing required core project files.");
  }
  const fileCount = Array.isArray(result.files) ? result.files.length : 0;
  if (fileCount > MAX_PROJECT_FILES) throw new Error("This operation returned more than " + MAX_PROJECT_FILES + " files. Split the change into dependency-aware batches.");

  return result;
}

function ensureProjectSpecTitle(
  files: Array<{ path: string; content: string }>,
  candidates: Array<unknown>
): Array<{ path: string; content: string }> {
  const specFile = files.find(file => file.path === "game-spec.json");
  if (!specFile) return files;
  let spec: any;
  try { spec = JSON.parse(specFile.content); } catch { return files; }
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) return files;
  if (typeof spec.title === "string" && spec.title.trim()) return files;

  const strings = candidates
    .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
    .map(value => value.trim());
  const fallback = strings.find(value => !/^untitled\s+(game|app)$/i.test(value));
  const title = (fallback || strings[0] || "Untitled Project")
    .split(/[.!?\n]/)[0].trim().slice(0, 100) || "Untitled Project";
  spec.title = title;
  return files.map(file => file.path === "game-spec.json" ? { ...file, content: JSON.stringify(spec, null, 2) } : file);
}

function normalizeExecutableHtmlScripts(files: Array<{ path: string; content: string }>): Array<{ path: string; content: string }> {
  const htmlFile = files.find(file => file.path === "game.html");
  const jsFile = files.find(file => file.path === "game.js");
  if (!htmlFile || !jsFile || !/<script\b/i.test(htmlFile.content)) return files;
  const extracted: string[] = [];
  const html = htmlFile.content.replace(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi, (_whole, attrs: string, body: string) => {
    if (/\bsrc\s*=/i.test(attrs)) return "";
    if (/\btype\s*=\s*["'](?:application\/json|application\/ld\+json)["']/i.test(attrs)) return "";
    if (body.trim()) extracted.push(body.trim());
    return "";
  });
  if (/<script\b/i.test(html)) {
    throw new Error("Build rejected: external or unsupported script tags are not allowed in game.html. Put executable source in game.js.");
  }
  let js = jsFile.content;
  for (const script of extracted) {
    if (!js.includes(script)) js += "\n\n/* Migrated from inline HTML script for GENE runtime compatibility */\n" + script + "\n";
  }
  return files.map(file => file.path === "game.html" ? { ...file, content: html } : file.path === "game.js" ? { ...file, content: js } : file);
}

function validateFiles(files: Array<{ path: string; content: string }>, operation: string, plannedEngine?: string, mode?: string, projectKind: "game" | "app" = "game", enforceAudioContract = true) {
  if (!Array.isArray(files)) throw new Error("AI returned no file list.");
  if (mode === "plan" && files.length > 0) throw new Error("Plan mode is read-only. The model returned source files and they were rejected.");
  if ((operation === "plan" || operation === "interview" || operation === "research") && files.length > 0) {
    throw new Error("Plan/research mode is read-only. Source file output was rejected.");
  }
  if (files.length > MAX_PROJECT_FILES) throw new Error("Project exceeds " + MAX_PROJECT_FILES + " files. Split the build into smaller dependency-aware batches.");
  const normalized: Array<{ path: string; content: string }> = [];
  const seen = new Set<string>();
  let totalCharacters = 0;
  for (const file of files) {
    if (!file || typeof file.path !== "string" || typeof file.content !== "string") throw new Error("A generated file was malformed.");
    if (!isSafeProjectPath(file.path)) throw new Error("Blocked unsafe or unsupported generated path: " + file.path);
    if (seen.has(file.path)) throw new Error("The model returned duplicate source path: " + file.path);
    seen.add(file.path);
    if (file.content.length > 500_000) throw new Error("Generated file exceeds the 500 KB safety limit.");
    totalCharacters += file.content.length;
    if (totalCharacters > 8_000_000) throw new Error("Project text exceeds the 8 MB safety budget. Keep large assets as files rather than embedding them into source.");
    normalized.push(file);
  }
  // Salvage a common model formatting mistake: move executable inline scripts
  // from game.html into the required game.js file before syntax/runtime validation.
  // Keep JSON-LD/data scripts untouched, and leave external script tags for the
  // existing external-dependency validator to reject.
  if (projectKind === "game") {
    const htmlFile = normalized.find(file => file.path === "game.html");
    const jsFile = normalized.find(file => file.path === "game.js");
    if (htmlFile && jsFile) {
      const inlineScripts: string[] = [];
      htmlFile.content = htmlFile.content.replace(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi, (tag, rawAttrs: string, source: string) => {
        const attrs = String(rawAttrs || "");
        if (/\bsrc\s*=/.test(attrs) || /\btype\s*=\s*["'](?:application\/json|application\/ld\+json)["']/i.test(attrs)) return tag;
        if (source.trim()) inlineScripts.push(source.trim());
        return "";
      });
      if (inlineScripts.length) jsFile.content = inlineScripts.join("\n;\n") + "\n;\n" + jsFile.content;
    }
  }
  const pathReport = inspectProjectFilePaths(normalized.map(file => file.path));
  if (!pathReport.ok) {
    const conflict = pathReport.collisions[0];
    if (conflict) throw new Error("Generated project paths conflict: " + conflict.path + " conflicts with " + conflict.duplicateOf + ".");
    throw new Error("Generated project contains an invalid or non-portable file path.");
  }
  for (const file of normalized) {
    if (/\.(?:m?js|cjs)$/i.test(file.path)) new Function(file.content);
    if (file.path === "game-spec.json") JSON.parse(file.content);
  }
  // Generated-code safety pass. Repairs the most common runtime crash deterministically
  // (a collection declared without a value, e.g. `let hazards;`, later used as an array) and,
  // only when the COMPLETE project is present, rejects names that are used but never declared
  // or declared in a different scope. A partial file list (single stage, edit) skips scope checks.
  {
    const safety = analyzeProjectScripts(normalized, { scopeChecks: operation === "build" || operation === "surprise" });
    for (const repaired of safety.repaired) {
      const target = normalized.find(file => file.path === repaired.path);
      if (target) {
        new Function(repaired.content);
        target.content = repaired.content;
      }
    }
    if (safety.errors.length) {
      throw new Error("Build rejected: the generated JavaScript would crash at runtime. " + safety.errors.slice(0, 3).map(error => error.message).join(" | ") + " No files were saved.");
    }
  }
  if (operation === "build" || operation === "surprise") {
    const byPath = Object.fromEntries(normalized.map(f => [f.path, f.content]));
    // Self-heal: a missing/empty stylesheet is cosmetic, so supply a minimal full-viewport default instead of rejecting the build.
    if (projectKind === "game" && (!byPath["game.css"] || byPath["game.css"].trim().length < 8) && byPath["game.html"] && byPath["game.js"]) {
      const defaultCss = "html, body { margin: 0; height: 100%; background: #0b0b0c; color: #ededee; font-family: system-ui, sans-serif; overflow: hidden; }\n#game-canvas, canvas { display: block; width: 100%; height: 100%; touch-action: none; }\n";
      const cssFile = normalized.find(file => file.path === "game.css");
      if (cssFile) cssFile.content = defaultCss; else normalized.push({ path: "game.css", content: defaultCss });
      byPath["game.css"] = defaultCss;
    }
    for (const path of ["game.html", "game.css", "game.js", "game-spec.json"]) {
      if (!byPath[path] || byPath[path].trim().length < 8) throw new Error("Build rejected: required project file " + path + " is missing or empty.");
    }
    new Function(byPath["game.js"]);
    const spec = JSON.parse(byPath["game-spec.json"]);
    if (!spec || typeof spec !== "object" || Array.isArray(spec)) throw new Error("Build rejected: project spec must be a JSON object.");
    // Self-heal a declared-but-missing module instead of discarding an otherwise good build.
    // A model often lists src/systems/renderer.js in the blueprint but never emits it. We register a safe,
    // empty placeholder under window.GeneModules so load order and references stay valid; runtime repair can fill it in.
    if (projectKind === "game") {
      const declaredModules: string[] = [];
      const archModules = spec.architecture && typeof spec.architecture === "object" && Array.isArray(spec.architecture.modules) ? spec.architecture.modules : [];
      for (const entry of archModules) {
        const candidate = typeof entry === "string" ? entry : entry && typeof entry === "object" ? entry.path : "";
        if (typeof candidate === "string") declaredModules.push(candidate.trim());
      }
      if (Array.isArray(spec.additionalFiles)) for (const candidate of spec.additionalFiles) if (typeof candidate === "string") declaredModules.push(candidate.trim());
      const healed: string[] = [];
      for (const modulePath of declaredModules) {
        if (!/\.(?:m?js|cjs)$/i.test(modulePath) || CORE_FILES.has(modulePath) || !isSafeProjectPath(modulePath)) continue;
        if (typeof byPath[modulePath] === "string" && byPath[modulePath].trim().length >= 8) continue;
        if (normalized.length >= MAX_PROJECT_FILES) break;
        const moduleKey = modulePath.replace(/^.*\//, "").replace(/\.[^.]+$/, "");
        const stub = "/* GENE auto-placeholder: " + modulePath + " was declared but not generated. */\n(function (root) {\n  root.GeneModules = root.GeneModules || {};\n  root.GeneModules[" + JSON.stringify(moduleKey) + "] = root.GeneModules[" + JSON.stringify(moduleKey) + "] || {};\n})(typeof window !== \"undefined\" ? window : this);\n";
        const existingFile = normalized.find(file => file.path === modulePath);
        if (existingFile) existingFile.content = stub; else normalized.push({ path: modulePath, content: stub });
        byPath[modulePath] = stub;
        healed.push(modulePath);
      }
      if (healed.length) {
        const known = new Set<string>(Array.isArray(spec.additionalFiles) ? spec.additionalFiles.filter((item: unknown) => typeof item === "string") : []);
        spec.additionalFiles = [...(Array.isArray(spec.additionalFiles) ? spec.additionalFiles : []), ...healed.filter(path => !known.has(path))];
        spec.healedModules = healed;
        byPath["game-spec.json"] = JSON.stringify(spec, null, 2);
        const healedSpecFile = normalized.find(file => file.path === "game-spec.json");
        if (healedSpecFile) healedSpecFile.content = byPath["game-spec.json"];
      }
    }
    // Treat the architecture blueprint as an executable contract, not documentation:
    // validate module paths and merge them into the runtime manifest in blueprint order.
    if (spec.architecture !== undefined) {
      if (!spec.architecture || typeof spec.architecture !== "object" || Array.isArray(spec.architecture)) {
        throw new Error("Build rejected: architecture must be an object.");
      }
      const modules = spec.architecture.modules;
      if (modules !== undefined) {
        if (!Array.isArray(modules) || modules.length > MAX_PROJECT_FILES - CORE_FILES.size) {
          throw new Error("Build rejected: architecture.modules must be a bounded ordered array.");
        }
        const modulePaths: string[] = [];
        const seenModules = new Set<string>();
        for (const entry of modules) {
          const rawModulePath = typeof entry === "string" ? entry : entry && typeof entry === "object" ? entry.path : "";
          const modulePath = typeof rawModulePath === "string" ? rawModulePath.trim() : rawModulePath;
          // Descriptive entries (no path, non-JS path, or a core file) are documentation, not loadable modules: skip them.
          // Only genuinely unsafe JavaScript paths (traversal, absolute, reserved) fail the build.
          if (typeof modulePath !== "string" || !/\.(?:m?js|cjs)$/i.test(modulePath) || CORE_FILES.has(modulePath)) continue;
          if (!isSafeProjectPath(modulePath)) {
            throw new Error("Build rejected: every architecture module must have a safe relative JavaScript path.");
          }
          const canonicalPath = modulePath.normalize("NFC").toLowerCase();
          if (seenModules.has(canonicalPath)) throw new Error("Build rejected: architecture.modules contains duplicate paths: " + modulePath);
          seenModules.add(canonicalPath);
          if (typeof byPath[modulePath] !== "string" || byPath[modulePath].trim().length < 8) {
            throw new Error("Build rejected: architecture module " + modulePath + " is missing from the assembled project.");
          }
          modulePaths.push(modulePath);
        }
        const existing = Array.isArray(spec.additionalFiles) ? spec.additionalFiles : [];
        spec.additionalFiles = [...modulePaths, ...existing.filter((path: unknown) => typeof path === "string" && !seenModules.has(String(path).normalize("NFC").toLowerCase()))];
        byPath["game-spec.json"] = JSON.stringify(spec, null, 2);
        const normalizedSpecFile = normalized.find(file => file.path === "game-spec.json");
        if (normalizedSpecFile) normalizedSpecFile.content = byPath["game-spec.json"];
      }
    }
    if (spec.additionalFiles !== undefined) {
      if (!Array.isArray(spec.additionalFiles) || spec.additionalFiles.length > MAX_PROJECT_FILES - CORE_FILES.size) {
        throw new Error("Build rejected: additionalFiles must be a bounded array of relative project paths.");
      }
      const seenAdditional = new Set<string>();
      for (const path of spec.additionalFiles) {
        const canonicalPath = typeof path === "string" ? path.normalize("NFC").toLowerCase() : "";
        if (!isSafeProjectPath(path) || CORE_FILES.has(path) || seenAdditional.has(canonicalPath)) {
          throw new Error("Build rejected: additionalFiles contains an unsafe, duplicate, or core path.");
        }
        seenAdditional.add(canonicalPath);
        if (typeof byPath[path] !== "string" || byPath[path].trim().length < 8) {
          throw new Error("Build rejected: declared project module/asset " + path + " is missing from the assembled project.");
        }
      }
    }
    if (typeof spec.title !== "string" || !spec.title.trim()) throw new Error("Build rejected: project spec needs a title.");
    if (spec.kind && spec.kind !== projectKind) throw new Error("Build rejected: project spec kind does not match the selected project type.");
    const allowedEngine = projectKind === "app" ? spec.engine === "webapp" : (spec.engine === "canvas2d" || spec.engine === "webgl3d");
    if (!allowedEngine) throw new Error(projectKind === "app" ? "Build rejected: an app must declare engine=webapp." : "Build rejected: a game must use canvas2d or webgl3d.");
    if (plannedEngine && spec.engine !== plannedEngine) throw new Error("Build rejected: project spec engine does not match the approved plan engine.");
    let html = byPath["game.html"];
    const css = byPath["game.css"];
    const js = byPath["game.js"];
    // Input often lives in a generated module (for example src/systems/input.js), not game.js.
    // Validate the complete assembled JavaScript project so valid modular controls are not rejected.
    const runtimeSource = Object.entries(byPath).filter(([path, content]) => /\.(?:m?js|cjs)$/i.test(path) && typeof content === "string").map(([, content]) => content).join("\n");
    // The sandbox and downloadable runtime use ordered classic scripts, not a bundler.
    // Enforce a real project manifest so independently named modules load predictably.
    if (projectKind === "game") {
      const declared = Array.isArray(spec.additionalFiles) ? spec.additionalFiles : [];
      const extraScripts = Object.keys(byPath).filter(path => path !== "game.js" && /\.(?:m?js|cjs)$/i.test(path) && !/(^|\/)node_modules\//i.test(path));
      const duplicateDeclared = declared.filter((path: unknown, index: number) => typeof path === "string" && declared.indexOf(path) !== index);
      if (duplicateDeclared.length) throw new Error("Build rejected: game-spec.json additionalFiles contains duplicate paths: " + duplicateDeclared.join(", "));
      const invalidDeclared = declared.filter((path: unknown) => typeof path !== "string" || !/\.(?:m?js|cjs)$/i.test(path) || !Object.prototype.hasOwnProperty.call(byPath, path));
      if (invalidDeclared.length) throw new Error("Build rejected: additionalFiles must list existing JavaScript module paths only. Invalid entries: " + invalidDeclared.map(String).join(", "));
      const undeclaredScripts = extraScripts.filter(path => !declared.includes(path));
      if (undeclaredScripts.length) throw new Error("Build rejected: every extra JavaScript module must be declared in game-spec.json additionalFiles in dependency/load order: " + undeclaredScripts.join(", "));
      if (/^\s*(?:import\s+(?:[^(']|\{)|export\s+)/m.test(extraScripts.map(path => byPath[path]).join("\n"))) {
        throw new Error("Build rejected: runtime modules currently load as ordered sandboxed classic scripts, not native ES modules. Expose module APIs through window.GeneModules, keyed by the module filename without extension, and declare load order in game-spec.json additionalFiles; do not use import/export syntax.");
      }
    }
    if (projectKind === "game" && enforceAudioContract) {
      const audio = spec.audio;
      const buses = Array.isArray(audio?.buses) ? audio.buses.map((item: unknown) => String(item).toLowerCase()) : [];
      const events = audio?.events && typeof audio.events === "object" && !Array.isArray(audio.events) ? Object.entries(audio.events) : [];
      const hasPlaybackApi = /\bnew\s+(?:window\.)?(?:AudioContext|webkitAudioContext|Audio)\s*\(|new\s*\(\s*(?:window\.)?(?:AudioContext|webkitAudioContext)\b|document\.createElement\s*\(\s*["\x27]audio["\x27]\s*\)/i.test(runtimeSource);
      const soundCalls = runtimeSource.match(/\b(?:playSfx|playSound|triggerSound|playAudio)\s*\(/g) || [];
      const hasConnectedSoundEvents = soundCalls.length >= 2 && /\b(?:soundManager|audioManager|playSfx|playSound|triggerSound|playAudio)\b/i.test(runtimeSource);
      const hasSoundOutput = /\.(?:start|play)\s*\(/i.test(runtimeSource) || /\b(?:playTone|playBeep|synthesizeTone|scheduleSound|startOscillator)\s*\(/i.test(runtimeSource);
      // Accept equivalent real music paths (Web Audio nodes or media elements),
      // not just one preferred helper name, while still requiring actual playback.
      const hasMusicPlayback = /\b(?:startMusic|playMusic|musicLoop|musicGain|startProceduralMusic|beginMusic|startBgm|playBgm|startBackgroundMusic|playBackgroundMusic|musicSource|musicOscillator|musicNode|bgmPlayer|musicPlayer)\b/i.test(runtimeSource) ||
        /(?:music|bgm|backgroundMusic)[A-Za-z0-9_$]*\.(?:start|play)\s*\(/i.test(runtimeSource);
      const hasAudioControls = /\b(?:setMasterVolume|setMusicVolume|setSfxVolume|masterGain|musicVolume|sfxVolume|audioSettings|soundSettings|masterVolume|muteAudio|toggleMute|volumeSlider|musicGain|sfxGain)\b/i.test(runtimeSource + "\\n" + html);
      // GENE Runtime Kit: games may use the built-in, tested GeneAudio engine (injected into every runtime)
      // instead of hand-writing Web Audio. Using it satisfies the audio contract; spec metadata is filled in.
      const kitSfxNames = Array.from(runtimeSource.matchAll(/GeneAudio\s*\.\s*(?:sfx|play|playSfx)\s*\(\s*["']([\w-]+)["']/g)).map(match => match[1]);
      const usesKit = /\bGeneAudio\s*\.\s*(?:sfx|play|playSfx|music|startMusic|playMusic)\b/.test(runtimeSource);
      // No audio at all (or only decorative audio) is self-healed with the built-in GeneAudio kit, so every game ships with music + effects.
      const customAudioIncomplete = (audio?.enabled !== true ||
          !["procedural-web-audio", "asset-backed"].includes(String(audio?.implementation)) ||
          !["master", "music", "sfx"].every(bus => buses.includes(bus)) ||
          events.length < 3 ||
          !hasPlaybackApi ||
          !hasSoundOutput ||
          !hasConnectedSoundEvents ||
          !hasMusicPlayback ||
          !hasAudioControls);
      if (usesKit || customAudioIncomplete) {
        const kitMusic = /GeneAudio\s*\.\s*(?:music\s*\.\s*(?:start|setMood)|startMusic|playMusic)\s*\(/.test(runtimeSource);
        const kitSfxCalls = (runtimeSource.match(/GeneAudio\s*\.\s*(?:sfx|play|playSfx)\s*\(/g) || []).length;
        const kitControls = /GeneAudio\s*\.\s*(?:createSettingsPanel|setMasterVolume|setMusicVolume|setSfxVolume|setVolume|toggleMute|setMuted)\b/.test(runtimeSource);
        if (!kitMusic || kitSfxCalls < 2 || !kitControls) {
          // Deterministic repair instead of rejecting the whole build: append idempotent wiring to game.js
          // for whatever the model left out (music start on first input, UI/action SFX on real input events,
          // and a collapsible settings panel). The checks below then pass without another model round-trip.
          const moodGuess = String(spec.audio?.mood || spec.mood || "action").toLowerCase();
          const wiring = [
            "",
            "/* GENE audio auto-wiring (added because the audio contract was incomplete) */",
            "(function geneAudioAutoWire() {",
            "  var GA = window.GeneAudio; if (!GA || window.__geneAudioWired) return; window.__geneAudioWired = true;",
            kitMusic ? "" : "  var startedMusic = false; function ensureMusic() { if (startedMusic) return; startedMusic = true; window.GeneAudio.music.start(" + JSON.stringify(moodGuess) + "); }",
            kitMusic ? "" : "  ['pointerdown', 'keydown', 'touchstart'].forEach(function (name) { window.addEventListener(name, ensureMusic, { once: true, passive: true }); });",
            kitSfxCalls >= 2 ? "" : "  var lastSfx = 0; function sfxReady() { var now = Date.now(); if (now - lastSfx < 140) return false; lastSfx = now; return true; }",
            kitSfxCalls >= 2 ? "" : "  window.addEventListener('pointerdown', function () { if (sfxReady()) window.GeneAudio.sfx('ui'); }, { passive: true });",
            kitSfxCalls >= 2 ? "" : "  window.addEventListener('keydown', function (e) { if (!e.repeat && sfxReady()) window.GeneAudio.sfx('hit'); }, { passive: true });",
            kitControls ? "" : "  function mountAudioPanel() {",
            kitControls ? "" : "    var host = document.createElement('div'); host.id = 'gene-audio-settings-host'; host.setAttribute('data-gene-audio-settings', 'true'); host.style.cssText = 'position:fixed;right:10px;bottom:10px;z-index:50;font:12px system-ui,sans-serif';",
            kitControls ? "" : "    /* Reuse an existing settings control; never inject a second Audio panel. */",
            kitControls ? "" : "    if (document.querySelector('[data-gene-audio-settings], #gene-audio-settings, #gene-audio-settings-host')) return;",
            kitControls ? "" : "    var toggle = document.createElement('button'); toggle.type = 'button'; toggle.id = 'gene-audio-settings'; toggle.setAttribute('data-gene-audio-settings', 'true'); toggle.textContent = 'Audio'; toggle.setAttribute('aria-label', 'Audio settings');",
            kitControls ? "" : "    toggle.style.cssText = 'padding:6px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.25);background:rgba(10,14,20,.8);color:#eaf2f7;cursor:pointer';",
            kitControls ? "" : "    var slot = document.createElement('div'); slot.style.cssText = 'display:none;margin-bottom:6px'; window.GeneAudio.createSettingsPanel(slot);",
            kitControls ? "" : "    toggle.addEventListener('click', function () { slot.style.display = slot.style.display === 'none' ? 'block' : 'none'; });",
            kitControls ? "" : "    host.appendChild(slot); host.appendChild(toggle); document.body.appendChild(host);",
            kitControls ? "" : "  }",
            kitControls ? "" : "  if (document.body) mountAudioPanel(); else window.addEventListener('DOMContentLoaded', mountAudioPanel);",
            "})();",
            ""
          ].filter(line => line !== "").join("\n");
          const gameFile = normalized.find(file => file.path === "game.js");
          if (!gameFile) throw new Error("Build rejected: the game uses GeneAudio but game.js is missing, so audio wiring could not be repaired. No files were saved.");
          gameFile.content = gameFile.content.replace(/\s*$/, "\n") + wiring + "\n";
          byPath["game.js"] = gameFile.content;
        }
        const events: Record<string, string> = { ...(audio?.events && typeof audio.events === "object" && !Array.isArray(audio.events) ? audio.events : {}) };
        for (const name of kitSfxNames) if (!(name in events)) events[name] = name;
        for (const fallback of ["ui", "hit", "pickup"]) if (Object.keys(events).length < 3 && !(fallback in events)) events[fallback] = fallback;
        const repairedAudio = { ...(audio && typeof audio === "object" ? audio : {}), enabled: true, implementation: "procedural-web-audio", buses: ["master", "music", "sfx"], events };
        if (JSON.stringify(repairedAudio) !== JSON.stringify(audio)) {
          spec.audio = repairedAudio;
          byPath["game-spec.json"] = JSON.stringify(spec, null, 2);
          const specFile = normalized.find(file => file.path === "game-spec.json");
          if (specFile) specFile.content = byPath["game-spec.json"];
        }
      } else if (audio?.enabled !== true ||
          !["procedural-web-audio", "asset-backed"].includes(String(audio?.implementation)) ||
          !["master", "music", "sfx"].every(bus => buses.includes(bus)) ||
          events.length < 3 ||
          !hasPlaybackApi ||
          !hasSoundOutput ||
          !hasConnectedSoundEvents ||
          !hasMusicPlayback ||
          !hasAudioControls) {
        throw new Error("Build rejected: game audio is missing or only decorative. Add game-spec.json audio metadata (enabled=true, implementation=procedural-web-audio or asset-backed, buses including master/music/sfx, and at least three mapped events), instantiate a real AudioContext or audio element, start/play an audio node or media element, provide a music playback path and adjustable audio controls, and connect playSfx/playSound-style event calls in the assembled JavaScript; wire sounds to actual gameplay/UI transitions. A mute button, silent hook, or metadata alone does not count. No files were saved.");
      }
    }
    if (/<script\b(?![^>]*\btype\s*=\s*["'](?:application\/json|application\/ld\+json)["'])(?![^>]*\bsrc\s*=\s*["'](?:\.\/)?game\.js(?:[?#][^"']*)?["'])/i.test(html)) throw new Error("Build rejected: put executable source in game.js and load it with a local game.js script src; inline or external script tags are not allowed in game.html.");
    if (/<script\b[^>]*\bsrc\s*=\s*["']https?:|<link\b[^>]*\brel\s*=\s*["']stylesheet["'][^>]*\bhref\s*=\s*["']https?:/i.test(html)) throw new Error("Build rejected: projects may not depend on external script or stylesheet CDNs.");
    if (/\bimport\s*\(|\bfrom\s*["']https?:|\bfetch\s*\(\s*["']https?:/i.test(js)) throw new Error("Build rejected: JavaScript contains an external runtime dependency.");
    if (/@import\s+url\s*\(\s*["']?https?:|url\s*\(\s*["']https?:/i.test(css)) throw new Error("Build rejected: CSS contains an external runtime dependency.");
    if (projectKind === "app") {
      if (typeof spec.summary !== "string" || !spec.summary.trim()) throw new Error("Build rejected: app spec needs a concise summary.");
      for (const key of ["features", "routes", "userFlows"]) {
        if (!Array.isArray(spec[key]) || spec[key].length < 1 || !spec[key].every((item: unknown) => typeof item === "string" && item.trim())) {
          throw new Error("Build rejected: app spec needs a non-empty " + key + " list.");
        }
      }
      if (!/<(?:main|header|nav|section|form|button|h1|h2|article|div|input|label)\b/i.test(html)) throw new Error("Build rejected: app HTML must contain a real semantic UI, not an empty body.");
      if (/<(?:button|input|select|textarea|form)\b/i.test(html) && !/(addEventListener|onclick|onsubmit|onchange|oninput)/i.test(js)) {
        throw new Error("Build rejected: the app declares interactive controls but game.js contains no detectable event handlers. Wire the controls to real state changes and visible validation/results.");
      }
      if (js.trim().length < 80) throw new Error("Build rejected: app JavaScript is too small to implement the declared user flows.");
      if (!spec.performanceBudget || !Number.isFinite(spec.performanceBudget.targetFps) || spec.performanceBudget.targetFps < 30 || spec.performanceBudget.targetFps > 120) {
        throw new Error("Build rejected: app spec needs a valid performanceBudget.targetFps (30–120).");
      }
    } else {
      // Self-heal descriptive spec metadata deterministically instead of discarding an otherwise working game.
      // Only descriptive fields are filled (and budgets clamped to GENE's limits); source-level failures still fail and go to model repair.
      {
        const filled: string[] = [];
        const fillField = (key: string, value: unknown) => { spec[key] = value; filled.push(key); };
        const text = (value: unknown) => typeof value === "string" && value.trim().length > 0;
        if (!text(spec.genre)) fillField("genre", spec.engine === "webgl3d" ? "3D action" : "arcade");
        if (!Array.isArray(spec.mechanics) || !spec.mechanics.length || !spec.mechanics.every((item: unknown) => text(item))) fillField("mechanics", ["Move and act with the controls", "Collect or defeat targets to score", "Avoid hazards to stay alive"]);
        if (!text(spec.objective)) fillField("objective", "Complete the main challenge of " + (text(spec.title) ? String(spec.title).trim() : "the game"));
        if (!text(spec.winCondition)) fillField("winCondition", "Reach the target score or finish the final stage");
        if (!text(spec.lossCondition)) fillField("lossCondition", "Run out of lives, health or time");
        const rawBudget = spec.performanceBudget && typeof spec.performanceBudget === "object" && !Array.isArray(spec.performanceBudget) ? spec.performanceBudget : {};
        const pick = (value: unknown, fallback: number, min: number, max: number) => { const n = Number(value); return Number.isFinite(n) && n >= 0 ? Math.min(max, Math.max(min, Math.round(n))) : fallback; };
        const healedBudget = { targetFps: pick(rawBudget.targetFps, 60, 30, 120), maxEnemies: pick(rawBudget.maxEnemies, 20, 0, 40), maxObjects: pick(rawBudget.maxObjects, 300, 0, 1200), maxParticles: pick(rawBudget.maxParticles, 100, 0, 300) };
        if (JSON.stringify(healedBudget) !== JSON.stringify({ targetFps: rawBudget.targetFps, maxEnemies: rawBudget.maxEnemies, maxObjects: rawBudget.maxObjects, maxParticles: rawBudget.maxParticles })) fillField("performanceBudget", healedBudget);
        if (filled.length) {
          spec.autoFilled = filled;
          byPath["game-spec.json"] = JSON.stringify(spec, null, 2);
          const filledSpecFile = normalized.find(file => file.path === "game-spec.json");
          if (filledSpecFile) filledSpecFile.content = byPath["game-spec.json"];
        }
      }
      if (typeof spec.genre !== "string" || !spec.genre.trim()) throw new Error("Build rejected: game spec needs a genre.");
      if (!Array.isArray(spec.mechanics) || spec.mechanics.length < 1 || !spec.mechanics.every((item: unknown) => typeof item === "string" && item.trim())) throw new Error("Build rejected: gameplay mechanics are missing.");
      if (!Array.isArray(spec.controls) || spec.controls.length < 1 || !spec.controls.every((item: unknown) => typeof item === "string" && item.trim())) {
        // Recover the exact recurring failure at the contract boundary as well as in validateBuild.
        // Prefer controls proven by source handlers; never claim a keyboard/gamepad API exists when it does not.
        const allRuntimeSource = Object.entries(byPath)
          .filter(([path, content]) => /\.js$/i.test(path) && typeof content === "string")
          .map(([, content]) => content).join("\n");
        const recoveredControls: string[] = [];
        if (/(keydown|keyup|event\.key|event\.code|keyCode)/i.test(allRuntimeSource)) recoveredControls.push("Keyboard controls: use the movement/action keys shown in the game.");
        if (/(addEventListener\s*\(\s*[\'"](?:click|submit|change|input)[\'"]|\.onclick\s*=|onClick\s*=)/i.test(allRuntimeSource)) recoveredControls.push("Interactive game UI: click or tap the on-screen choices and controls.");
        if (/(pointerdown|pointermove|touchstart|touchmove|pointerup|touchend)/i.test(allRuntimeSource)) recoveredControls.push("Touch and pointer controls: use the visible on-screen controls.");
        if (/(getGamepads|gamepadconnected|gamepaddisconnected)/i.test(allRuntimeSource)) recoveredControls.push("Gamepad/controller controls: use the mapped buttons and sticks.");
        if (!recoveredControls.length) throw new Error("Build rejected: game controls are missing and no keyboard, touch, controller, or interactive UI handlers were found. Repair game.js to implement real input handlers, then declare those controls in game-spec.json.");
        spec.controls = recoveredControls;
        byPath["game-spec.json"] = JSON.stringify(spec, null, 2);
        // Persist deterministic contract repairs into the actual returned files.
        // Otherwise validation could pass while the staged snapshot kept the bad spec.
        const normalizedSpecFile = normalized.find(file => file.path === "game-spec.json");
        if (normalizedSpecFile) normalizedSpecFile.content = byPath["game-spec.json"];
      }
      if (typeof spec.objective !== "string" || !spec.objective.trim()) throw new Error("Build rejected: the main objective is missing.");
      if (typeof spec.winCondition !== "string" || !spec.winCondition.trim()) throw new Error("Build rejected: the win condition is missing.");
      if (typeof spec.lossCondition !== "string" || !spec.lossCondition.trim()) throw new Error("Build rejected: the loss condition is missing.");
      const budget = spec.performanceBudget;
      if (!budget || !Number.isFinite(budget.targetFps) || budget.targetFps < 30 || budget.targetFps > 120) throw new Error("Build rejected: performanceBudget.targetFps must be between 30 and 120.");
      if (![budget.maxEnemies, budget.maxObjects, budget.maxParticles].every((n: unknown) => Number.isInteger(n) && Number(n) >= 0)) throw new Error("Build rejected: performance budgets must be non-negative integers.");
      if (budget.maxEnemies > 40 || budget.maxObjects > 1200 || budget.maxParticles > 300) throw new Error("Build rejected: requested object, enemy, or particle budget exceeds GENE's conservative limits.");
      // A canvas without the expected id is a one-attribute fix; add it instead of rejecting.
      if (!/<canvas\b[^>]*\bid=["']game-canvas["']/i.test(html)) {
        let healedHtml = html;
        if (/<canvas\b(?![^>]*\bid=)/i.test(html)) healedHtml = html.replace(/<canvas\b(?![^>]*\bid=)/i, '<canvas id="game-canvas"');
        else if (!/<canvas\b/i.test(html) && !/createElement\s*\(\s*["']canvas["']\s*\)/.test(runtimeSource) && /<body[^>]*>/i.test(html)) healedHtml = html.replace(/<body[^>]*>/i, match => match + '\n<canvas id="game-canvas"></canvas>');
        if (healedHtml !== html) {
          html = healedHtml;
          byPath["game.html"] = healedHtml;
          const htmlFileToHeal = normalized.find(file => file.path === "game.html");
          if (htmlFileToHeal) htmlFileToHeal.content = healedHtml;
        }
      }
      // The spec must not promise controls the code cannot deliver: rewrite the claim to match the proven handlers.
      {
        const keyRe = /(keydown|keyup|event\.key|event\.code|keyCode)/i;
        const touchRe = /(pointerdown|pointermove|touchstart|touchmove|pointerup|touchend)/i;
        const padRe = /(getGamepads|gamepadconnected|gamepaddisconnected)/i;
        const claims = spec.controls.join(" ").toLowerCase();
        const overpromised = (/keyboard|wasd|arrow keys|key bindings/.test(claims) && !keyRe.test(runtimeSource)) || (/touch|mobile|pointer controls/.test(claims) && !touchRe.test(runtimeSource)) || (/gamepad|controller/.test(claims) && !padRe.test(runtimeSource));
        if (overpromised) {
          const proven: string[] = [];
          if (keyRe.test(runtimeSource)) proven.push("Keyboard controls: use the movement/action keys shown in the game.");
          if (touchRe.test(runtimeSource)) proven.push("Touch and pointer controls: use the visible on-screen controls.");
          if (padRe.test(runtimeSource)) proven.push("Gamepad/controller controls: use the mapped buttons and sticks.");
          if (proven.length) {
            spec.controls = proven;
            spec.autoFilled = Array.from(new Set([...(Array.isArray(spec.autoFilled) ? spec.autoFilled : []), "controls"]));
            byPath["game-spec.json"] = JSON.stringify(spec, null, 2);
            const controlsSpecFile = normalized.find(file => file.path === "game-spec.json");
            if (controlsSpecFile) controlsSpecFile.content = byPath["game-spec.json"];
          }
        }
      }
      if (!/<canvas\b[^>]*\bid=["']game-canvas["']/i.test(html)) throw new Error("Build rejected: game.html must include a canvas with id=game-canvas.");
      if (!/requestAnimationFrame|\.requestAnimationFrame/.test(js)) throw new Error("Build rejected: game.js has no requestAnimationFrame loop.");
      if (!/addEventListener|onkeydown|onkeyup|ontouchstart|onclick/.test(js)) throw new Error("Build rejected: game.js has no detectable input/event handling.");
      const controlsContract = spec.controls.join(" ").toLowerCase();
      if (/keyboard|wasd|arrow keys|key bindings/.test(controlsContract) && !/(keydown|keyup|event\.key|event\.code|keyCode)/i.test(runtimeSource)) {
        throw new Error("Build rejected: the spec promises keyboard controls but game.js has no detectable keyboard input mapping.");
      }
      if (/touch|mobile|pointer controls/.test(controlsContract) && !/(pointerdown|pointermove|touchstart|touchmove|pointerup|touchend)/i.test(runtimeSource)) {
        throw new Error("Build rejected: the spec promises touch/pointer controls but game.js has no detectable touch or pointer handlers.");
      }
      if (/gamepad|controller/.test(controlsContract) && !/(getGamepads|gamepadconnected|gamepaddisconnected)/i.test(runtimeSource)) {
        throw new Error("Build rejected: the spec promises controller support but game.js does not read the Gamepad API.");
      }
      if (spec.engine === "canvas2d" && !/getContext\s*\(\s*["']2d["'](?:\s*,[^)]*)?\s*\)/.test(runtimeSource)) throw new Error("Build rejected: a canvas2d game must create a CanvasRenderingContext2D.");
      if (spec.engine === "canvas2d" && !/(?:\.fillRect\s*\(|\.strokeRect\s*\(|\.drawImage\s*\(|\.putImageData\s*\(|\.fill\s*\(|\.stroke\s*\(|\.fillText\s*\()/i.test(runtimeSource)) {
        throw new Error("Build rejected: the assembled Canvas 2D project has no detectable visible drawing operations. A game loop and audio are not enough; draw the world, characters, UI, or narrative content in the runtime before saving the build.");
      }
      if (spec.engine === "webgl3d") {
        if (!/getContext\s*\(\s*["'](?:webgl2?|experimental-webgl)["'](?:\s*,[^)]*)?\s*\)/i.test(runtimeSource)) throw new Error("Build rejected: a webgl3d game must request a real WebGL context.");
        if (!/drawArrays\s*\(|drawElements\s*\(/i.test(runtimeSource)) throw new Error("Build rejected: the assembled 3D project never submits visible geometry to WebGL. Audio and scene metadata do not count as a playable rendered game.");
        if (!/viewport\s*\(/i.test(runtimeSource)) throw new Error("Build rejected: the 3D renderer never configures the WebGL viewport, so the scene may remain invisible or render incorrectly.");
        if (!/clear\s*\(/i.test(runtimeSource)) throw new Error("Build rejected: the 3D renderer never clears its frame buffers, so stale or undefined pixels may hide the scene.");
        if (!/(camera|lookAt|viewMatrix|projection|perspective|uMVP|mvp|modelMatrix|viewProjection)/i.test(runtimeSource)) throw new Error("Build rejected: the 3D runtime has no detectable camera or view/projection transform. Define camera framing and transforms so generated geometry can appear in the viewport.");
        for (const [pattern, requirement] of [
          [/createShader\s*\(/, "shader creation"],
          [/shaderSource\s*\(/, "shader source"],
          [/compileShader\s*\(/, "shader compilation"],
          [/createProgram\s*\(/, "shader program creation"],
          [/linkProgram\s*\(/, "shader program linking"],
          [/bufferData\s*\(/, "GPU geometry buffers"],
          [/drawArrays\s*\(|drawElements\s*\(/, "GPU geometry draw calls"]
        ] as Array<[RegExp, string]>) if (!pattern.test(runtimeSource)) throw new Error("Build rejected: WebGL game is missing " + requirement + ".");
      }
      if (!/fillRect|fillText|drawImage|drawArrays|drawElements|stroke\(|\.fill\(/.test(runtimeSource)) throw new Error("Build rejected: no detectable draw operation was found. The runtime would likely be blank.");
    }
  }
  return normalized;
}

export async function POST(request: NextRequest) {
  let body: any;
  try { body = await request.json(); } catch { return jsonError("Request body must be valid JSON."); }

  const allowedOperations = ["interview", "plan", "build", "buildPart", "validateBuild", "edit", "chat", "research", "surprise", "enhancePrompt"];
  const projectKind: "game" | "app" = body.project?.kind === "app" ? "app" : "game";
  if (!allowedOperations.includes(body.operation)) return jsonError("Unknown GENE operation.");
  if (body.operation === "research" && !hasToolApproval(body, "agentResearch")) return jsonError("GENE did not run web research because explicit approval for this exact research request is missing or expired.", 403, "TOOL_APPROVAL_REQUIRED");
  if (!["plan", "build"].includes(body.mode)) return jsonError("Mode must be plan or build.");
  if (body.mode === "plan" && ["build", "buildPart", "edit", "surprise"].includes(body.operation)) {
    return jsonError("Plan mode is read-only. Switch to Build mode before creating or changing project files.", 409, "GENE_PLAN_MODE_READ_ONLY");
  }
  if (typeof body.message !== "string" || !body.message.trim()) return jsonError("Please enter a message.");
  if (body.message.length > (body.operation === "enhancePrompt" ? 24_000 : 12_000)) return jsonError("Message is too long (maximum " + (body.operation === "enhancePrompt" ? "24,000" : "12,000") + " characters).");

  if (body.operation === "enhancePrompt" && body.mode === "build") {
    return jsonError("Prompt enhancement is read-only. Use Plan mode or run it before starting a build.", 409, "GENE_PROMPT_ENHANCER_READ_ONLY");
  }

  if (body.operation === "validateBuild") {
    try {
      const files = ensureProjectSpecTitle(
        Object.entries(body.project?.files || {}).map(([path, content]) => ({ path, content: String(content) })),
        [body.project?.plan?.title, body.project?.name, body.project?.initialPrompt, body.message]
      );
      // Repair the recurring spec-only failure deterministically before strict validation.
      // Controls are inferred from actual handlers and mechanics when the model omitted its contract.
      const byPath = Object.fromEntries(files.map(file => [file.path, file.content]));
      const spec = JSON.parse(byPath["game-spec.json"] || "{}");
      let normalizedSpecChanged = false;
      if (projectKind === "game" && (!Array.isArray(spec.controls) || !spec.controls.some((item: unknown) => typeof item === "string" && item.trim()))) {
        const source = Object.entries(byPath).filter(([path, content]) => /\.js$/i.test(path) && typeof content === "string").map(([, content]) => content).join("\n");
        const inferred: string[] = [];
        if (/(keydown|keyup|event\.key|event\.code|keyCode)/i.test(source)) inferred.push("Keyboard controls: use the displayed movement/action keys.");
        if (/(addEventListener\s*\(\s*[\'"](?:click|submit|change|input)[\'"]|\.onclick\s*=|onClick\s*=)/i.test(source)) inferred.push("Interactive game UI: click or tap the on-screen choices and controls.");
        if (/(pointerdown|pointermove|touchstart|touchmove|pointerup|touchend)/i.test(source)) inferred.push("Touch/pointer controls: use the on-screen controls or tap/drag the play area.");
        if (/(getGamepads|gamepadconnected|gamepaddisconnected)/i.test(source)) inferred.push("Gamepad/controller controls: use the mapped controller buttons and sticks.");
        if (!inferred.length) {
          throw new Error("Build rejected: game controls are missing because no keyboard, touch, controller, or interactive UI handlers were found in the assembled JavaScript. Implement real input handlers in game.js or a runtime module, then declare the supported controls in game-spec.json.");
        }
        spec.controls = inferred;
        byPath["game-spec.json"] = JSON.stringify(spec, null, 2);
        normalizedSpecChanged = true;
      }
      const validationFiles = files.map(file => ({ ...file, content: byPath[file.path] ?? file.content }));
      // validateFiles repairs file objects in place, so snapshot the incoming contents first.
      const contentBefore = new Map(validationFiles.map(file => [file.path, file.content] as [string, string]));
      const validated = validateFiles(validationFiles, "build", body.project?.plan?.engine, "build", projectKind);
      // Return every file the validator normalised or repaired (spec contract fixes and runtime-safety repairs).
      const normalizedFiles = validated.filter(file => contentBefore.get(file.path) !== file.content || (normalizedSpecChanged && file.path === "game-spec.json"));
      return NextResponse.json({
        ok: true,
        aiMode: "validation",
        result: {
          reply: "Assembled project passed GENE's server-side source and project-contract validation." + (normalizedFiles.some(file => /\.(?:m?js|cjs)$/i.test(file.path)) ? " Runtime-safety repairs were applied to generated JavaScript." : ""),
          files: normalizedFiles,
          plan: body.project?.plan || null,
          complete: true,
          needsUserDecision: false,
          tests: { passed: ["Required project files present", "Project spec valid", "JavaScript syntax valid", "Undeclared-variable and scope scan passed", "Runtime contract checks passed"], failed: [] }
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Assembled project failed validation.";
      return jsonError("The staged project did not pass final validation: " + message + " No files were saved. Retry the build or ask GENE to repair the specific stage.", 422, "GENE_STAGED_BUILD_VALIDATION_FAILED");
    }
  }

  if (["interview", "plan"].includes(body.operation) && (body.thinking === "native" || process.env.GENE_NATIVE_ONLY === "true")) {
    return jsonError("GENE interview and planning require a real configured AI provider. Native deterministic mode is not used for these operations. Choose an AI mode and configure an available provider; your project and answers were preserved.", 503, "GENE_AI_REQUIRED");
  }

  // Explicit native mode is a hard boundary: this branch returns before any provider keys,
  // fetch calls, or fallback chains are inspected. No third-party model is called.
  if (body.thinking === "native" || process.env.GENE_NATIVE_ONLY === "true") {
    try {
      const result = await createNativeResult({ ...body, operation: body.operation });
      return NextResponse.json({ ok: true, aiMode: "native", model: "Gene Native (deterministic)", result });
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : "Native generation failed.", 422, "GENE_NATIVE_GENERATION_FAILED");
    }
  }

  const now = Date.now();
  const forwarded = request.headers.get("x-forwarded-for") || "";
  const clientKey = forwarded.split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";
  const bucket = requestBuckets.get(clientKey);
  if (!bucket || bucket.resetAt <= now) requestBuckets.set(clientKey, { count: 1, resetAt: now + RATE_WINDOW_MS });
  else {
    bucket.count += 1;
    if (bucket.count > RATE_LIMIT) return jsonError("GENE request limit reached. Please wait one minute before trying again.", 429, "GENE_RATE_LIMIT");
  }
  if (requestBuckets.size > 2000) {
    for (const [key, value] of requestBuckets) if (value.resetAt <= now) requestBuckets.delete(key);
  }

  const apiKeys = getGeminiKeys();
  if (apiKeys.length === 0 && !process.env.GROQ_API_KEY?.trim() && !process.env.OPENROUTER_API_KEY?.trim()) {
    // An explicitly selected native mode is handled above. For normal AI modes,
    // never silently turn the first plan/interview into a low-quality deterministic plan.
    // Return a clear provider error so users can fix configuration instead of mistaking
    // a rule-based outline for an AI-generated plan.
    if (["plan", "interview"].includes(body.operation)) {
      return jsonError(
        "GENE could not create an AI plan because no AI provider key is configured. Select GENE Fast / Thinking / GENE BH and configure a valid Gemini, Groq, or OpenRouter key in the deployment environment. No project files were changed. Use Gene Native only when you intentionally want a deterministic offline outline.",
        503,
        "GENE_AI_PROVIDER_NOT_CONFIGURED"
      );
    }
    const answers = body.answers || {};
    const known = Object.keys(answers);
    if (body.operation === "interview") {
      const original = String(body.project?.initialPrompt || body.message || (projectKind === "app" ? "Untitled app" : "Untitled game"));
      const nextQuestion = nextInterviewQuestion(projectKind, answers, original);
      if (nextQuestion) {
        return NextResponse.json({
          ok: true,
          aiMode: "fallback",
          result: {
            reply: "GENE is using its built-in interview because no AI provider key is available. This is a rule-based question, not an AI-generated answer.",
            question: nextQuestion,
            plan: null,
            files: [],
            complete: false,
            needsUserDecision: true
          }
        });
      }
      const answersSummary = Object.entries(answers).map(([key, value]) => key + ": " + String(value)).join("; ");
      const camera = String(answers.camera || "");
      const originalText = String(body.project?.initialPrompt || body.message || (projectKind === "app" ? "Untitled app" : "Untitled game"));
      const preferredEngine = body.project?.preferredEngine;
      const is3d = projectKind === "game" && (preferredEngine === "webgl3d" || (preferredEngine !== "canvas2d" && (/3d|three.?dimensional|subway|runner|driving|horror|first.?person|third.?person/i.test(originalText) || /3d|first-person|third-person/i.test(camera))));
      const isApp = projectKind === "app";
      const starterPlan = {
        title: originalText.split(/[.!?]/)[0].slice(0, 64) || (isApp ? "Untitled app" : "Untitled game"),
        kind: projectKind,
        summary: "Built-in starter plan from your interview answers (" + answersSummary.slice(0, 420) + "). This is a rule-based plan, not AI-generated.",
        engine: isApp ? "webapp" : preferredEngine === "canvas2d" || preferredEngine === "webgl3d" ? preferredEngine : is3d ? "webgl3d" : "canvas2d",
        tasks: isApp
          ? ["Define primary user flow and responsive navigation", "Build the visual system and semantic screens", "Implement persistent state and form validation as required", "Wire every interactive control to visible state changes", "Add loading, empty, success, and recoverable error states", "Validate keyboard/touch behavior and all primary flows"]
          : ["Build a playable core loop with the selected perspective and controls", "Implement input, collisions, state transitions, and feedback", "Create distinct stages, challenges, or missions beyond the prototype", "Add progression, unlocks, and project-specific content", "Implement pause, restart, win/loss, and a complete ending", "Validate gameplay, controls, runtime, and performance"],
        mechanics: isApp
          ? ["Responsive navigation", "State and validation", "Accessible interactive controls", "Recoverable user feedback"]
          : [String(answers.genre || "Core genre loop"), String(answers.content || "Progression and distinct content"), String(answers.controls || "Responsive controls"), "Clear completion and restart rules"],
        performanceBudget: { targetFps: 60, maxEnemies: isApp ? 0 : 8, maxObjects: 160, maxParticles: isApp ? 0 : 60 }
      };
      return NextResponse.json({
        ok: true,
        aiMode: "fallback",
        result: {
          reply: "Interview complete. This is a rule-based starter plan built from your answers. AI-powered planning and code generation still require a configured provider key.",
          question: null,
          plan: starterPlan,
          files: [],
          complete: true,
          needsUserDecision: false
        }
      });
    }
    if (body.operation === "plan") {
      const original = String(body.message || body.project?.initialPrompt || (projectKind === "app" ? "Untitled app" : "Untitled game"));
      const preferredEngine = body.project?.preferredEngine;
      const is3d = projectKind === "game" && (preferredEngine === "webgl3d" || (preferredEngine !== "canvas2d" && /3d|three.?dimensional|subway|runner|driving|horror|first.?person|third.?person/i.test(original)));
      return NextResponse.json({
        ok: true,
        aiMode: "fallback",
        result: {
          reply: "I prepared a rule-based outline only. This is not an AI-generated plan, and no source files were created. Configure a provider key to enable GENE's full planning and code generation.",
          question: null,
          plan: {
            title: original.split(/[.!?]/)[0].slice(0, 64) || (projectKind === "app" ? "Untitled app" : "Untitled game"),
            kind: projectKind,
            summary: "Local outline based on your request. Review and refine it after connecting an AI provider.",
            engine: projectKind === "app" ? "webapp" : preferredEngine === "canvas2d" || preferredEngine === "webgl3d" ? preferredEngine : is3d ? "webgl3d" : "canvas2d",
            tasks: ["Define the core loop and acceptance criteria", "Implement the project shell and responsive layout", "Implement the main mechanic and input handling", "Add distinct progression and content", "Implement success, failure, and restart flows", "Run source, interaction, and runtime validation"],
            mechanics: ["Primary user/game loop", "Input and state management", "Visible feedback and recovery", "Completion and restart"],
            performanceBudget: { targetFps: 60, maxEnemies: projectKind === "app" ? 0 : 8, maxObjects: 160, maxParticles: projectKind === "app" ? 0 : 60 }
          },
          files: [],
          complete: true,
          needsUserDecision: false
        }
      });
    }
    return jsonError("Gemini is not configured. Add GEMINI_API_KEY to apps/web/.env.local (local development) or your deployment environment. GENE did not generate or change any project files.", 503, "GEMINI_NOT_CONFIGURED");
  }

  const requestedThinking = body.thinking === "fast" ? "fast" : body.thinking === "deep" ? "deep" : "balanced";
  const configuredModel = requestedThinking === "fast"
    ? (process.env.GENE_FAST_MODEL || "gemini-3.8-flash")
    : requestedThinking === "deep"
      ? (process.env.GENE_THINKING_MODEL || process.env.GENE_BALANCED_MODEL || process.env.GENE_FAST_MODEL || "gemini-3.8-flash")
      : (process.env.GENE_BALANCED_MODEL || process.env.GENE_FAST_MODEL || "gemini-3.8-flash");
  // Explicit validated overrides remain supported; normal UI requests omit the model so
  // the selected GENE mode is not accidentally forced to the health-check model.
  const model = typeof body.model === "string" && /^gemini-[a-zA-Z0-9.-]+$/.test(body.model)
    ? body.model
    : configuredModel;
  const thinkingLevel = requestedThinking === "fast" ? "low" : requestedThinking === "deep" ? "high" : "medium";
  let userInput = makeAgentInput({
    operation: body.operation,
    stagePath: typeof body.stagePath === "string" ? body.stagePath : undefined,
    mode: body.mode,
    message: body.message,
    project: body.project || null,
    history: Array.isArray(body.history) ? body.history : [],
    answers: body.answers || {},
    thinking: thinkingLevel,
    extendedPlanning: body.extendedPlanning === true
  });
  if (["build", "surprise"].includes(body.operation) && projectKind === "game") {
    userInput += "\n\nFINAL GAME BUILD CONTRACT — do not omit required deliverables: return non-empty plan.title, plan.summary and plan.engine matching the requested engine; include the four current runtime compatibility entry files game.html, game.css, game.js and game-spec.json, but treat them ONLY as the launch/compatibility shell, not as a universal project architecture. FIRST classify the game genre, engine, complexity, core systems, asset needs and likely growth; then design a project-specific file tree BEFORE writing code. Choose meaningful names and folders independently for THIS game (for example src/world/, src/player/, src/combat/, src/quests/, src/economy/, src/ai/, src/save/, src/ui/, assets/models/, assets/audio/, shaders/ only when needed). Do not create irrelevant folders or modules, and do not dump every mechanic into game.js. Keep game.js as a small bootstrap/orchestrator where possible and put substantial systems in separately named project files using the runtime-supported loading approach. Declare every extra JavaScript module path in game-spec.json additionalFiles in dependency/load order and return every declared file. The current sandbox loads these as ordered classic scripts, not native ES modules: wrap each module in an IIFE and expose its API under window.GeneModules[filenameWithoutExtension] so files have independent scope; game.js is the final bootstrap that composes those APIs. Do not use import/export syntax or depend on implicit global const/function leakage. Different genres must produce visibly different trees. Include a concise architecture description and file-tree summary in the plan. Preserve the requested engine and project identity. Use the injected GeneAudio kit for real sound: call GeneAudio.music.start('exploration') from the real start/play gesture, GeneAudio.sfx('start') and at least two other named SFX from actual gameplay/UI events, and expose settings with GeneAudio.createSettingsPanel(container) or a working volume/mute control. Put mapped event names in game-spec.json audio.events and audio.implementation='procedural-web-audio'. Make controls, collisions, progression, pause/resume, restart and reachable win/loss states genuinely work. Never claim a feature that is not implemented.";
  }

  // GENE Forge tool bridge: run bounded native modelling before the game model writes code.
  // The recipe is injected into the build context and its source mesh files are returned with the project.
  let forgeToolAssets: Array<{ kind: string; name: string; recipe: any; files: Record<string, string>; partCount: number; triangleCount: number }> = [];
  const forgePrompt = String(body.message || body.project?.initialPrompt || "");
  const wants3DForge = ["build", "surprise"].includes(body.operation) && projectKind === "game" && (
    body.project?.projectIntent === "game-3d" || body.project?.preferredEngine === "webgl3d" || body.project?.plan?.engine === "webgl3d" ||
    /\b(3d|three[- ]dimensional|webgl|third[- ]person|first[- ]person)\b/i.test(forgePrompt)
  );
  if (wants3DForge && !request.signal.aborted) {
    const lowerPrompt = forgePrompt.toLowerCase();
    const requestedKinds: Array<{ kind: string; prompt: string }> = [
      { kind: "character", prompt: "Create the main playable character for this game. " + forgePrompt },
      { kind: "environment", prompt: "Create a recognizable environment landmark and ground-contact forms for this game world. " + forgePrompt }
    ];
    if (/\b(vehicle|truck|car|van|driving|racing|bus)\b/i.test(lowerPrompt)) requestedKinds.push({ kind: "vehicle", prompt: "Create the main vehicle for this game. " + forgePrompt });
    if (/\b(furniture|chair|table|sofa|bed|cabinet|crate|prop)\b/i.test(lowerPrompt) && requestedKinds.length < 3) requestedKinds.push({ kind: "prop", prompt: "Create the most important gameplay prop for this game. " + forgePrompt });
    const quality = body.thinking === "fast" ? "performance" : body.thinking === "deep" ? "high" : "standard";
    const projectStyle = String(body.project?.plan?.summary || body.project?.initialPrompt || "").slice(0, 1200);
    const approvedKinds = requestedKinds.filter(item => {
      const toolBody = { prompt: item.prompt.slice(0, 3900), kind: item.kind, quality, projectStyle, nativeOnly: true };
      const entry = Array.isArray(body.toolApprovals) ? body.toolApprovals.find((candidate: any) => candidate?.tool === "forge3d" && hasToolApproval({ ...toolBody, toolApproval: candidate.approval }, "forge3d")) : null;
      return Boolean(entry);
    });
    const toolResults = await Promise.all(approvedKinds.slice(0, 3).map(async item => {
      try {
        const endpoint = new URL("/api/forge", request.url);
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: item.prompt.slice(0, 3900), kind: item.kind, quality, projectStyle, nativeOnly: true,
            toolApproval: (body.toolApprovals || []).find((candidate: any) => candidate?.tool === "forge3d" && hasToolApproval({
              prompt: item.prompt.slice(0, 3900), kind: item.kind, quality, projectStyle, nativeOnly: true, toolApproval: candidate.approval
            }, "forge3d"))?.approval
          }),
          signal: request.signal,
          cache: "no-store"
        });
        if (!response.ok) return null;
        const data = await response.json();
        const asset = data?.ok ? data.asset : null;
        if (!asset || !asset.recipe || !asset.files || typeof asset.files["model.obj"] !== "string") return null;
        return { kind: item.kind, name: String(asset.name || item.kind), recipe: asset.recipe, files: asset.files, partCount: Number(asset.partCount) || 0, triangleCount: Number(asset.triangleCount) || 0 };
      } catch {
        if (request.signal.aborted) return null;
        return null;
      }
    }));
    forgeToolAssets = toolResults.filter((asset): asset is NonNullable<typeof asset> => Boolean(asset));
    if (forgeToolAssets.length) {
      userInput += "\n\nGENE FORGE TOOL RESULTS — THESE ARE REAL GENERATED ASSETS, NOT SUGGESTIONS. Forge generated and validated the following procedural 3D recipes. Use these exact recipes as the source of truth for the in-game meshes: implement their supported shapes, positions, scales, rotations, and per-part colours in the requested WebGL renderer; adapt scale/camera only when necessary. Do not replace them with generic placeholder geometry. Mesh exports will also be included in the project under assets/models/. Do not use network CDNs.\n" +
        JSON.stringify(forgeToolAssets.map((asset, index) => ({ id: "forge_asset_" + (index + 1), kind: asset.kind, name: asset.name, recipe: asset.recipe, partCount: asset.partCount, triangleCount: asset.triangleCount, files: { obj: "assets/models/" + asset.kind + ".obj", mtl: "assets/models/" + asset.kind + ".mtl", metadata: "assets/models/" + asset.kind + ".json" } })));
    } else {
      userInput += "\n\nGENE FORGE TOOL STATUS: The bounded native asset tool did not return a validated recipe for this request. Do not claim that Forge assets were generated; build the best valid game you can and disclose the missing tool asset.";
    }
  }

  // GENE Forge 2D bridge: generate native vector assets during ordinary 2D game builds,
  // pass the real asset paths into the model context, and return the actual files with the game.
  let forge2DAssets: Array<{ kind: string; name: string; svg: string; manifest: any; qualityReport: any; frameFiles?: Record<string, string> }> = [];
  const wants2DForge = ["build", "surprise"].includes(body.operation) && projectKind === "game" && !wants3DForge &&
    (body.project?.preferredEngine === "canvas2d" || body.project?.plan?.engine === "canvas2d" ||
      (!body.project?.preferredEngine && !body.project?.plan?.engine && !/\b(3d|three[- ]dimensional|webgl|third[- ]person|first[- ]person)\b/i.test(forgePrompt)));
  if (wants2DForge && !request.signal.aborted) {
    const lowerPrompt = forgePrompt.toLowerCase();
    const kinds: Array<{ kind: string; prompt: string }> = [
      { kind: "character", prompt: "Create the main recognizable 2D playable character sprite for this game. " + forgePrompt },
      { kind: /city|street|platform|tile|level|maze|map|world|forest|dungeon|terrain/i.test(lowerPrompt)
        ? "tileset" : "background",
        prompt: "Create a matching 2D " + (/city|street|platform|tile|level|maze|map|world|forest|dungeon|terrain/i.test(lowerPrompt) ? "game tileset" : "game background") + " for this game. " + forgePrompt }
    ];
    const quality = body.thinking === "fast" ? "performance" : body.thinking === "deep" ? "high" : "standard";
    const approvedKinds = kinds.filter(item => {
      const toolBody = { prompt: item.prompt.slice(0, 300), kind: item.kind, quality, style: "project-matched stylized game art" };
      const entry = Array.isArray(body.toolApprovals) ? body.toolApprovals.find((candidate: any) => candidate?.tool === "forge2d" && hasToolApproval({ ...toolBody, toolApproval: candidate.approval }, "forge2d")) : null;
      return Boolean(entry);
    });
    const results = await Promise.all(approvedKinds.map(async item => {
      try {
        const response = await fetch(new URL("/api/forge/2d", request.url), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: item.prompt.slice(0, 300), kind: item.kind, quality, style: "project-matched stylized game art",
            toolApproval: (body.toolApprovals || []).find((candidate: any) => candidate?.tool === "forge2d" && hasToolApproval({
              prompt: item.prompt.slice(0, 300), kind: item.kind, quality, style: "project-matched stylized game art", toolApproval: candidate.approval
            }, "forge2d"))?.approval
          }),
          signal: request.signal,
          cache: "no-store"
        });
        if (!response.ok) return null;
        const data = await response.json();
        const asset = data?.ok ? data.asset : null;
        if (!asset || typeof asset.svg !== "string" || !asset.manifest || !asset.qualityReport) return null;
        return {
          kind: item.kind,
          name: String(asset.name || item.kind),
          svg: asset.svg,
          manifest: asset.manifest,
          qualityReport: asset.qualityReport,
          frameFiles: asset.frameFiles && typeof asset.frameFiles === "object" ? asset.frameFiles as Record<string, string> : {}
        };
      } catch {
        return null;
      }
    }));
    forge2DAssets = results.filter((asset): asset is NonNullable<typeof asset> => Boolean(asset));
    if (forge2DAssets.length) {
      userInput += "\n\nGENE FORGE 2D TOOL RESULTS — THESE ARE GENERATED VECTOR ASSETS, NOT SUGGESTIONS. Integrate the exact provided local files into the actual playable game where appropriate: " +
        JSON.stringify(forge2DAssets.map(asset => ({
          kind: asset.kind,
          name: asset.name,
          svg: "assets/forge2d/" + asset.kind + ".svg",
          manifest: "assets/forge2d/" + asset.kind + ".json",
          dimensions: { width: asset.manifest.width, height: asset.manifest.height, frames: asset.manifest.frames },
          animationClips: Array.isArray(asset.manifest.animationClips) ? asset.manifest.animationClips.map((clip: any) => ({ name: clip.name, frames: clip.frames, frameDurationMs: clip.frameDurationMs, loop: clip.loop })) : []
        }))) +
        "\nIntegrate these local files into the actual playable game, not just the project listing. For a character with animationClips, call window.GENE_SPRITES.draw(ctx, \"assets/forge2d/character\", clipName, x, y, width, height, performance.now()) inside the normal canvas render loop; use \"idle\" while stationary and \"walk\" while moving when those clips exist. The helper loads separately cropped frames from the supplied manifest. For a non-animated background or tileset, load its exact local SVG path with window.GENE_ART.image/draw or an Image. Do not put executable code in game.html, do not use remote URLs, and do not claim an asset is integrated unless game.js actually loads and renders it. The exact generated files will be included in the project.";
    } else {
      userInput += "\n\nGENE FORGE 2D STATUS: The native 2D generator did not return validated artwork. Continue with the best playable game possible and do not claim Forge artwork was generated.";
    }
  }

  const parts: Array<Record<string, unknown>> = [{ text: userInput }];
  const references = Array.isArray(body.project?.references) ? body.project.references : [];
  const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
  let imageBytesApprox = 0;
  let imageCount = 0;
  for (const ref of references) {
    if (ref?.kind !== "image" || !ref.dataBase64) continue;
    if (imageCount >= 4) break;
    if (!allowedImageTypes.has(ref.mimeType)) return jsonError("Unsupported reference image type: " + String(ref.mimeType), 400, "REFERENCE_TYPE_UNSUPPORTED");
    if (typeof ref.dataBase64 !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(ref.dataBase64)) return jsonError("A reference image was not valid base64 data.", 400, "REFERENCE_INVALID");
    imageBytesApprox += ref.dataBase64.length;
    if (ref.dataBase64.length > 700_000 || imageBytesApprox > 1_100_000) return jsonError("Reference images exceed GENE's request budget. Attach smaller images or fewer references.", 413, "REFERENCE_TOO_LARGE");
    parts.push({ inlineData: { mimeType: ref.mimeType, data: ref.dataBase64 } });
    imageCount += 1;
  }

  let payload: any = null;
  let successfulModel = model;
  let successfulProvider = "gemini";
  let lastFailure = { status: 502, detail: "Configured AI providers did not complete the request." };
  let lastFailureProvider = "Gemini";
  let attempts = 0;
  let outputFailure: "truncated" | "malformed" | null = null;
  const fallbackModels = [model, "gemini-3.6-flash", "gemini-3.5-flash-lite"].filter((value, index, all) => all.indexOf(value) === index);
  const queued: Array<{ key: string; model: string; fallback: boolean }> = apiKeys.length ? [
    { key: apiKeys[0], model, fallback: false }
  ] : [];
  const queuedIds = new Set<string>(apiKeys.length ? [apiKeys[0] + "|" + model] : []);
  const enqueue = (key: string, candidateModel: string, fallback: boolean) => {
    const id = key + "|" + candidateModel;
    if (!queuedIds.has(id) && queued.length < 8) {
      queuedIds.add(id);
      queued.push({ key, model: candidateModel, fallback });
    }
  };
  const startedAt = Date.now();
  const totalBudgetMs = 52_000;
  const geminiBudgetMs = process.env.GROQ_API_KEY?.trim() || process.env.OPENROUTER_API_KEY?.trim() ? 25_000 : totalBudgetMs;

  while (queued.length > 0 && attempts < 8) {

    const attempt = queued.shift()!;
    const remainingMs = geminiBudgetMs - (Date.now() - startedAt);
    if (remainingMs < 1_500) break;
    attempts += 1;
    try {
      const compactInstruction = "\n\nCOMPACT RETRY REQUIREMENTS: An earlier response was incomplete or invalid. Regenerate the ENTIRE response from scratch as exactly one complete, valid JSON object; never continue a partial response. Keep code concise and omit comments, verbose prose, repeated data, and decorative extras. Preserve every required core feature, controls, correct file paths, and valid project spec. For a build, prefer a small complete playable first version over a huge implementation. Keep the combined source compact enough to fit this response; do not put literal unescaped newlines inside JSON string values.";
      const attemptParts = attempt.fallback
        ? [{ text: userInput + compactInstruction }, ...parts.slice(1)]
        : parts;
      const candidate = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + attempt.model + ":generateContent", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": attempt.key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: AGENT_SYSTEM }] },
          contents: [{ role: "user", parts: attemptParts }],
          generationConfig: {
            ...(body.operation === "research" ? {} : { responseMimeType: "application/json" }),
            temperature: body.operation === "interview" ? 0.35 : 0.2,
            maxOutputTokens: body.operation === "buildPart"
              ? (attempt.fallback ? 5_120 : 6_144)
              : body.operation === "build" || body.operation === "surprise" || body.operation === "edit"
                ? (attempt.fallback ? 6_144 : 10_240)
                : body.operation === "plan"
                  ? (attempt.fallback ? 5_120 : 8_192)
                  : body.operation === "chat" || body.operation === "research"
                    ? (attempt.fallback ? 4_096 : 8_192)
                    : body.operation === "enhancePrompt"
                      ? 2_048
                      : (attempt.fallback ? 2_560 : 4_096),
            thinkingConfig: { thinkingLevel: attempt.fallback || body.thinking === "fast" ? "low" : thinkingLevel }
          },
          ...(body.operation === "research" ? { tools: [{ googleSearch: {} }] } : {})
        }),
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(Math.min(attempt.fallback ? 18_000 : 22_000, remainingMs - 1_000))])
      });
      const candidatePayload = await candidate.json().catch(() => null);
      const candidateText = candidatePayload?.candidates?.[0]?.content?.parts
        ?.map((p: { text?: string }) => p.text || "").join("\n") || "";
      const finishReason = String(candidatePayload?.candidates?.[0]?.finishReason || "");

      if (candidate.ok && finishReason === "MAX_TOKENS") {
        outputFailure = "truncated";
        lastFailure = { status: 422, detail: "Gemini finished with MAX_TOKENS; the JSON response was truncated." };
        for (const fallbackModel of fallbackModels.slice(1)) enqueue(attempt.key, fallbackModel, true);
        for (const key of apiKeys.slice(1, 3)) enqueue(key, fallbackModels[fallbackModels.length - 1], true);
        continue;
      }

      if (candidate.ok && candidateText.trim()) {
        const expectsJson = body.operation !== "research" || candidateText.trim().startsWith("{") || candidateText.trim().startsWith("```");
        let validJson = !expectsJson;
        if (expectsJson) {
          try {
            let cleaned = candidateText.trim();
            if (cleaned.startsWith("```")) cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
            JSON.parse(cleaned);
            validJson = true;
          } catch {
            validJson = false;
          }
        }

        if (!validJson) {
          outputFailure = "malformed";
          lastFailure = { status: 422, detail: "Gemini returned incomplete or invalid JSON even though the request completed." };
          for (const fallbackModel of fallbackModels.slice(1)) enqueue(attempt.key, fallbackModel, true);
          continue;
        }

        payload = candidatePayload;
        successfulModel = attempt.model;
        outputFailure = null;
        break;
      }

      lastFailure = {
        status: candidate.status || 502,
        detail: candidatePayload?.error?.message || (candidateText ? "Gemini returned no complete candidate text." : "Gemini returned an empty response.")
      };

      if (candidate.status === 429 || /resource_exhausted|quota exceeded|rate.?limit/i.test(lastFailure.detail)) {
        for (const key of apiKeys.slice(1, 5)) enqueue(key, model, false);
        for (const fallbackModel of fallbackModels.slice(1)) enqueue(apiKeys[0], fallbackModel, true);
      } else if (candidate.status === 503 || candidate.status === 500 || candidate.status === 502 || candidate.status === 504) {
        for (const fallbackModel of fallbackModels.slice(1)) enqueue(attempt.key, fallbackModel, true);
        for (const key of apiKeys.slice(1, 3)) enqueue(key, attempt.model, true);
      } else if (candidate.status === 401 || candidate.status === 403) {
        for (const key of apiKeys.slice(1, 5)) enqueue(key, attempt.model, attempt.fallback);
      } else {
        break;
      }
    } catch (error) {
      if (request.signal.aborted) return jsonError("Request cancelled by the client.", 499, "GENE_REQUEST_CANCELLED");
      const message = error instanceof Error ? error.message : "Network request failed.";
      lastFailure = { status: 504, detail: "Gemini request timed out or the connection stalled (" + message + ")" };
      for (const fallbackModel of fallbackModels.slice(1)) enqueue(attempt.key, fallbackModel, true);
    }
  }

  // Cross-provider fallback (free routes only). Gemini is the default, not a hard dependency.
  // The router reads OpenRouter's live catalog, keeps only models whose prompt and completion
  // prices are zero, and rotates through Groq plus those free models. It never calls a model
  // that is not verified free, to avoid unexpected provider charges.
  let chainTried: string[] = [];
  let chainDiagnostics: string[] = [];
  if (!payload && hasAlternateProviderKeys()) {
    const isBuild = ["build", "surprise", "edit", "buildPart"].includes(body.operation);
    const system = isBuild ? "You are GENE, a reliable pro-game builder. Return exactly one valid JSON object, no markdown. For a full browser game build, include reply (string), plan (object with title, summary and engine), and files (array) containing non-empty game.html, game.css, game.js, and game-spec.json. Make the game compact, playable, responsive, and self-contained with no external network assets. Preserve user intent and requested engine. Implement a polished, genuinely playable vertical slice: clear controls, responsive movement, real collisions/interactions, a difficulty ramp, feedback, pause/resume, restart, reachable win/loss states, and a coherent visual identity. Do not use fake buttons or claim unimplemented features. AUDIO IS PART OF THE REQUIRED BUILD CONTRACT: use the built-in GeneAudio runtime kit. Call GeneAudio.music.start('exploration') from the real start/play gesture, call GeneAudio.sfx('start') and at least two other named SFX from real gameplay/UI events, and expose settings with GeneAudio.createSettingsPanel(container) or a working volume/mute control. Do not merely mention audio in game-spec.json; wire it to actual events and list events in the spec audio metadata. Keep audio calls safe and rely on the injected kit rather than creating an unrelated audio manager. Verify the plan title/summary/engine and all four files are present. No provider branding or watermark unless requested." : AGENT_SYSTEM + "\n\nYou are running as an alternate provider inside GENE. Follow the same file contract and safety constraints. Return one complete JSON object only.";
    const chain = await runAlternateChain({
      system,
      user: userInput + "\n\nALTERNATE PROVIDER COMPACT OUTPUT: Return valid JSON only. For buildPart return exactly one requested file. No markdown. Keep the implementation compact but complete.",
      maxTokens: body.operation === "buildPart" ? 5_500 : isBuild ? 7_000 : body.operation === "plan" ? 5_000 : body.operation === "chat" || body.operation === "research" ? 6_000 : 3_000,
      temperature: body.operation === "interview" ? 0.35 : 0.2,
      json: true,
      deadline: startedAt + totalBudgetMs,
      signal: request.signal,
      // Whole-game JSON needs longer than a chat completion. Spend the remaining
      // request budget on fewer, meaningful build attempts instead of timing out
      // every capable model at seven seconds.
      perCallMs: isBuild ? 12_000 : 7_000,
      maxAttempts: isBuild ? 4 : 7,
      siteTitle: "GENE Builder",
      validate: text => {
        const json = extractJsonObjectText(text);
        if (!json) return false;
        try {
          const value = JSON.parse(json);
          if (!value || typeof value !== "object" || typeof value.reply !== "string" || !value.reply.trim()) return false;
          if (body.operation === "plan" && (!value.plan || typeof value.plan !== "object")) return false;
          if (body.operation === "interview" && !value.question && !value.plan) return false;
          if (["build", "surprise"].includes(body.operation)) {
            if (!value.plan || !Array.isArray(value.files)) return false;
            const paths = new Set(value.files.map((file: any) => file?.path));
            if (!["game.html", "game.css", "game.js", "game-spec.json"].every(path => paths.has(path))) return false;
          }
          if (body.operation === "buildPart") {
            return Array.isArray(value.files) && value.files.length === 1 &&
              value.files[0]?.path === body.stagePath && typeof value.files[0]?.content === "string" &&
              value.files[0].content.trim().length > 40;
          }
          if (body.operation === "edit" && (!Array.isArray(value.files) || value.files.length === 0)) return false;
          if (["chat", "research", "enhancePrompt"].includes(body.operation) && typeof value.reply !== "string") return false;
          return true;
        } catch { return false; }
      }
    });
    if (chain.ok) {
      payload = { candidates: [{ content: { parts: [{ text: extractJsonObjectText(chain.text) as string }] }, finishReason: "STOP" }] };
      successfulModel = chain.model;
      successfulProvider = chain.provider;
      outputFailure = null;
    } else {
      lastFailure = { status: chain.failure.status, detail: chain.failure.detail };
      if (chain.failure.provider !== "none") lastFailureProvider = chain.failure.provider;
      chainTried = chain.triedModels;
      chainDiagnostics = chain.attemptDetails || [];
      if (chain.truncated) outputFailure = "truncated";
      else if (chain.malformed) outputFailure = "malformed";
    }
  }

  if (!payload && ["interview", "plan"].includes(body.operation)) {
    // Interview and planning are explicitly AI operations. Never silently substitute
    // the deterministic interview tree when all configured providers fail.
    return jsonError(
      "GENE could not complete this AI " + body.operation + " because every configured AI provider failed. Your answers and existing project are preserved. Retry when a provider is available. Native mode is intentionally unavailable for interview and planning.",
      503,
      "GENE_AI_PROVIDER_UNAVAILABLE"
    );
  }

  if (!payload && body.operation === "buildPart" && !request.signal.aborted) {
    // If all configured providers fail (including rejected keys), preserve progress by using
    // the local deterministic generator for this one requested file. Never mislabel it as AI.
    try {
      const nativeResult = await createNativeResult({ ...body, operation: "buildPart" });
      const normalized = normalizeAgentResult(
        nativeResult as AgentResponse,
        "buildPart",
        body.project?.plan || undefined,
        projectKind,
        body.project?.name || "Untitled Project",
        projectKind === "app" ? "webapp" : body.project?.preferredEngine === "webgl3d" ? "webgl3d" : "canvas2d"
      );
      const safeFiles = validateFiles(normalized.files || [], "buildPart", body.project?.plan?.engine, body.mode, projectKind, false);
      if (safeFiles.length !== 1 || safeFiles[0]?.path !== body.stagePath || safeFiles[0].content.length > 500_000) {
        throw new Error("Native fallback did not return exactly the requested safe file.");
      }
      normalized.files = safeFiles;
      normalized.reply = "AI providers were unavailable or rejected access. GENE used its built-in deterministic recovery generator for this file, then applied source validation. This is a native fallback, not an AI-generated result.";
      return NextResponse.json({ ok: true, aiMode: "native-fallback", model: "GENE Native Recovery", result: normalized });
    } catch (nativeError) {
      if (request.signal.aborted) return jsonError("Request cancelled by the client.", 499, "GENE_REQUEST_CANCELLED");
      // Keep the original provider error below; it is more actionable than a generic fallback failure.
    }
  }

  if (!payload) {
    if (chainTried.length) {
      const detail = [
        lastFailure.detail || "No additional provider detail was returned.",
        chainDiagnostics.length ? "Per-model diagnostics: " + chainDiagnostics.join(" | ") : ""
      ].filter(Boolean).join(" | ").slice(0, 1_600);
      const summary = "GENE tried Gemini and then " + chainTried.length + " free backup model(s) (" + chainTried.join(", ") + "). ";
      // Some gateways incorrectly report oversized prompts as HTTP 400/403. Do not
      // misdiagnose those model-specific limits as a rejected deployment API key.
      if (/request (?:is )?too large|context length|maximum context|context window|input (?:is )?too long|prompt (?:is )?too long|exceeds? (?:the )?(?:model )?(?:context|token|input)|token limit for (?:this )?model|too many input tokens/i.test(detail)) {
        return jsonError(summary + "The request exceeded a backup model context/request-size limit. GENE skipped incompatible models, but this task still needs a smaller staged request. Existing project files were preserved. Retry by building one stage/file at a time or shorten the design brief. Detail: " + detail, 413, "GENE_REQUEST_TOO_LARGE");
      }
      if (lastFailure.status === 401 || lastFailure.status === 403) {
        const providerKeyName = /groq/i.test(lastFailureProvider) ? "GROQ_API_KEY" : /openrouter/i.test(lastFailureProvider) ? "OPENROUTER_API_KEY" : "the selected provider key";
        return jsonError(summary + lastFailureProvider + " rejected its API key or account access. Check only " + providerKeyName + " in the deployment environment; remove that key only if you intentionally no longer use that provider. GENE will not delete secrets automatically. Your existing project files were preserved. Detail: " + detail, 503, "OPENROUTER_KEY_REJECTED");
      }
      if (lastFailure.status === 429 || /rate.?limit|too many requests|quota|capacity/i.test(detail)) {
        return jsonError(summary + "Free routes are rate-limited or out of capacity right now. Wait a minute and retry, or add another free Gemini key (GEMINI_API_KEY_2). Your existing project files were preserved. Detail: " + detail, 503, "OPENROUTER_RATE_LIMITED");
      }
      return jsonError(summary + "None of them completed this request. GENE discovers free models automatically, so no model setting needs changing; retry shortly or add another free provider key. Your existing project files were preserved. Detail: " + detail, 503, "OPENROUTER_FALLBACK_FAILED");
    }
    if (outputFailure) {
      const truncated = outputFailure === "truncated";
      return jsonError(
        (truncated
          ? "The AI response reached an output limit before completing its JSON. GENE tried compact retries and alternate configured models, but none returned a complete file. "
          : "The AI returned malformed JSON after retrying with compact output and alternate configured models. ") +
        "No project files were changed. GENE can safely retry this individual stage with a smaller implementation; keep optional features for later chat edits.",
        502,
        truncated ? "GEMINI_OUTPUT_TRUNCATED" : "GEMINI_OUTPUT_INVALID"
      );
    }
    const failure = describeGeminiFailure(lastFailure.status, lastFailure.detail, attempts);
    const status = failure.code === "GEMINI_QUOTA_EXHAUSTED" ? 429 : failure.code === "GEMINI_KEY_REJECTED" ? 502 : 503;
    return jsonError(
      lastFailure.status === 504
        ? "Gemini timed out after " + attempts + " attempt(s). The request budget was capped to protect the Vercel function. No files were changed. Last detail: " + lastFailure.detail
        : failure.message,
      status,
      lastFailure.status === 504 ? "GEMINI_TIMEOUT" : failure.code
    );
  }

  const text = payload?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("\n") || "";
  if (!text.trim()) return jsonError("Gemini returned an empty response. No files were changed.", 502, "GEMINI_EMPTY_RESPONSE");

  let result: AgentResponse;
  let reviewedBy = "";
  try {
    if (body.operation === "research" && !text.trim().startsWith("{") && !text.trim().startsWith("```")) {
      result = { reply: text.trim(), files: [], question: null, plan: null, complete: true, needsUserDecision: false };
    } else {
      result = parseModelJson(text);
    }
    result = normalizeAgentResult(
      result,
      body.operation,
      body.project?.plan || undefined,
      projectKind,
      body.project?.name || body.project?.plan?.title || "Untitled Project",
      projectKind === "app" ? "webapp" : body.project?.preferredEngine === "webgl3d" ? "webgl3d" : "canvas2d"
    );
    if (result.plan) result.plan.engine = projectKind === "app" ? "webapp" : body.project?.preferredEngine === "canvas2d" || body.project?.preferredEngine === "webgl3d" ? body.project.preferredEngine : result.plan.engine;
    // A model can return valid JSON containing broken JavaScript. Catch that before
    // normal build validation and ask a backup model for a syntax-only repair so one
    // stray token does not discard the entire generated game.
    if (["build", "surprise", "buildPart", "edit"].includes(body.operation) && Array.isArray(result.files)) {
      const broken = result.files.filter(file => /\.(?:m?js|cjs)$/i.test(file.path)).filter(file => {
        try { new Function(file.content); return false; } catch { return true; }
      });
      const syntaxDiagnostics = broken.map(file => {
        try { new Function(file.content); return { path: file.path, error: "Unknown parse error" }; }
        catch (error) { return { path: file.path, error: error instanceof Error ? error.message : String(error) }; }
      });
      if (broken.length && hasAlternateProviderKeys() && Date.now() - startedAt < totalBudgetMs - 7_000) {
        try {
          const repair = await runAlternateChain({
            system: "You are GENE's JavaScript syntax repair tool. Repair ONLY parse/syntax errors in the supplied JavaScript files. Preserve the requested gameplay, logic, controls, APIs and behavior. Do not refactor, add features, invent dependencies, or change paths. Return one JSON object {reply:string,files:[{path:string,content:string}]} with complete replacements only for the listed broken files. If uncertain return files:[] . No markdown.",
            user: "Fix parse errors only. The supplied JavaScript did not pass new Function syntax validation. Exact parser diagnostics:\\n" + JSON.stringify(syntaxDiagnostics) + "\\nBroken files (return complete replacements only for these paths):\\n" + JSON.stringify(broken.map(file => ({ path: file.path, content: file.content.slice(0, 45000) }))),
            maxTokens: 6_000,
            temperature: 0,
            json: true,
            deadline: Math.min(startedAt + totalBudgetMs - 500, Date.now() + 9_000),
            signal: request.signal,
            perCallMs: 5_000,
            maxAttempts: 2,
            groqLimit: 1,
            openrouterLimit: 1,
            siteTitle: "GENE Syntax Repair",
            validate: text => extractJsonObjectText(text) !== null
          });
          if (repair.ok) {
            const repaired = JSON.parse(extractJsonObjectText(repair.text) as string);
            const allowed = new Set(broken.map(file => file.path));
            if (Array.isArray(repaired.files) && repaired.files.length > 0 && repaired.files.every((file: any) => file && allowed.has(file.path) && typeof file.content === "string" && file.content.length > 0)) {
              const replacements = new Map<string, string>(repaired.files.map((file: { path: string; content: string }) => [file.path, file.content] as [string, string]));
              const candidates = result.files.map(file => replacements.has(file.path) ? { ...file, content: replacements.get(file.path)! } : file);
              const allValid = candidates.filter(file => /\.(?:m?js|cjs)$/i.test(file.path)).every(file => {
                try { new Function(file.content); return true; } catch { return false; }
              });
              if (allValid) {
                result.files = candidates;
                result.reply += "\\n\\nGENE repaired a generated JavaScript syntax error before validation.";
              }
            }
          }
        } catch {
          if (request.signal.aborted) return jsonError("Request cancelled by the client.", 499, "GENE_REQUEST_CANCELLED");
        }
      }
    }
    // Independent second-opinion review is ON by default whenever a free backup provider key is
    // configured and enough time budget remains. Set GENE_AI_REVIEW=false to disable it.
    const reviewEnabled = process.env.GENE_AI_REVIEW?.trim().toLowerCase() !== "false" &&
      hasAlternateProviderKeys() &&
      Date.now() - startedAt < totalBudgetMs - 12_000 &&
      ["buildPart", "build", "surprise", "edit", "chat"].includes(body.operation) &&
      Array.isArray(result.files) && result.files.length > 0;
    if (reviewEnabled) {
      try {
        const candidatePaths = new Set(result.files!.map(file => file.path));
        const reviewInput = {
          operation: body.operation,
          stagePath: body.stagePath || null,
          projectKind,
          plan: body.project?.plan || result.plan || null,
          existingFiles: Object.fromEntries(Object.entries(body.project?.files || {}).filter(([path]) => isSafeProjectPath(path)).map(([path, content]) => [path, String(content).slice(0, 12_000)])),
          candidateFiles: result.files!.map(file => ({ path: file.path, content: file.content.slice(0, 55_000) }))
        };
        const review = await runAlternateChain({
          system: "You are GENE's independent game-quality and code reviewer. Review the requested game, plan, and complete candidate files as a playable indie-game vertical slice, not merely syntactically valid code. Prioritize critical blockers: boot failures, missing/incorrect input bindings, player movement or core mechanic that never works, broken collision/interactions, unreachable objectives, impossible win/loss state, broken restart/pause, state bugs, missing DOM IDs, undefined functions/variables, and crashes. Also check that the requested genre/camera/engine is preserved; visual hierarchy distinguishes player, threats, collectibles and goal; important actions have visible feedback; progression has at least a few meaningful beats; and no core feature is a fake button or unimplemented claim. For 2D canvas inspect delta-time, resize handling and input cleanup; for 3D inspect actual perspective/depth/camera/lighting rather than a fake 3D label. Specifically look for arrays (hazards, enemies, bullets, particles) read before initialization, audio calls unsafe while suspended, and runaway loops or allocations. Do not rewrite sound code for style or invent missing assets. Return one JSON object: {reply:string,files:[{path:string,content:string}]}. If sound or you cannot confidently fix it, return files:[] and summarize the highest-risk issue briefly. If changing code, return complete replacements only for paths already present in candidateFiles, make the smallest safe fix, and preserve user intent and no-watermark rule. No markdown.",
          user: "Review this candidate before GENE validates/saves it. Return full replacement files only for high-confidence fixes.\n" + JSON.stringify(reviewInput),
          maxTokens: body.operation === "buildPart" ? 6_000 : 8_000,
          temperature: 0.1,
          json: true,
          deadline: Math.min(startedAt + totalBudgetMs - 500, Date.now() + 10_000),
          signal: request.signal,
          perCallMs: 6_000,
          maxAttempts: 2,
          groqLimit: 1,
          openrouterLimit: 2,
          siteTitle: "GENE Builder Reviewer",
          validate: text => extractJsonObjectText(text) !== null
        });
        if (review.ok) {
          const reviewResult = JSON.parse(extractJsonObjectText(review.text) as string);
          if (Array.isArray(reviewResult.files) && reviewResult.files.length > 0 &&
              reviewResult.files.every((file: any) => file && candidatePaths.has(file.path) && typeof file.content === "string" && file.content.length > 0)) {
            const replacements = new Map<string, string>(reviewResult.files.map((file: { path: string; content: string }) => [file.path, file.content] as [string, string]));
            const reviewedFiles = result.files!.map(file => replacements.has(file.path) ? { ...file, content: replacements.get(file.path)! } : file);
            // Only accept reviewer output that still parses; a broken "fix" must never replace good code.
            let reviewedSyntaxOk = true;
            for (const file of reviewedFiles) {
              if (/\.js$/i.test(file.path)) {
                try { new Function(file.content); } catch { reviewedSyntaxOk = false; }
              }
            }
            if (reviewedSyntaxOk) {
              result.files = reviewedFiles;
              result.reply = result.reply + "\n\nA second AI reviewer checked the code and suggested targeted corrections before validation.";
              reviewedBy = review.provider + "/" + review.model;
            }
          } else if (typeof reviewResult.reply === "string" && reviewResult.reply.trim()) {
            reviewedBy = review.provider + "/" + review.model;
          }
        }
      } catch {
        if (request.signal.aborted) return jsonError("Request cancelled by the client.", 499, "GENE_REQUEST_CANCELLED");
        // Independent review is best-effort; it must never block an otherwise valid build.
      }
    }
    const titleCandidates = [result.plan?.title, body.project?.plan?.title, body.project?.name, body.project?.initialPrompt, body.message];
    result.files = ensureProjectSpecTitle(result.files || [], titleCandidates);
    const enforceAudioForThisResponse = !["edit", "chat", "buildPart", "interview", "plan", "research"].includes(body.operation);
    // If the full-game lexical analyzer catches cross-module globals or out-of-scope names,
    // give a backup model one bounded repair pass before rejecting the whole generated project.
    // Accept changes only when every executable module parses and the complete project passes again.
    if (projectKind === "game" && ["build", "surprise"].includes(body.operation) &&
        Array.isArray(result.files) && hasAlternateProviderKeys() &&
        Date.now() - startedAt < totalBudgetMs - 9_000) {
      const scopeAudit = analyzeProjectScripts(result.files, { scopeChecks: true });
      if (scopeAudit.errors.length) {
        try {
          const affectedPaths = [...new Set(scopeAudit.errors.map(issue => issue.path))];
          const repairableFiles = result.files.filter(file => affectedPaths.includes(file.path) && /\.(?:m?js|cjs)$/i.test(file.path));
          const projectMap = Object.fromEntries(result.files.map(file => [file.path, file.content]));
          const scopeRepair = await runAlternateChain({
            system: "You are GENE's cross-module integration repair tool. Fix only the reported undeclared/out-of-scope JavaScript identifiers and module API wiring. Files load as separate classic scripts: a local const/let inside game.js or an IIFE is NOT visible inside src/*.js. Do not depend on another file's private variables. Use the documented window.GeneModules APIs or define state locally in the owning module and expose a small explicit API. Preserve the requested game, genre, mechanics, controls and visual design. Return one JSON object {reply:string,files:[{path:string,content:string}]}, with complete replacements only for the affected paths. No markdown.",
            user: "Repair these full-project static safety findings before GENE saves this game. Findings:\n" +
              JSON.stringify(scopeAudit.errors.map(issue => ({ path: issue.path, name: issue.name, kind: issue.kind, message: issue.message }))) +
              "\nProject file paths and module contracts:\n" +
              JSON.stringify({ files: Object.keys(projectMap), architecture: (() => { try { return JSON.parse(projectMap["game-spec.json"] || "{}").architecture || null; } catch { return null; } })() }) +
              "\nAffected source files:\n" +
              JSON.stringify(repairableFiles.map(file => ({ path: file.path, content: file.content.slice(0, 42000) }))),
            maxTokens: 7_000,
            temperature: 0,
            json: true,
            deadline: Math.min(startedAt + totalBudgetMs - 500, Date.now() + 8_000),
            signal: request.signal,
            perCallMs: 4_000,
            maxAttempts: 2,
            groqLimit: 1,
            openrouterLimit: 2,
            siteTitle: "GENE Module Integration Repair",
            validate: text => extractJsonObjectText(text) !== null
          });
          if (scopeRepair.ok) {
            const repairResult = JSON.parse(extractJsonObjectText(scopeRepair.text) as string);
            const allowedPaths = new Set(affectedPaths);
            if (Array.isArray(repairResult.files) && repairResult.files.length > 0 &&
                repairResult.files.every((file: any) => file && allowedPaths.has(file.path) &&
                  /\.(?:m?js|cjs)$/i.test(file.path) && typeof file.content === "string" && file.content.length > 0)) {
              const replacements = new Map<string, string>(repairResult.files.map((file: { path: string; content: string }) => [file.path, file.content] as [string, string]));
              const candidates = result.files.map(file => replacements.has(file.path) ? { ...file, content: replacements.get(file.path)! } : file);
              const syntaxOk = candidates.filter(file => /\.(?:m?js|cjs)$/i.test(file.path)).every(file => {
                try { new Function(file.content); return true; } catch { return false; }
              });
              const reAudit = syntaxOk ? analyzeProjectScripts(candidates, { scopeChecks: true }) : null;
              if (reAudit && reAudit.errors.length === 0) {
                result.files = candidates;
                result.reply += "\n\nGENE repaired cross-module identifier/API wiring and re-ran the full project safety audit successfully.";
              }
            }
          }
        } catch {
          if (request.signal.aborted) return jsonError("Request cancelled by the client.", 499, "GENE_REQUEST_CANCELLED");
        }
      }
    }
    const files = validateFiles(result.files || [], body.operation, result.plan?.engine || body.project?.plan?.engine, body.mode, projectKind, enforceAudioForThisResponse);
    if (body.operation === "buildPart") {
      const requestedPath = body.stagePath;
      if (!isSafeProjectPath(requestedPath)) {
        throw new Error("Staged build is missing a valid requested file path.");
      }
      if (files.length !== 1 || files[0]?.path !== requestedPath) {
        throw new Error("Staged build must return exactly the requested file: " + requestedPath + ". No files were changed.");
      }
      if (files[0].content.length > 500_000) {
        throw new Error("Staged file exceeded the compact 120 KB per-file budget. No files were changed.");
      }
    }
    result.files = files;
    if ((body.operation === "edit" || body.operation === "chat") && files.length > 0 && body.project?.files) {
      const patchOperations = files.map(file => {
        const previous = body.project.files[file.path];
        return typeof previous === "string"
          ? (previous.length
            ? { op: "replace_exact" as const, path: file.path, expected: previous, replacement: file.content }
            : { op: "replace_range" as const, path: file.path, startLine: 1, endLine: 1, replacement: file.content })
          : { op: "add_file" as const, path: file.path, content: file.content };
      });
      const patched = applyPatchBatch(body.project.files, patchOperations);
      const mergedFiles = ensureProjectSpecTitle(
        Object.entries(patched.files).map(([path, fileContent]) => ({ path, content: String(fileContent) })),
        titleCandidates
      );
      validateFiles(mergedFiles, "build", result.plan?.engine || body.project?.plan?.engine, "build", projectKind, false);
    }
    if (body.operation === "interview" && !result.question && !result.plan) {
      throw new Error("Interview result must ask exactly one next question or return a completed plan.");
    }
    if (body.operation === "plan" && !result.plan) {
      throw new Error("Planning response is missing its structured plan. No files were changed.");
    }
    if (body.operation === "research" && files.length > 0) {
      throw new Error("Research is read-only; source file output was rejected.");
    }
    if (body.operation === "edit" && body.project?.files && files.some(file => body.project.files[file.path] === file.content)) {
      throw new Error("Edit response included unchanged source. No files were changed; ask GENE for a more specific patch.");
    }
    if (body.operation === "research") {
      const chunks = payload?.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const seen = new Set<string>();
      const sources: Array<{ title: string; uri: string }> = [];
      for (const chunk of chunks) {
        const web = chunk?.web;
        if (typeof web?.uri === "string" && /^https?:\/\//i.test(web.uri) && !seen.has(web.uri)) {
          seen.add(web.uri);
          sources.push({ title: String(web.title || web.uri), uri: web.uri });
        }
      }
      if (sources.length) {
        result.reply += "\n\nSources\n" + sources.slice(0, 8).map((source, index) => (index + 1) + ". " + source.title + " — " + source.uri).join("\n");
      } else {
        result.reply += "\n\nGENE did not receive source URLs from Google Search grounding for this response. Treat this as model-generated guidance, not verified live research.";
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid model output.";
    return NextResponse.json({
      ok: false,
      aiMode: "gemini",
      error: {
        code: "GENE_VALIDATION_FAILED",
        message: message + " The result was rejected; no files were saved."
      },
      rawPreview: text.slice(0, 1200)
    }, { status: 422 });
  }

  if (forge2DAssets.length && Array.isArray(result.files) && body.operation !== "buildPart") {
    const generatedAssetFiles: Array<{ path: string; content: string }> = [];
    for (const asset of forge2DAssets) {
      const base = "assets/forge2d/" + asset.kind;
      const manifest = JSON.stringify({ ...asset.manifest, kind: asset.kind, name: asset.name, source: "GENE Native 2D Forge", qualityReport: asset.qualityReport }, null, 2);
      if (asset.svg.length <= 300_000 && isSafeProjectPath(base + ".svg")) generatedAssetFiles.push({ path: base + ".svg", content: asset.svg });
      if (manifest.length <= 100_000 && isSafeProjectPath(base + ".json")) generatedAssetFiles.push({ path: base + ".json", content: manifest });
      // Include separately cropped frame assets so runtime loaders do not mistake the entire
      // atlas for a single character image. Keep the source atlas for editing/re-import.
      if (asset.frameFiles && typeof asset.frameFiles === "object") {
        for (const [frameName, frameSvg] of Object.entries(asset.frameFiles)) {
          const framePath = base + "/frames/" + frameName;
          if (typeof frameSvg === "string" && frameSvg.length <= 100_000 && isSafeProjectPath(framePath)) {
            generatedAssetFiles.push({ path: framePath, content: frameSvg });
          }
        }
      }
    }
    const paths = new Set(generatedAssetFiles.map(file => file.path));
    result.files = [...result.files.filter((file: any) => !paths.has(file.path)), ...generatedAssetFiles];
    result.reply += "\n\nGENE Forge 2D — generated " + forge2DAssets.length + " native vector asset(s): " +
      forge2DAssets.map(asset => asset.kind + " (" + asset.qualityReport.svgBytes + " SVG bytes)").join(", ") +
      ". Source SVG and manifest files are included under assets/forge2d/. The build prompt received their exact paths; verify game.js loads and renders them before claiming in-game integration.";
  }
  if (forgeToolAssets.length && Array.isArray(result.files)) {
    const generatedAssetFiles: Array<{ path: string; content: string }> = [];
    for (const asset of forgeToolAssets) {
      const entries: Array<[string, string]> = [
        ["assets/models/" + asset.kind + ".obj", asset.files["model.obj"].replace(/mtllib\s+model\.mtl/g, "mtllib " + asset.kind + ".mtl")],
        ["assets/models/" + asset.kind + ".mtl", asset.files["model.mtl"]],
        ["assets/models/" + asset.kind + ".json", asset.files["asset.json"]]
      ];
      for (const [path, content] of entries) {
        if (typeof content !== "string" || content.length > 490_000 || !isSafeProjectPath(path)) continue;
        generatedAssetFiles.push({ path, content });
      }
    }
    const assetPaths = new Set(generatedAssetFiles.map(file => file.path));
    result.files = [...result.files.filter((file: any) => !assetPaths.has(file.path)), ...generatedAssetFiles];
    result.reply += "\n\nGENE Forge — completed stages: building " + forgeToolAssets.map(asset => asset.kind).join(", building ") + "; applying per-part colours and material types; validating geometry and bounds; exporting matching OBJ/MTL/JSON files; passing the generated recipes into the game build.\n\nForge generated " + forgeToolAssets.length + " validated 3D asset recipe(s) (" + forgeToolAssets.map(asset => asset.kind + ": " + asset.partCount + " parts").join(", ") + "). Source assets are included under assets/models/.";
  }
  // Do not report generated Forge assets as integrated merely because files were packaged.
  // Inspect the submitted JavaScript and clearly distinguish available project assets from
  // assets that the playable game actually references.
  if (Array.isArray(result.files) && forge2DAssets.length) {
    const gameScripts = result.files
      .filter((file: any) => /\\.(?:m?js|cjs)$/i.test(file.path))
      .map((file: any) => String(file.content || ""))
      .join("\\n");
    const missingForgeIntegration = forge2DAssets.filter(asset => {
      const assetPath = "assets/forge2d/" + asset.kind;
      if (asset.kind === "character" && Array.isArray(asset.manifest.animationClips) && asset.manifest.animationClips.length) {
        return !gameScripts.includes("GENE_SPRITES.draw") || !gameScripts.includes(assetPath);
      }
      return !gameScripts.includes(assetPath + ".svg") &&
        !gameScripts.includes("GENE_ART") &&
        !gameScripts.includes("GENE_ART.image") &&
        !gameScripts.includes("GENE_ART.draw");
    });
    if (missingForgeIntegration.length) {
      result.reply += "\\n\\nGENE Forge integration check: these assets are included in the project but could not be confirmed as used by the game's JavaScript: " +
        missingForgeIntegration.map(asset => asset.kind).join(", ") +
        ". They are packaged assets, not verified in-game artwork. The build needs a follow-up repair to load and draw them before claiming they are visible in gameplay.";
    } else {
      result.reply += "\\n\\nGENE Forge integration check: generated 2D assets have matching references in the game's JavaScript. This confirms code references only; actual browser visibility and animation still require runtime acceptance.";
    }
  }
  if (request.signal.aborted) return jsonError("Request cancelled by the client.", 499, "GENE_REQUEST_CANCELLED");
  return NextResponse.json({ ok: true, aiMode: successfulProvider, model: successfulModel, ...(reviewedBy ? { reviewedBy } : {}), result });
}