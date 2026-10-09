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

function validateFiles(files: Array<{ path: string; content: string }>, operation: string) {
  if (!Array.isArray(files)) throw new Error("AI returned no file list.");
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
    const files = validateFiles(result.files || [], body.operation);
    result.files = files;
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