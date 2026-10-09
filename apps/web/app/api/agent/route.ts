import { NextRequest, NextResponse } from "next/server";
import { AGENT_SYSTEM, makeAgentInput } from "../../lib/prompts";
import type { AgentResponse } from "../../lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const ALLOWED_FILES = new Set(["game.html", "game.css", "game.js", "game-spec.json"]);

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
  const normalized: Array<{ path: string; content: string }> = [];
  for (const file of files) {
    if (!file || typeof file.path !== "string" || typeof file.content !== "string") throw new Error("A generated file was malformed.");
    if (!ALLOWED_FILES.has(file.path)) throw new Error("Blocked unexpected generated path: " + file.path);
    if (file.content.length > 500_000) throw new Error("Generated file exceeds the 500 KB safety limit.");
    normalized.push({ path: file.path, content: file.content });
  }
  if (operation === "build" || operation === "surprise") {
    const byPath = Object.fromEntries(normalized.map(f => [f.path, f.content]));
    for (const path of ["game.html", "game.css", "game.js", "game-spec.json"]) {
      if (!byPath[path] || byPath[path].trim().length < 8) throw new Error("Build rejected: required file " + path + " is missing or empty.");
    }
    new Function(byPath["game.js"]);
    JSON.parse(byPath["game-spec.json"]);
    const js = byPath["game.js"];
    if (!/requestAnimationFrame|\.requestAnimationFrame/.test(js)) throw new Error("Build rejected: game.js has no requestAnimationFrame loop.");
    if (!/addEventListener|onkeydown|onkeyup|ontouchstart|onclick/.test(js)) throw new Error("Build rejected: game.js has no detectable input/event handling.");
    if (!/canvas|webgl|WebGL|2d/.test(js + byPath["game.html"])) throw new Error("Build rejected: no canvas/WebGL rendering path was found.");
  }
  return normalized;
}

export async function POST(request: NextRequest) {
  let body: any;
  try { body = await request.json(); } catch { return jsonError("Request body must be valid JSON."); }

  const allowedOperations = ["interview", "plan", "build", "edit", "chat", "surprise"];
  if (!allowedOperations.includes(body.operation)) return jsonError("Unknown GENE operation.");
  if (!["plan", "build"].includes(body.mode)) return jsonError("Mode must be plan or build.");
  if (typeof body.message !== "string" || !body.message.trim()) return jsonError("Please enter a message.");
  if (body.message.length > 12_000) return jsonError("Message is too long (maximum 12,000 characters).");

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

  let response: Response;
  try {
    response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + encodeURIComponent(apiKey), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: AGENT_SYSTEM }] },
        contents: [{ role: "user", parts: [{ text: userInput }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: body.operation === "interview" ? 0.35 : 0.25,
          maxOutputTokens: body.operation === "build" || body.operation === "surprise" || body.operation === "edit" ? 16_384 : 4_096,
          thinkingConfig: { thinkingLevel }
        }
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
    result = parseModelJson(text);
    const files = validateFiles(result.files || [], body.operation);
    result.files = files;
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