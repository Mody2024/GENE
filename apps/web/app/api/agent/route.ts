import { NextRequest, NextResponse } from "next/server";
import { AGENT_SYSTEM, makeAgentInput } from "../../lib/prompts";
import type { AgentResponse } from "../../lib/types";
import { applyPatchBatch } from "../../lib/patch-engine";

export const runtime = "nodejs";
export const maxDuration = 60;

const CORE_FILES = new Set(["game.html", "game.css", "game.js", "game-spec.json"]);
const MAX_PROJECT_FILES = 100;
function isSafeProjectPath(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim() || value.length > 240 || value.includes(String.fromCharCode(92))) return false;
  if (value.startsWith("/") || /^[a-zA-Z]:/.test(value) ||
      value.split("/").some(part => !part || part === "." || part === "..") ||
      value.split("").some(char => char.charCodeAt(0) < 32 || '<>:"|?*'.includes(char))) return false;
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

function normalizeAgentResult(input: AgentResponse, operation: string, existingPlan?: AgentResponse["plan"], projectKind: "game" | "app" = "game"): AgentResponse {
  if (typeof input.reply !== "string" || !input.reply.trim()) throw new Error("GENE response needs a non-empty user-facing reply.");
  const result: AgentResponse = {
    reply: input.reply.trim().slice(0, 12_000),
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
      ...(Array.isArray(q.choices) ? { choices: q.choices.filter((choice: unknown): choice is string => typeof choice === "string" && choice.trim().length > 0).slice(0, 8).map((choice: string) => choice.trim().slice(0, 180)) } : {})
    };
  }

  if (input.plan != null) {
    const plan = input.plan as any;
    if (!plan || typeof plan !== "object") throw new Error("The implementation plan was malformed.");
    if (typeof plan.title !== "string" || !plan.title.trim()) throw new Error("The implementation plan is missing a title.");
    if (typeof plan.summary !== "string" || !plan.summary.trim()) throw new Error("The implementation plan is missing its summary.");
    const validEngine = projectKind === "app" ? plan.engine === "webapp" : (plan.engine === "canvas2d" || plan.engine === "webgl3d");
    if (!validEngine) throw new Error(projectKind === "app" ? "Web app plans must use the webapp engine." : "Game plans must use canvas2d or webgl3d.");
    if (plan.kind && plan.kind !== projectKind) throw new Error("The plan project kind does not match the current project.");
    const tasks = Array.isArray(plan.tasks) ? plan.tasks.filter((task: unknown): task is string => typeof task === "string" && task.trim().length > 0).slice(0, 40).map((task: string) => task.trim().slice(0, 240)) : [];
    const mechanics = Array.isArray(plan.mechanics) ? plan.mechanics.filter((item: unknown): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 30).map((item: string) => item.trim().slice(0, 180)) : [];
    if (tasks.length < 3) throw new Error("The plan must include at least three concrete implementation tasks.");
    if (mechanics.length < 1) throw new Error("The plan must identify at least one concrete feature or gameplay mechanic.");
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

function validateFiles(files: Array<{ path: string; content: string }>, operation: string, plannedEngine?: string, mode?: string, projectKind: "game" | "app" = "game") {
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
  for (const file of normalized) {
    if (/\\.js$/i.test(file.path)) new Function(file.content);
    if (file.path === "game-spec.json") JSON.parse(file.content);
  }
  if (operation === "build" || operation === "surprise") {
    const byPath = Object.fromEntries(normalized.map(f => [f.path, f.content]));
    for (const path of ["game.html", "game.css", "game.js", "game-spec.json"]) {
      if (!byPath[path] || byPath[path].trim().length < 8) throw new Error("Build rejected: required project file " + path + " is missing or empty.");
    }
    new Function(byPath["game.js"]);
    const spec = JSON.parse(byPath["game-spec.json"]);
    if (!spec || typeof spec !== "object" || Array.isArray(spec)) throw new Error("Build rejected: project spec must be a JSON object.");
    if (spec.additionalFiles !== undefined) {
      if (!Array.isArray(spec.additionalFiles) || spec.additionalFiles.length > MAX_PROJECT_FILES - CORE_FILES.size) {
        throw new Error("Build rejected: additionalFiles must be a bounded array of relative project paths.");
      }
      const seenAdditional = new Set<string>();
      for (const path of spec.additionalFiles) {
        if (!isSafeProjectPath(path) || CORE_FILES.has(path) || seenAdditional.has(path)) {
          throw new Error("Build rejected: additionalFiles contains an unsafe, duplicate, or core path.");
        }
        seenAdditional.add(path);
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
    const html = byPath["game.html"];
    const css = byPath["game.css"];
    const js = byPath["game.js"];
    if (/<script\b(?![^>]*\btype\s*=\s*["'](?:application\/json|application\/ld\+json)["'])/i.test(html)) throw new Error("Build rejected: put executable source in game.js, not inline script tags in game.html.");
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
      if (typeof spec.genre !== "string" || !spec.genre.trim()) throw new Error("Build rejected: game spec needs a genre.");
      if (!Array.isArray(spec.mechanics) || spec.mechanics.length < 1 || !spec.mechanics.every((item: unknown) => typeof item === "string" && item.trim())) throw new Error("Build rejected: gameplay mechanics are missing.");
      if (!Array.isArray(spec.controls) || spec.controls.length < 1 || !spec.controls.every((item: unknown) => typeof item === "string" && item.trim())) throw new Error("Build rejected: game controls are missing.");
      if (typeof spec.objective !== "string" || !spec.objective.trim()) throw new Error("Build rejected: the main objective is missing.");
      if (typeof spec.winCondition !== "string" || !spec.winCondition.trim()) throw new Error("Build rejected: the win condition is missing.");
      if (typeof spec.lossCondition !== "string" || !spec.lossCondition.trim()) throw new Error("Build rejected: the loss condition is missing.");
      const budget = spec.performanceBudget;
      if (!budget || !Number.isFinite(budget.targetFps) || budget.targetFps < 30 || budget.targetFps > 120) throw new Error("Build rejected: performanceBudget.targetFps must be between 30 and 120.");
      if (![budget.maxEnemies, budget.maxObjects, budget.maxParticles].every((n: unknown) => Number.isInteger(n) && Number(n) >= 0)) throw new Error("Build rejected: performance budgets must be non-negative integers.");
      if (budget.maxEnemies > 40 || budget.maxObjects > 1200 || budget.maxParticles > 300) throw new Error("Build rejected: requested object, enemy, or particle budget exceeds GENE's conservative limits.");
      if (!/<canvas\b[^>]*\bid=["']game-canvas["']/i.test(html)) throw new Error("Build rejected: game.html must include a canvas with id=game-canvas.");
      if (!/requestAnimationFrame|\.requestAnimationFrame/.test(js)) throw new Error("Build rejected: game.js has no requestAnimationFrame loop.");
      if (!/addEventListener|onkeydown|onkeyup|ontouchstart|onclick/.test(js)) throw new Error("Build rejected: game.js has no detectable input/event handling.");
      const controlsContract = spec.controls.join(" ").toLowerCase();
      if (/keyboard|wasd|arrow keys|key bindings/.test(controlsContract) && !/(keydown|keyup|event\.key|event\.code|keyCode)/i.test(js)) {
        throw new Error("Build rejected: the spec promises keyboard controls but game.js has no detectable keyboard input mapping.");
      }
      if (/touch|mobile|pointer controls/.test(controlsContract) && !/(pointerdown|pointermove|touchstart|touchmove|pointerup|touchend)/i.test(js)) {
        throw new Error("Build rejected: the spec promises touch/pointer controls but game.js has no detectable touch or pointer handlers.");
      }
      if (/gamepad|controller/.test(controlsContract) && !/(getGamepads|gamepadconnected|gamepaddisconnected)/i.test(js)) {
        throw new Error("Build rejected: the spec promises controller support but game.js does not read the Gamepad API.");
      }
      if (spec.engine === "canvas2d" && !/getContext\s*\(\s*["']2d["'](?:\s*,[^)]*)?\s*\)/.test(js)) throw new Error("Build rejected: a canvas2d game must create a CanvasRenderingContext2D.");
      if (spec.engine === "webgl3d") {
        if (!/getContext\s*\(\s*["'](?:webgl2?|experimental-webgl)["'](?:\s*,[^)]*)?\s*\)/i.test(js)) throw new Error("Build rejected: a webgl3d game must request a real WebGL context.");
        for (const [pattern, requirement] of [
          [/createShader\s*\(/, "shader creation"],
          [/shaderSource\s*\(/, "shader source"],
          [/compileShader\s*\(/, "shader compilation"],
          [/createProgram\s*\(/, "shader program creation"],
          [/linkProgram\s*\(/, "shader program linking"],
          [/bufferData\s*\(/, "GPU geometry buffers"],
          [/drawArrays\s*\(|drawElements\s*\(/, "GPU geometry draw calls"]
        ] as Array<[RegExp, string]>) if (!pattern.test(js)) throw new Error("Build rejected: WebGL game is missing " + requirement + ".");
      }
      if (!/fillRect|fillText|drawImage|drawArrays|drawElements|stroke\(|\.fill\(/.test(js)) throw new Error("Build rejected: no detectable draw operation was found. The runtime would likely be blank.");
    }
  }
  return normalized;
}

export async function POST(request: NextRequest) {
  let body: any;
  try { body = await request.json(); } catch { return jsonError("Request body must be valid JSON."); }

  const allowedOperations = ["interview", "plan", "build", "buildPart", "validateBuild", "edit", "chat", "research", "surprise"];
  const projectKind: "game" | "app" = body.project?.kind === "app" ? "app" : "game";
  if (!allowedOperations.includes(body.operation)) return jsonError("Unknown GENE operation.");
  if (!["plan", "build"].includes(body.mode)) return jsonError("Mode must be plan or build.");
  if (body.mode === "plan" && ["build", "buildPart", "edit", "surprise"].includes(body.operation)) {
    return jsonError("Plan mode is read-only. Switch to Build mode before creating or changing project files.", 409, "GENE_PLAN_MODE_READ_ONLY");
  }
  if (typeof body.message !== "string" || !body.message.trim()) return jsonError("Please enter a message.");
  if (body.message.length > 12_000) return jsonError("Message is too long (maximum 12,000 characters).");

  if (body.operation === "validateBuild") {
    try {
      const files = ensureProjectSpecTitle(
        Object.entries(body.project?.files || {}).map(([path, content]) => ({ path, content: String(content) })),
        [body.project?.plan?.title, body.project?.name, body.project?.initialPrompt, body.message]
      );
      validateFiles(files, "build", body.project?.plan?.engine, "build", projectKind);
      return NextResponse.json({
        ok: true,
        aiMode: "validation",
        result: {
          reply: "Assembled project passed GENE's server-side source and project-contract validation.",
          files: [],
          plan: body.project?.plan || null,
          complete: true,
          needsUserDecision: false,
          tests: { passed: ["Required project files present", "Project spec valid", "JavaScript syntax valid", "Runtime contract checks passed"], failed: [] }
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Assembled project failed validation.";
      return jsonError("The staged project did not pass final validation: " + message + " No files were saved. Retry the build or ask GENE to repair the specific stage.", 422, "GENE_STAGED_BUILD_VALIDATION_FAILED");
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
    const answers = body.answers || {};
    const known = Object.keys(answers);
    if (body.operation === "interview") {
      const original = String(body.project?.initialPrompt || body.message || (projectKind === "app" ? "Untitled app" : "Untitled game"));
      const appQuestions = [
        { id: "audience", text: "Who is this app mainly for?", why: "The primary audience determines the main workflow and interface.", choices: ["Just me / personal use", "Customers or the public", "A team or business", "Use smart defaults"] },
        { id: "platform", text: "Where should the app work first?", why: "This determines responsive layout and the most important input patterns.", choices: ["Desktop web", "Mobile web", "Desktop and mobile", "Use smart defaults"] },
        { id: "look", text: "What visual direction fits it?", why: "A concrete art direction makes the app feel designed rather than generic.", choices: ["Minimal and professional", "Bold and playful", "Premium glass / editorial", "Use smart defaults"] },
        { id: "data", text: "Does it need to save user data?", why: "Persistence changes the architecture and validation requirements.", choices: ["No, local temporary state", "Save on this device", "Accounts and cloud data", "Recommend the simplest reliable option"] }
      ];
      const gameQuestions = [
        { id: "genre", text: "What should the core gameplay feel like?", why: "This defines the main loop, challenge, and win/loss rules.", choices: ["Action / combat", "Adventure / story", "Platformer / precision", "Racing / endless runner", "Survival / crafting", "Puzzle / strategy", "Use a creative surprise"] },
        { id: "camera", text: "What perspective should players use?", why: "Camera and perspective affect controls, level design, and performance.", choices: ["2D side view", "2D top-down", "3D first-person", "3D third-person", "Choose what best fits the idea"] },
        { id: "content", text: "What should make the full game worth finishing?", why: "The prototype proves the loop; the full game needs distinct content and progression.", choices: ["Story, missions, and an ending", "Levels with new mechanics", "Runs, unlocks, and replayability", "Co-op or competitive play", "A mix chosen for the idea"] },
        { id: "controls", text: "Which controls must work?", why: "Controls are planned and tested as part of the game, not added as an afterthought.", choices: ["Keyboard and mouse", "Touch controls", "Controller / gamepad", "Keyboard, touch, and controller", "Use the best supported defaults"] }
      ];
      const bank = projectKind === "app" ? appQuestions : gameQuestions;
      const nextQuestion = bank.find(question => !Object.prototype.hasOwnProperty.call(answers, question.id));
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
      const is3d = projectKind === "game" && (/3d|three.?dimensional|subway|runner|driving|horror|first.?person|third.?person/i.test(originalText) || /3d|first-person|third-person/i.test(camera));
      const isApp = projectKind === "app";
      const starterPlan = {
        title: originalText.split(/[.!?]/)[0].slice(0, 64) || (isApp ? "Untitled app" : "Untitled game"),
        kind: projectKind,
        summary: "Built-in starter plan from your interview answers (" + answersSummary.slice(0, 420) + "). This is a rule-based plan, not AI-generated.",
        engine: isApp ? "webapp" : is3d ? "webgl3d" : "canvas2d",
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
      const is3d = projectKind === "game" && /3d|three.?dimensional|subway|runner|driving|horror|first.?person|third.?person/i.test(original);
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
            engine: projectKind === "app" ? "webapp" : is3d ? "webgl3d" : "canvas2d",
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

  const model = typeof body.model === "string" && /^gemini-[a-zA-Z0-9.-]+$/.test(body.model)
    ? body.model
    : (process.env.GENE_FAST_MODEL || "gemini-3.8-flash");
  const thinkingLevel = body.thinking === "fast" ? "low" : body.thinking === "deep" ? "high" : "medium";
  const userInput = makeAgentInput({
    operation: body.operation,
    stagePath: typeof body.stagePath === "string" ? body.stagePath : undefined,
    mode: body.mode,
    message: body.message,
    project: body.project || null,
    history: Array.isArray(body.history) ? body.history : [],
    answers: body.answers || {},
    thinking: thinkingLevel
  });

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
  const geminiBudgetMs = process.env.GROQ_API_KEY?.trim() || process.env.OPENROUTER_API_KEY?.trim() ? 34_000 : totalBudgetMs;

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
            responseMimeType: "application/json",
            temperature: body.operation === "interview" ? 0.35 : 0.2,
            maxOutputTokens: attempt.fallback
              ? (body.operation === "build" || body.operation === "surprise" || body.operation === "edit" ? 6_144 : body.operation === "buildPart" ? 5_120 : 1_536)
              : (body.operation === "build" || body.operation === "surprise" || body.operation === "edit" ? 10_240 : body.operation === "buildPart" ? 6_144 : 3_072),
            thinkingConfig: { thinkingLevel: attempt.fallback || body.thinking === "fast" ? "low" : thinkingLevel }
          },
          ...(body.operation === "research" ? { tools: [{ googleSearch: {} }] } : {})
        }),
        signal: AbortSignal.timeout(Math.min(attempt.fallback ? 18_000 : 22_000, remainingMs - 1_000))
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
      const message = error instanceof Error ? error.message : "Network request failed.";
      lastFailure = { status: 504, detail: "Gemini request timed out or the connection stalled (" + message + ")" };
      for (const fallbackModel of fallbackModels.slice(1)) enqueue(attempt.key, fallbackModel, true);
    }
  }

  // Cross-provider fallback: Gemini is the default, not a hard dependency.
  // Add GROQ_API_KEY and/or OPENROUTER_API_KEY in Vercel to enable these routes.
  if (!payload) {
    const alternateProviders: Array<{ name: string; key: string; endpoint: string; model: string; headers?: Record<string, string> }> = [];
    if (process.env.GROQ_API_KEY?.trim()) {
      alternateProviders.push({
        name: "groq",
        key: process.env.GROQ_API_KEY.trim(),
        endpoint: "https://api.groq.com/openai/v1/chat/completions",
        model: process.env.GENE_GROQ_MODEL?.trim() || "llama-3.3-70b-versatile"
      });
    }
    if (process.env.OPENROUTER_API_KEY?.trim()) {
      alternateProviders.push({
        name: "openrouter",
        key: process.env.OPENROUTER_API_KEY.trim(),
        endpoint: "https://openrouter.ai/api/v1/chat/completions",
        model: process.env.GENE_OPENROUTER_MODEL?.trim() || "qwen/qwen3-coder:free",
        headers: { "HTTP-Referer": "https://gene-flash.vercel.app", "X-Title": "GENE Builder" }
      });
    }
    for (const provider of alternateProviders) {
      if (Date.now() - startedAt > totalBudgetMs - 2_500) break;
      try {
        const isBuild = ["build", "surprise", "edit", "buildPart"].includes(body.operation);
        const system = AGENT_SYSTEM + "\n\nYou are running as an alternate provider inside GENE. Follow the same file contract and safety constraints. Never include provider branding or a watermark in generated projects unless the user explicitly requests it. Return one complete JSON object only.";
        const remainingMs = Math.max(1_000, totalBudgetMs - (Date.now() - startedAt) - 500);
        const response = await fetch(provider.endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + provider.key,
            ...(provider.headers || {})
          },
          body: JSON.stringify({
            model: provider.model,
            messages: [{ role: "system", content: system }, { role: "user", content: userInput + "\n\nALTERNATE PROVIDER COMPACT OUTPUT: Return valid JSON only. For buildPart return exactly one requested file. No markdown. Keep the implementation compact but complete." }],
            response_format: { type: "json_object" },
            temperature: body.operation === "interview" ? 0.35 : 0.2,
            max_tokens: body.operation === "buildPart" ? 5_500 : isBuild ? 7_000 : 2_000
          }),
          signal: AbortSignal.timeout(Math.min(14_000, remainingMs))
        });
        const data = await response.json().catch(() => null);
        const content = data?.choices?.[0]?.message?.content;
        if (!response.ok || typeof content !== "string" || !content.trim()) {
          lastFailure = { status: response.status || 502, detail: provider.name + " fallback: " + String(data?.error?.message || "empty response") };
          continue;
        }
        const alternateFinish = String(data?.choices?.[0]?.finish_reason || "");
        if (alternateFinish === "length") {
          outputFailure = "truncated";
          lastFailure = { status: 422, detail: provider.name + " hit its output token limit before completing JSON." };
          continue;
        }
        let parsed: unknown;
        try { parsed = JSON.parse(content); } catch {
          outputFailure = "malformed";
          lastFailure = { status: 422, detail: provider.name + " returned incomplete or invalid JSON." };
          continue;
        }
        outputFailure = null;
        payload = { candidates: [{ content: { parts: [{ text: JSON.stringify(parsed) }] }, finishReason: "STOP" }] };
        successfulModel = provider.model;
        successfulProvider = provider.name;
        outputFailure = null;
        break;
      } catch (error) {
        lastFailure = { status: 504, detail: provider.name + " fallback failed: " + (error instanceof Error ? error.message : "network error") };
      }
    }
  }

  if (!payload) {
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
    result = normalizeAgentResult(result, body.operation, body.project?.plan || undefined, projectKind);
    if (process.env.GENE_AI_REVIEW?.trim().toLowerCase() === "true" &&
        ["buildPart", "build", "surprise", "edit", "chat"].includes(body.operation) &&
        Array.isArray(result.files) && result.files.length > 0) {
      const reviewer: { name: string; key: string; endpoint: string; model: string; headers: Record<string, string> } | null = successfulProvider === "groq"
        ? (process.env.OPENROUTER_API_KEY?.trim() ? { name: "openrouter", key: process.env.OPENROUTER_API_KEY.trim(), endpoint: "https://openrouter.ai/api/v1/chat/completions", model: process.env.GENE_OPENROUTER_MODEL?.trim() || "qwen/qwen3-coder:free", headers: { "HTTP-Referer": "https://gene-flash.vercel.app", "X-Title": "GENE Builder Reviewer" } } : null)
        : successfulProvider === "openrouter"
          ? (process.env.GROQ_API_KEY?.trim() ? { name: "groq", key: process.env.GROQ_API_KEY.trim(), endpoint: "https://api.groq.com/openai/v1/chat/completions", model: process.env.GENE_GROQ_MODEL?.trim() || "llama-3.3-70b-versatile", headers: {} } : null)
          : process.env.GROQ_API_KEY?.trim()
            ? { name: "groq", key: process.env.GROQ_API_KEY.trim(), endpoint: "https://api.groq.com/openai/v1/chat/completions", model: process.env.GENE_GROQ_MODEL?.trim() || "llama-3.3-70b-versatile", headers: {} }
            : process.env.OPENROUTER_API_KEY?.trim()
              ? { name: "openrouter", key: process.env.OPENROUTER_API_KEY.trim(), endpoint: "https://openrouter.ai/api/v1/chat/completions", model: process.env.GENE_OPENROUTER_MODEL?.trim() || "qwen/qwen3-coder:free", headers: { "HTTP-Referer": "https://gene-flash.vercel.app", "X-Title": "GENE Builder Reviewer" } }
              : null;
      if (reviewer) {
        try {
          const candidatePaths = new Set(result.files.map(file => file.path));
          const reviewInput = {
            operation: body.operation,
            stagePath: body.stagePath || null,
            projectKind,
            plan: body.project?.plan || result.plan || null,
            existingFiles: Object.fromEntries(Object.entries(body.project?.files || {}).filter(([path]) => isSafeProjectPath(path)).map(([path, content]) => [path, String(content).slice(0, 12_000)])),
            candidateFiles: result.files.map(file => ({ path: file.path, content: file.content.slice(0, 55_000) }))
          };
          const reviewResponse = await fetch(reviewer.endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: "Bearer " + reviewer.key, ...reviewer.headers },
            body: JSON.stringify({
              model: reviewer.model,
              messages: [
                { role: "system", content: "You are GENE's independent code reviewer. Find concrete runtime, syntax, control, and contract bugs; do not redesign working code just for style. Return one JSON object: {reply:string,files:[{path:string,content:string}]}. If the candidate is sound or you cannot confidently fix it, return files:[] and summarize risks briefly. If you change code, return complete replacements only for paths already present in candidateFiles. Preserve the user's request, existing behavior, and no-watermark rule. No markdown." },
                { role: "user", content: "Review this candidate before GENE validates/saves it. Return full replacement files only for high-confidence fixes.\n" + JSON.stringify(reviewInput) }
              ],
              response_format: { type: "json_object" },
              temperature: 0.1,
              max_tokens: body.operation === "buildPart" ? 3_000 : 4_000
            }),
            signal: AbortSignal.timeout(7_000)
          });
          const reviewData = await reviewResponse.json().catch(() => null);
          const reviewContent = reviewData?.choices?.[0]?.message?.content;
          if (reviewResponse.ok && typeof reviewContent === "string") {
            const reviewResult = JSON.parse(reviewContent);
            if (Array.isArray(reviewResult.files) && reviewResult.files.length > 0 &&
                reviewResult.files.every((file: any) => file && candidatePaths.has(file.path) && typeof file.content === "string" && file.content.length > 0)) {
              const replacements = new Map<string, string>(reviewResult.files.map((file: { path: string; content: string }) => [file.path, file.content] as [string, string]));
              result.files = result.files.map(file => replacements.has(file.path) ? { ...file, content: replacements.get(file.path)! } : file);
              result.reply = result.reply + "\n\nA second AI reviewer checked the code and suggested targeted corrections before validation.";
              reviewedBy = reviewer.name + "/" + reviewer.model;
            } else if (typeof reviewResult.reply === "string" && reviewResult.reply.trim()) {
              reviewedBy = reviewer.name + "/" + reviewer.model;
            }
          }
        } catch {
          // Independent review is best-effort; it must never block an otherwise valid build.
        }
      }
    }
    const titleCandidates = [result.plan?.title, body.project?.plan?.title, body.project?.name, body.project?.initialPrompt, body.message];
    result.files = ensureProjectSpecTitle(result.files || [], titleCandidates);
    const files = validateFiles(result.files || [], body.operation, result.plan?.engine || body.project?.plan?.engine, body.mode, projectKind);
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
      validateFiles(mergedFiles, "build", result.plan?.engine || body.project?.plan?.engine, "build", projectKind);
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

  return NextResponse.json({ ok: true, aiMode: successfulProvider, model: successfulModel, ...(reviewedBy ? { reviewedBy } : {}), result });
}