import type { GamePlan, GeneProject, Mode } from "./types";

export const AGENT_SYSTEM = [
  "You are GENE 1.2 Flash, a serious game-development agent inside an IDE.",
  "Be specific, honest, and tool-oriented. Never claim a build, test, model, edit, or publish happened unless the application actually did it.",
  "Return JSON only. Do not wrap JSON in markdown fences.",
  "For new projects make a genuinely playable, visually distinctive, tightly-scoped game. Avoid empty black screens, generic HUD-only screens, and placeholder mechanics.",
  "Runtime must be self-contained: no external scripts, CDN, web fonts, or network dependencies. Use HTML Canvas 2D for canvas2d projects or raw WebGL for webgl3d projects.",
  "game.html must be a body fragment with semantic DOM and canvas id game-canvas. game.css contains all styles. game.js must implement actual game loop, input, collision/interaction, objective, score/health where appropriate, win/loss and restart. game-spec.json is valid JSON.",
  "Support keyboard input, display in-game controls, use requestAnimationFrame with capped delta time, and enforce the supplied object/enemy/particle budgets.",
  "Allowed returned file paths are game.html, game.css, game.js, and game-spec.json. Return only changed files during edits.",
  "Plan mode never returns files and never claims it edited anything.",
  "Ask at most ONE high-impact question at a time; do not repeat known answers. If enough information is available, return question=null and a concrete plan.",
  "JSON response shape: {reply:string, question:null|{id:string,text:string,why?:string,choices?:string[]}, plan:null|{title:string,summary:string,engine:'canvas2d'|'webgl3d',tasks:string[],mechanics:string[],performanceBudget:{targetFps:number,maxEnemies:number,maxObjects:number,maxParticles:number}}, files:[{path:string,content:string}], complete:boolean, needsUserDecision:boolean}."
].join("\n");

export function makeAgentInput(input: {
  operation: "interview" | "plan" | "build" | "edit" | "chat" | "surprise" | "research";
  mode: Mode;
  message: string;
  project?: GeneProject | null;
  history?: Array<{ role: string; content: string }>;
  answers?: Record<string, string>;
  thinking?: string;
}) {
  const p = input.project;
  const parts = [
    "OPERATION: " + input.operation,
    "MODE: " + input.mode,
    "THINKING LEVEL: " + (input.thinking || "balanced"),
    "USER MESSAGE: " + input.message,
    "INITIAL GAME IDEA: " + (p?.initialPrompt || input.message),
    "KNOWN ANSWERS: " + JSON.stringify(input.answers || p?.answers || {}),
    "EXISTING PLAN: " + JSON.stringify(p?.plan || null),
    "CURRENT FILES: " + JSON.stringify(p?.files || {}),
    "REFERENCE MATERIAL: " + JSON.stringify((p?.references || []).map(ref => ({
      name: ref.name,
      mimeType: ref.mimeType,
      kind: ref.kind,
      textContent: ref.kind === "text" ? (ref.textContent || "").slice(0, 16000) : undefined,
      imageAttached: ref.kind === "image"
    }))),
    "RECENT CHAT: " + JSON.stringify((input.history || p?.messages?.map(m => ({role:m.role,content:m.content})) || []).slice(-12))
  ];
  if (input.operation === "interview") parts.push("Interview: ask exactly one material question next, based on the latest answer and the full known context. Do not return a batch of questions. If no meaningful question remains, return a complete plan.");
  if (input.operation === "plan") parts.push("Plan only. Give an ordered implementation plan, genre-specific mechanics, engine and conservative performance budget. Do not return source files.");
  if (input.operation === "build") parts.push("Generate all four files for a complete playable first version, not a mockup. Include a distinctive art direction and implemented controls/objective/win-loss-restart loop.");
  if (input.operation === "edit") parts.push("Make the requested change against the exact existing source. Return only files that actually changed, with complete contents. Keep edits targeted and preserve existing features.");
  if (input.operation === "chat") parts.push("Speak naturally. If the user clearly asks for changes, implement them in files rather than only describing them.");
  if (input.operation === "research") parts.push("Research the user's question using live Google Search grounding results. Summarize useful findings for this game project and include source URLs/titles in the reply. Do not return source files or claim to have changed anything.");
  if (input.operation === "surprise") parts.push("Invent an original small browser game with a surprising central mechanic and immediately return a complete playable build. No questions.");
  return parts.join("\n\n");
}