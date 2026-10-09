import { NextRequest, NextResponse } from "next/server";
import { AGENT_SYSTEM, makeAgentInput } from "../../lib/prompts";
import type { AgentResponse } from "../../lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const ALLOWED_FILES = new Set(["game.html", "game.css", "game.js", "game-spec.json"]);
const requestBuckets = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 18;
const RATE_WINDOW_MS = 60_000;

function jsonError(message: string, status = 400, code = "GENE_REQUEST_ERROR") {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
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

function normalizeAgentResult(input: AgentResponse, operation: string, existingPlan?: AgentResponse["plan"]): AgentResponse {
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
    if (!plan || typeof plan !== "object") throw new Error("The game plan was malformed.");
    if (typeof plan.title !== "string" || !plan.title.trim()) throw new Error("The game plan is missing a title.");
    if (typeof plan.summary !== "string" || !plan.summary.trim()) throw new Error("The game plan is missing its summary.");
    if (plan.engine !== "canvas2d" && plan.engine !== "webgl3d") throw new Error("The game plan engine must be canvas2d or webgl3d.");
    const tasks = Array.isArray(plan.tasks) ? plan.tasks.filter((task: unknown): task is string => typeof task === "string" && task.trim().length > 0).slice(0, 40).map((task: string) => task.trim().slice(0, 240)) : [];
    const mechanics = Array.isArray(plan.mechanics) ? plan.mechanics.filter((mechanic: unknown): mechanic is string => typeof mechanic === "string" && mechanic.trim().length > 0).slice(0, 30).map((mechanic: string) => mechanic.trim().slice(0, 180)) : [];
    if (tasks.length < 3) throw new Error("The game plan must include at least three concrete implementation tasks.");
    if (mechanics.length < 1) throw new Error("The game plan must identify at least one actual gameplay mechanic.");
    const budget = plan.performanceBudget || {};
    const targetFps = Number(budget.targetFps);
    const maxEnemies = Number(budget.maxEnemies);
    const maxObjects = Number(budget.maxObjects);
    const maxParticles = Number(budget.maxParticles);
    if (![targetFps, maxEnemies, maxObjects, maxParticles].every(Number.isFinite)) throw new Error("The game plan performance budget is malformed.");
    if (targetFps < 30 || targetFps > 120 || maxEnemies < 0 || maxEnemies > 40 || maxObjects < 0 || maxObjects > 1200 || maxParticles < 0 || maxParticles > 300) {
      throw new Error("The game plan exceeds GENE's supported performance budget.");
    }
    result.plan = {
      title: plan.title.trim().slice(0, 140),
      summary: plan.summary.trim().slice(0, 3000),
      engine: plan.engine,
      tasks,
      mechanics,
      performanceBudget: {
        targetFps,
        maxEnemies: Math.floor(maxEnemies),
        maxObjects: Math.floor(maxObjects),
        maxParticles: Math.floor(maxParticles)
      }
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
    if (!Array.isArray(result.files) || result.files.length < 4) throw new Error("Build response is missing required game source files.");
  }
  const fileCount = Array.isArray(result.files) ? result.files.length : 0;
  if ((operation === "edit" || operation === "chat") && fileCount > 4) {
    throw new Error("Edit response changed too many files for the current browser-game scope.");
  }
  return result;
}

function validateFiles(files: Array<{ path: string; content: string }>, operation: string, plannedEngine?: string, mode?: string) {
  if (!Array.isArray(files)) throw new Error("AI returned no file list.");
  if (mode === "plan" && files.length > 0) throw new Error("Plan mode is read-only. The model returned source files and they were rejected.");
  if ((operation === "plan" || operation === "interview" || operation === "research") && files.length > 0) {
    throw new Error("Plan mode is read-only. The model returned source files and they were rejected.");
  }
  const normalized: Array<{ path: string; content: string }> = [];
  for (const file of files) {
    if (!file || typeof file.path !== "string" || typeof file.content !== "string") throw new Error("A generated file was malformed.");
    if (!ALLOWED_FILES.has(file.path)) throw new Error("Blocked unexpected generated path: " + file.path);
    if (file.content.length > 500_000) throw new Error("Generated file exceeds the 500 KB safety limit.");
    normalized.push({ path: file.path, content: file.content });
  }
  for (const file of normalized) {
    if (file.path === "game.js") new Function(file.content);
    if (file.path === "game-spec.json") JSON.parse(file.content);
  }
  if (operation === "build" || operation === "surprise") {
    const byPath = Object.fromEntries(normalized.map(f => [f.path, f.content]));
    for (const path of ["game.html", "game.css", "game.js", "game-spec.json"]) {
      if (!byPath[path] || byPath[path].trim().length < 8) throw new Error("Build rejected: required file " + path + " is missing or empty.");
    }
    new Function(byPath["game.js"]);
    const spec = JSON.parse(byPath["game-spec.json"]);
    if (!spec || typeof spec !== "object" || Array.isArray(spec)) throw new Error("Build rejected: game-spec.json must be a JSON object.");
    if (typeof spec.title !== "string" || !spec.title.trim()) throw new Error("Build rejected: game-spec.json needs a real game title.");
    if (typeof spec.genre !== "string" || !spec.genre.trim()) throw new Error("Build rejected: game-spec.json needs a game genre.");
    if (spec.engine !== "canvas2d" && spec.engine !== "webgl3d") throw new Error("Build rejected: game-spec.json engine must be canvas2d or webgl3d.");
    if (plannedEngine && spec.engine !== plannedEngine) throw new Error("Build rejected: game-spec engine does not match the approved plan engine.");
    if (!Array.isArray(spec.mechanics) || spec.mechanics.length < 1 || !spec.mechanics.every((item: unknown) => typeof item === "string" && item.trim())) throw new Error("Build rejected: the gameplay mechanics list is missing.");
    if (!Array.isArray(spec.controls) || spec.controls.length < 1 || !spec.controls.every((item: unknown) => typeof item === "string" && item.trim())) throw new Error("Build rejected: the controls list is missing.");
    if (typeof spec.objective !== "string" || !spec.objective.trim()) throw new Error("Build rejected: the main objective is missing.");
    if (typeof spec.winCondition !== "string" || !spec.winCondition.trim()) throw new Error("Build rejected: the win condition is missing.");
    if (typeof spec.lossCondition !== "string" || !spec.lossCondition.trim()) throw new Error("Build rejected: the lose condition is missing.");
    const budget = spec.performanceBudget;
    if (!budget || !Number.isFinite(budget.targetFps) || budget.targetFps < 30 || budget.targetFps > 120) throw new Error("Build rejected: performanceBudget.targetFps must be between 30 and 120.");
    if (![budget.maxEnemies, budget.maxObjects, budget.maxParticles].every((n: unknown) => Number.isInteger(n) && Number(n) >= 0)) throw new Error("Build rejected: performance budgets must be non-negative integers.");
    if (budget.maxEnemies > 40 || budget.maxObjects > 1200 || budget.maxParticles > 300) throw new Error("Build rejected: requested object, enemy, or particle budget exceeds GENE's conservative limits.");
    const html = byPath["game.html"];
    if (!/<canvas\b[^>]*\bid=["']game-canvas["']/i.test(html)) throw new Error("Build rejected: game.html must include a canvas with id=game-canvas.");
    if (/<script\b/i.test(html)) throw new Error("Build rejected: put executable source in game.js, not inline script tags in game.html.");
    if (/<script\b[^>]*\bsrc\s*=\s*["']https?:|<link\b[^>]*\bhref\s*=\s*["']https?:/i.test(html)) throw new Error("Build rejected: game files may not depend on external script or stylesheet CDNs.");
    const js = byPath["game.js"];
    const css = byPath["game.css"];
    if (/\bimport\s*\(|\bfrom\s*["']https?:|\bfetch\s*\(\s*["']https?:/i.test(js)) throw new Error("Build rejected: game.js contains an external runtime dependency.");
    if (/@import\s+url\s*\(\s*["']?https?:|url\s*\(\s*["']https?:/i.test(css)) throw new Error("Build rejected: game.css contains an external runtime dependency.");
    if (!/requestAnimationFrame|\.requestAnimationFrame/.test(js)) throw new Error("Build rejected: game.js has no requestAnimationFrame loop.");
    if (!/addEventListener|onkeydown|onkeyup|ontouchstart|onclick/.test(js)) throw new Error("Build rejected: game.js has no detectable input/event handling.");
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
  return normalized;
}

export async function POST(request: NextRequest) {
  let body: any;
  try { body = await request.json(); } catch { return jsonError("Request body must be valid JSON."); }

  const allowedOperations = ["interview", "plan", "build", "edit", "chat", "research", "surprise"];
  if (!allowedOperations.includes(body.operation)) return jsonError("Unknown GENE operation.");
  if (!["plan", "build"].includes(body.mode)) return jsonError("Mode must be plan or build.");
  if (body.mode === "plan" && ["build", "edit", "surprise"].includes(body.operation)) {
    return jsonError("Plan mode is read-only. Switch to Build mode before creating or changing game files.", 409, "GENE_PLAN_MODE_READ_ONLY");
  }
  if (typeof body.message !== "string" || !body.message.trim()) return jsonError("Please enter a message.");
  if (body.message.length > 12_000) return jsonError("Message is too long (maximum 12,000 characters).");

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

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const answers = body.answers || {};
    const known = Object.keys(answers);
    if (body.operation === "interview" && known.length === 0) {
      return NextResponse.json({
        ok: true,
        aiMode: "fallback",
        result: {
          reply: "Local preview mode is active. This is one local prompt to demonstrate the interview UI, not Gemini reasoning. Add GEMINI_API_KEY to enable the real adaptive interview.",
          question: { id: "controls", text: "How should the main character be controlled?", why: "Controls shape the player controller and core game feel.", choices: ["Keyboard", "Mouse / touch", "Keyboard + touch", "Use smart defaults"] },
          plan: null,
          files: [],
          complete: false,
          needsUserDecision: true
        }
      });
    }
    if (body.operation === "interview" || body.operation === "plan") {
      const original = String(body.project?.initialPrompt || body.message || "Untitled game");
      const is3d = /3d|three.?dimensional|subway|runner|driving|horror|first.?person|third.?person/i.test(original);
      return NextResponse.json({
        ok: true,
        aiMode: "fallback",
        result: {
          reply: "I prepared a rule-based outline only. This is not a Gemini-generated plan, and no source files were created. Add GEMINI_API_KEY to enable GENE's real game-design reasoning.",
          question: null,
          plan: {
            title: original.split(/[.!?]/)[0].slice(0, 64) || "Untitled game",
            summary: "Local outline based on your request. Review and refine it after connecting Gemini.",
            engine: is3d ? "webgl3d" : "canvas2d",
            tasks: ["Create project shell", "Implement player controls", "Build the core mechanic", "Add level-specific obstacles and feedback", "Implement objective and restart", "Validate runtime and performance"],
            mechanics: ["Player input", "Collision/interaction", "Scoring or objective", "Win/loss and restart"],
            performanceBudget: { targetFps: 60, maxEnemies: 8, maxObjects: 160, maxParticles: 60 }
          },
          files: [],
          complete: true,
          needsUserDecision: false
        }
      });
    }
    return jsonError("Gemini is not configured. Add GEMINI_API_KEY to apps/web/.env.local (local development) or your deployment environment. GENE did not generate or change any game files.", 503, "GEMINI_NOT_CONFIGURED");
  }

  const model = typeof body.model === "string" && /^gemini-[a-zA-Z0-9.-]+$/.test(body.model)
    ? body.model
    : (process.env.GENE_FAST_MODEL || "gemini-3.8-flash");
  const thinkingLevel = body.thinking === "fast" ? "low" : body.thinking === "deep" ? "high" : "medium";
  const userInput = makeAgentInput({
    operation: body.operation,
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

  let response: Response;
  try {
    response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: AGENT_SYSTEM }] },
        contents: [{ role: "user", parts }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: body.operation === "interview" ? 0.35 : 0.25,
          maxOutputTokens: body.operation === "build" || body.operation === "surprise" || body.operation === "edit" ? 16_384 : 4_096,
          thinkingConfig: { thinkingLevel }
        },
        ...(body.operation === "research" ? { tools: [{ googleSearch: {} }] } : {})
      }),
      signal: AbortSignal.timeout(55_000)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Network request failed.";
    return jsonError("Could not reach Gemini: " + message + ". No files were changed.", 502, "GEMINI_NETWORK_ERROR");
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = payload?.error?.message || ("Gemini returned HTTP " + response.status);
    return jsonError(detail + ". No game files were changed.", response.status === 429 ? 429 : 502, "GEMINI_API_ERROR");
  }

  const text = payload?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("\n") || "";
  if (!text.trim()) return jsonError("Gemini returned an empty response. No files were changed.", 502, "GEMINI_EMPTY_RESPONSE");

  let result: AgentResponse;
  try {
    if (body.operation === "research" && !text.trim().startsWith("{") && !text.trim().startsWith("```")) {
      result = { reply: text.trim(), files: [], question: null, plan: null, complete: true, needsUserDecision: false };
    } else {
      result = parseModelJson(text);
    }
    result = normalizeAgentResult(result, body.operation, body.project?.plan || undefined);
    const files = validateFiles(result.files || [], body.operation, result.plan?.engine || body.project?.plan?.engine, body.mode);
    result.files = files;
    if ((body.operation === "edit" || body.operation === "chat") && files.length > 0 && body.project?.files) {
      const merged = { ...body.project.files, ...Object.fromEntries(files.map(file => [file.path, file.content])) };
      validateFiles(Object.entries(merged).map(([path, fileContent]) => ({ path, content: String(fileContent) })), "build", result.plan?.engine || body.project?.plan?.engine, "build");
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

  return NextResponse.json({ ok: true, aiMode: "gemini", model, result });
}