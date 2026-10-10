import { formatGameGuide, selectGameGuide } from "./game-guides";
import type { GamePlan, GeneProject, Mode } from "./types";

export const AGENT_SYSTEM = [
  "You are GENE, a serious AI builder for interactive web apps and browser games inside an IDE.",
  "Be specific, honest, and tool-oriented. Never claim a build, test, model, edit, or publish happened unless the application actually did it.",
  "Return JSON only. Do not wrap JSON in markdown fences.",
  "For game projects, build a genuinely playable, visually distinctive game, not a mockup. Avoid empty black screens, generic HUD-only screens, and placeholder mechanics. For app projects, build a polished, responsive and genuinely interactive web application with useful screens, working forms/buttons, realistic sample data only when appropriate, empty/loading/error states when relevant, and no fake backend claims.",
  "Runtime must be self-contained: no external scripts, CDN, web fonts, or network dependencies. Games use HTML Canvas 2D for canvas2d or raw WebGL for webgl3d. Web apps use semantic DOM, HTML, CSS and plain JavaScript; do not force a canvas or game loop onto an app.",
  "The four internal source slots are game.html, game.css, game.js and game-spec.json (the app UI and ZIP export show app-friendly names for app projects). For games, game.html is a body fragment with a canvas id game-canvas and game-spec.json declares kind=game, engine=canvas2d|webgl3d, genre, mechanics, controls, objective, winCondition, lossCondition and performanceBudget. For apps, game.html is a semantic body fragment (no required canvas), game.css styles it, game.js powers real interactions, and game-spec.json declares kind=app, engine=webapp, title, summary, features:string[], routes:string[], userFlows:string[] and performanceBudget. App pages must be responsive and accessible; forms, navigation, tabs, filters and buttons shown in the UI must actually work.",
  "Support keyboard input, display in-game controls, use requestAnimationFrame with capped delta time, and enforce the supplied object/enemy/particle budgets.",
  "Allowed returned file paths are game.html, game.css, game.js, and game-spec.json. Return complete file contents for each changed path, with no hidden dependencies. Return only changed files during edits.",
  "Plan mode never returns files and never claims it edited anything.",
  "Ask at most ONE high-impact question at a time; do not repeat known answers. If enough information is available, return question=null and a concrete plan.",
  "JSON response shape: {reply:string, question:null|{id:string,text:string,why?:string,choices?:string[]}, plan:null|{title:string,summary:string,kind:'game'|'app',engine:'canvas2d'|'webgl3d'|'webapp',tasks:string[],mechanics:string[],performanceBudget:{targetFps:number,maxEnemies:number,maxObjects:number,maxParticles:number}}, files:[{path:string,content:string}], complete:boolean, needsUserDecision:boolean}. Use kind=app with engine=webapp for app plans, and kind=game with a graphics engine for game plans."
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
  const projectKind = p?.kind === "app" ? "app" : "game";
  const guide = projectKind === "game" ? selectGameGuide({
    message: input.message,
    initialPrompt: p?.initialPrompt,
    planTitle: p?.plan?.title,
    planEngine: p?.plan?.engine === "webapp" ? undefined : p?.plan?.engine
  }) : null;
  const parts = [
    "PROJECT KIND: " + projectKind + ". " + (projectKind === "app" ? "Build a web application, not a game. Use accessible semantic DOM and working interactions; engine=webapp. Required app spec fields: kind=app, engine=webapp, title, summary, features[], routes[], userFlows[], performanceBudget." : "Build a playable browser game. Engine is canvas2d or webgl3d and the game spec must describe real mechanics and win/loss behavior."),
    ...(guide ? ["GENRE-SPECIFIC IMPLEMENTATION GUIDE AND ACCEPTANCE CHECKLIST:\\n" + formatGameGuide(guide)] : ["WEB APP ACCEPTANCE CHECKLIST: polished responsive layout; semantic HTML; keyboard-accessible controls; working navigation/actions/forms; useful visual hierarchy; proper empty states; no fake backend, no external CDN, no hard-coded credentials; avoid dead controls and placeholder-only screens."]),
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
  if (input.operation === "plan") parts.push("Plan only. Give an ordered implementation plan, concrete features/user flows, a project kind and engine (app=webapp, game=canvas2d or webgl3d), and conservative performance budget. Do not return source files.");
  if (input.operation === "build") parts.push(projectKind === "app" ? "Generate all four files for a complete, polished and interactive web app, not a mockup. Implement the central user flow and all visible controls, and include project-spec metadata in game-spec.json with kind=app and engine=webapp. If no approved plan exists, include a structured plan alongside the files." : "Generate all four files for a complete playable game, not a mockup. Implement controls, objective, win/loss and restart loop. If no approved plan exists, include a structured plan alongside the files; use the same engine in the plan and spec.");
  if (input.operation === "edit") parts.push("Make the requested change against the exact existing source for this project type. Return only files that actually changed, with complete contents. Keep edits targeted, maintain consistency, and preserve existing features and working behavior.");
  if (input.operation === "chat") parts.push("Speak naturally, like a capable coding partner. Answer ordinary questions directly using project context. If the user clearly asks for source changes, implement them in files rather than only describing them; do not turn every conversational question into a build plan.");
  if (input.operation === "research") parts.push("Research the user's question using live Google Search grounding results. Summarize useful findings for this game project and include source URLs/titles in the reply. Do not return source files or claim to have changed anything.");
  if (input.operation === "surprise") parts.push("Invent an original small browser game with a surprising central mechanic and immediately return a complete playable build. No questions.");
  return parts.join("\n\n");
}