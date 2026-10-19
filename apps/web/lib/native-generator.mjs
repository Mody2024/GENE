const ENGINE_DOCS = {
  canvas2d: [
    { title: "MDN Canvas API", url: "https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API", note: "Canvas rendering, drawing primitives, and animation." },
    { title: "MDN requestAnimationFrame", url: "https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame", note: "Browser animation-loop timing." },
    { title: "MDN Web Audio API", url: "https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API", note: "Procedural sound and audio controls." }
  ],
  webgl3d: [
    { title: "MDN WebGL API", url: "https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API", note: "GPU rendering and graphics pipeline." },
    { title: "WebGL Fundamentals", url: "https://webglfundamentals.org/", note: "Practical shaders, buffers, matrices, and 3D rendering." },
    { title: "MDN Pointer Lock API", url: "https://developer.mozilla.org/en-US/docs/Web/API/Pointer_Lock_API", note: "First-person mouse control, when appropriate." }
  ],
  webapp: [
    { title: "MDN Web Forms", url: "https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Forms", note: "Accessible forms and validation." },
    { title: "MDN Web Storage API", url: "https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API", note: "Local persistence for browser apps." },
    { title: "WAI-ARIA Authoring Practices", url: "https://www.w3.org/WAI/ARIA/apg/", note: "Accessible interaction patterns." }
  ]
};

function text(value, max = 12000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function titleFrom(prompt) {
  return (text(prompt).split(/[.!?\n]/)[0] || "Gene Native Game").slice(0, 72);
}
function esc(value) {
  return String(value).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
}
function nativeInterviewQuestion(kind, answers, prompt) {
  const app = kind === "app";
  const questions = app ? [
    { id: "native-users", text: "Who is this app primarily for?", why: "This changes the default workflow, terminology, and accessibility choices.", choices: ["Just me / personal use", "A small team", "Customers or the public", "Students / learning"], recommended: "Just me / personal use" },
    { id: "native-core-loop", text: "What is the single most important thing users should accomplish?", why: "Gene will prioritize this path before adding secondary screens.", choices: ["Create and organize things", "Track progress or habits", "Discover and browse content", "Communicate or collaborate", "Learn or practice", "Manage a workflow"], recommended: "Create and organize things" },
    { id: "native-visual-style", text: "What visual direction should the interface use?", why: "The design system controls color, spacing, hierarchy, and component style.", choices: ["Clean light and minimal", "Warm editorial", "Dark professional", "Playful and colorful", "Retro hardware"], recommended: "Clean light and minimal" },
    { id: "native-data", text: "How should the first version save data?", why: "This sets a clear persistence boundary without requiring paid services.", choices: ["On this device only", "Export/import files", "Prepare for a future shared backend"], recommended: "On this device only" }
  ] : [
    { id: "native-core-loop", text: "What should the player do most of the time?", why: "The core loop determines mechanics, level design, feedback, and the tests Gene should run.", choices: ["Explore and discover", "Fight and survive", "Platform and jump", "Solve mysteries or puzzles", "Race, drive, or run", "Build, manage, or simulate"], recommended: /horror|mystery|psychological/i.test(prompt) ? "Solve mysteries or puzzles" : /platform/i.test(prompt) ? "Platform and jump" : "Explore and discover" },
    { id: "native-perspective", text: "How should the player see and control the world?", why: "Perspective changes camera behavior, movement, input design, and the visual workload.", choices: ["2D side view", "2D top-down", "3D third-person", "3D first-person", "Isometric"], recommended: /2d|platform|pixel/i.test(prompt) ? "2D side view" : /first.person|fps/i.test(prompt) ? "3D first-person" : /3d|open.world/i.test(prompt) ? "3D third-person" : "2D side view" },
    { id: "native-visual-style", text: "Which art direction should define the game?", why: "Gene will use this to guide palette, silhouettes, UI, and environment treatment.", choices: ["Polished stylized 3D", "Low-poly atmospheric", "Pixel art", "Hand-painted storybook", "Dark cinematic horror", "Clean geometric"], recommended: /horror|psychological|disturbing/i.test(prompt) ? "Dark cinematic horror" : /low.poly/i.test(prompt) ? "Low-poly atmospheric" : /pixel/i.test(prompt) ? "Pixel art" : "Polished stylized 3D" },
    { id: "native-menu", text: "What should the title screen and menus feel like?", why: "Menus should belong to this specific game's world and genre, not reuse the same generic start screen.", choices: ["Cinematic title screen with story atmosphere", "Diegetic case file / journal", "Arcade cabinet with bold score panels", "Minimal elegant pause menu", "Fantasy map and illustrated panels", "High-speed racing garage"], recommended: /horror|psychological|mystery/i.test(prompt) ? "Diegetic case file / journal" : /race|driv|speed/i.test(prompt) ? "High-speed racing garage" : /fantasy|magic|dragon/i.test(prompt) ? "Fantasy map and illustrated panels" : /arcade|platform|runner/i.test(prompt) ? "Arcade cabinet with bold score panels" : "Cinematic title screen with story atmosphere" },
    { id: "native-progression", text: "What should give the game a satisfying sense of progression?", why: "A clear progression system makes the game feel intentional instead of like a short mechanics demo.", choices: ["Three handcrafted stages", "Explore one larger world", "Story chapters and clues", "Increasing challenge and upgrades", "Short replayable runs"], recommended: /story|mystery|horror/i.test(prompt) ? "Story chapters and clues" : "Three handcrafted stages" },
    { id: "native-audio", text: "What audio direction should Gene build into the game?", why: "The native audio system can synthesize original music and effects locally, without paid APIs or copied tracks.", choices: ["Atmospheric procedural soundtrack", "Energetic arcade music", "Creepy ambient soundscape", "Minimal sound effects only", "Silent by default"], recommended: /horror|mystery|psychological/i.test(prompt) ? "Creepy ambient soundscape" : "Atmospheric procedural soundtrack" }
  ];
  const next = questions.find(question => !text(answers[question.id], 400));
  if (!next) return null;
  return { ...next, step: questions.indexOf(next) + 1, total: questions.length, multi: false };
}

function visualProfile(prompt, engine) {
  const p = String(prompt || "").toLowerCase();
  if (engine === "webapp") {
    if (/retro|crt|terminal|hardware|vcr/i.test(p)) return { id: "retro", bg: "#171915", panel: "#25271f", line: "#535b45", text: "#eff2d8", muted: "#aab39a", accent: "#c8f36a", ink: "#1c2411", glow: "#829b3a", menu: "SYSTEM READY", subtitle: "A workspace built around your workflow.", cta: "Open workspace", genre: "retro productivity" };
    if (/playful|kids|colorful|game.?like|cute/i.test(p)) return { id: "playful", bg: "#fff8ef", panel: "#ffffff", line: "#f0d9c6", text: "#382d43", muted: "#796b7d", accent: "#ff9d75", ink: "#382d43", glow: "#ffd8b7", menu: "Let's get started", subtitle: "A friendly space to make progress.", cta: "Get started", genre: "playful app" };
    return { id: "studio", bg: "#f4f6f8", panel: "#ffffff", line: "#dce2e8", text: "#17212b", muted: "#637181", accent: "#2f6fed", ink: "#ffffff", glow: "#c7d8ff", menu: "Your workspace", subtitle: "Everything you need, in one clear place.", cta: "Open workspace", genre: "clean studio app" };
  }
  if (/horror|psychological|haunt|disturb|creepy|dread|survival horror/i.test(p)) return { id: "cinematic", bg: "#100d12", panel: "#1b151d", line: "#49323e", text: "#f4e9ed", muted: "#c0a9b4", accent: "#c87984", ink: "#1a0c12", glow: "#582d43", menu: "Something is waiting", subtitle: "Some doors should stay closed.", cta: "Enter the unknown", genre: "cinematic horror" };
  if (/racing|race|driv|speed|drift/i.test(p)) return { id: "velocity", bg: "#10151d", panel: "#171f2b", line: "#36475b", text: "#f1f6ff", muted: "#a6b8cd", accent: "#ffb547", ink: "#201608", glow: "#354c67", menu: "Ready to run?", subtitle: "Find your line. Own the road.", cta: "Start race", genre: "high-velocity arcade" };
  if (/space|galaxy|planet|cosmic|starship/i.test(p)) return { id: "cosmic", bg: "#090f20", panel: "#111b32", line: "#2b3e65", text: "#edf2ff", muted: "#aab9df", accent: "#9dc4ff", ink: "#101a32", glow: "#263f78", menu: "Beyond the horizon", subtitle: "A vast world is calling.", cta: "Launch mission", genre: "cosmic adventure" };
  if (/fantasy|dragon|magic|wizard|myth|storybook|fairy/i.test(p)) return { id: "storybook", bg: "#17130e", panel: "#272016", line: "#5c4930", text: "#fff2d6", muted: "#cdbb98", accent: "#e9bd69", ink: "#30200b", glow: "#69502b", menu: "A tale begins", subtitle: "Every legend starts somewhere.", cta: "Begin your journey", genre: "storybook fantasy" };
  if (/platform|jump|pixel|retro|arcade|runner|geometry dash/i.test(p)) return { id: "arcade", bg: "#10171b", panel: "#1a262b", line: "#35505a", text: "#effcff", muted: "#a9c3c9", accent: "#69e2cf", ink: "#09221f", glow: "#1d625d", menu: "READY PLAYER ONE", subtitle: "One more run. One more record.", cta: "Play now", genre: "precision arcade" };
  if (/detective|mystery|investigat|puzzle|clue|escape room/i.test(p)) return { id: "noir", bg: "#171716", panel: "#242321", line: "#4c4941", text: "#f2eee4", muted: "#c0b7a4", accent: "#d6b878", ink: "#292111", glow: "#594a30", menu: "Case file 001", subtitle: "Look closer. Nothing is accidental.", cta: "Open the case", genre: "noir mystery" };
  if (/underwater|ocean|sea|island|nature|forest|explor/i.test(p)) return { id: "wild", bg: "#0b1c1b", panel: "#122a27", line: "#28534a", text: "#e4f5ec", muted: "#a4c9bb", accent: "#84d7ad", ink: "#0d2a21", glow: "#1d5849", menu: "The world is yours", subtitle: "Take the path less traveled.", cta: "Explore", genre: "natural exploration" };
  return { id: "adventure", bg: "#0b1015", panel: "#141d25", line: "#293744", text: "#edf4f7", muted: "#a0b1bb", accent: "#b8e3d0", ink: "#10251e", glow: "#263b46", menu: "Your adventure starts here", subtitle: "Discover, improve, and find your own way.", cta: "Start adventure", genre: "stylized adventure" };
}
function musicProfile(prompt) {
  const p = String(prompt || "").toLowerCase();
  if (/horror|psychological|haunt|disturb|creepy|dread/i.test(p)) return { mood: "uneasy", notes: [55, 58.27, 82.41], waves: ["sine", "triangle", "sine"], tempo: 0.012 };
  if (/race|driv|speed|drift|runner|arcade|platform|geometry dash/i.test(p)) return { mood: "energetic", notes: [110, 164.81, 220], waves: ["sawtooth", "triangle", "square"], tempo: 0.024 };
  if (/space|galaxy|cosmic|planet|starship/i.test(p)) return { mood: "weightless", notes: [65.41, 98, 146.83], waves: ["sine", "sine", "triangle"], tempo: 0.014 };
  if (/fantasy|dragon|magic|wizard|storybook/i.test(p)) return { mood: "wonder", notes: [130.81, 164.81, 196], waves: ["triangle", "sine", "triangle"], tempo: 0.016 };
  if (/detective|mystery|investigat|puzzle|noir/i.test(p)) return { mood: "investigative", notes: [73.42, 110, 146.83], waves: ["triangle", "sine", "sine"], tempo: 0.013 };
  if (/underwater|ocean|sea|forest|nature|explor/i.test(p)) return { mood: "organic", notes: [82.41, 123.47, 185], waves: ["sine", "triangle", "sine"], tempo: 0.015 };
  return { mood: "adventure", notes: [110, 164.81, 220], waves: ["sine", "triangle", "sine"], tempo: 0.018 };
}
function pickEngine(input) {
  if (input.kind === "app") return "webapp";
  if (["canvas2d", "webgl3d"].includes(input.engine)) return input.engine;
  return /\b(3d|three.?dimensional|first.?person|third.?person|open.?world|3d world|low.?poly)\b/i.test(input.prompt) ? "webgl3d" : "canvas2d";
}
function projectSpec(title, engine, prompt) {
  const app = engine === "webapp";
  return {
    title,
    kind: app ? "app" : "game",
    engine,
    genre: app ? "productivity app" : /platform|jump/i.test(prompt) ? "platformer" : /horror|mystery|story/i.test(prompt) ? "exploration adventure" : /race|driv/i.test(prompt) ? "arcade driving" : "arcade action",
    summary: text(prompt, 800) || "A native-generated playable project.",
    objective: app ? "Complete the primary workflow and see its result." : "Reach the target score, explore the level, and complete the challenge.",
    winCondition: app ? "The user completes the main workflow." : "Reach the target score or complete the final objective.",
    lossCondition: app ? "The user can recover from invalid input without losing work." : "Health reaches zero; restart to play again.",
    mechanics: app ? ["Persistent local state", "Validated input", "Responsive navigation"] : ["Responsive movement", "Collectibles and scoring", "Hazards and recovery", "Pause and restart"],
    controls: app ? ["Use the form and buttons with mouse, touch, or keyboard."] : ["Move with WASD or arrow keys.", "Use Space to jump or perform the primary action.", "Press P to pause and R to restart."],
    performanceBudget: { targetFps: 60, maxEnemies: app ? 0 : 12, maxObjects: 350, maxParticles: app ? 0 : 90 },
    audio: { enabled: true, implementation: "procedural-web-audio", buses: ["master", "music", "sfx"], mood: /horror|mystery/i.test(prompt) ? "mystery" : "adventure", events: { start: "Start", pickup: "Collect", hit: "Impact", win: "Success", ui: "Interface" } },
    additionalFiles: [],
    nativeGeneration: { modelUsed: false, externalAiUsed: false, strategy: "deterministic-native-template-v1" }
  };
}
function htmlShell(title, engine, prompt = "") {
  const profile = visualProfile(prompt, engine);
  const menuChoice = String(prompt || "").toLowerCase();
  if (/diegetic case file|journal/.test(menuChoice)) { profile.menu = "CASE FILE / 001"; profile.subtitle = "Every detail is evidence."; profile.cta = "Open the case"; }
  else if (/arcade cabinet|bold score panels/.test(menuChoice)) { profile.menu = "INSERT COIN / PRESS START"; profile.subtitle = "Beat the record. Change the board."; profile.cta = "Play now"; }
  else if (/fantasy map|illustrated panels/.test(menuChoice)) { profile.menu = "THE CHRONICLES"; profile.subtitle = "Your legend begins on this map."; profile.cta = "Begin your journey"; }
  else if (/racing garage/.test(menuChoice)) { profile.menu = "GARAGE / RACE CONTROL"; profile.subtitle = "Tune in. Line up. Go."; profile.cta = "Start race"; }
  else if (/cinematic title screen/.test(menuChoice)) { profile.menu = "A STORY ONLY YOU CAN ENTER"; profile.subtitle = "The first choice changes everything."; profile.cta = "Begin"; }
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#10151b">
  <title>${esc(title)}</title>
  <link rel="stylesheet" href="game.css">
</head>
<body>
  <main id="game-shell" data-engine="${engine}">
    <header class="topbar"><div><p class="eyebrow">${esc(profile.genre)} / GENE BUILD</p><h1 id="game-title">${esc(title)}</h1></div><div class="hud" aria-live="polite"><span id="score-label">SCORE</span><strong id="score">0</strong><span id="status">READY</span></div></header>
    <section class="stage" aria-label="Game area"><canvas id="game-canvas" aria-label="${esc(title)} play area"></canvas><div id="overlay" class="overlay"><div class="overlay-card"><p class="eyebrow">${esc(profile.menu)}</p><h2 id="overlay-title">${esc(profile.subtitle)}</h2><p id="overlay-copy">${esc(profile.subtitle)}</p><button id="start-button" type="button">${esc(profile.cta)}</button></div></div></section>
    <footer class="controls"><span id="control-hint">Move: WASD / arrows · Action: Space · Pause: P · Restart: R</span><button id="pause-button" type="button">Pause</button><button id="restart-button" type="button">Restart</button><button id="audio-button" type="button">Sound: on</button></footer>
    <p id="help" class="help">Built without external AI calls. Your progress is stored locally in this browser.</p>
  </main>
  <script src="game.js"></script>
</body>
</html>`;
}
const css = `:root{color-scheme:dark;--bg:#0b1015;--panel:#141d25;--line:#293744;--text:#edf4f7;--muted:#a0b1bb;--accent:#b8e3d0;--accent-ink:#10251e}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(ellipse at 50% -20%,#263b46 0,transparent 55%),var(--bg);color:var(--text);font:15px/1.5 ui-sans-serif,system-ui,-apple-system,sans-serif}button{font:inherit;font-weight:650;border:1px solid var(--line);border-radius:11px;padding:10px 15px;background:#1b2832;color:var(--text);cursor:pointer;transition:transform .15s,border-color .15s}button:hover{border-color:var(--accent);transform:translateY(-1px)}button:focus-visible{outline:3px solid var(--accent);outline-offset:3px}#game-shell{max-width:1180px;margin:0 auto;padding:clamp(12px,3vw,28px)}.topbar{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-bottom:16px}.eyebrow{margin:0 0 4px;color:var(--accent);font-size:10px;font-weight:800;letter-spacing:.18em}h1{font-size:clamp(20px,3vw,32px);letter-spacing:-.04em;margin:0}.hud{display:flex;align-items:center;gap:12px;background:var(--panel);border:1px solid var(--line);border-radius:13px;padding:9px 13px}.hud span{font-size:10px;letter-spacing:.1em;color:var(--muted)}.hud strong{font-size:21px}.stage{position:relative;overflow:hidden;border:1px solid #344754;border-radius:18px;background:#0a1118;box-shadow:0 24px 80px #0005;min-height:300px}canvas{display:block;width:100%;height:min(68vh,650px);min-height:300px;touch-action:none}.overlay{position:absolute;inset:0;display:grid;place-items:center;padding:18px;background:linear-gradient(120deg,#071018aa,#07101855);backdrop-filter:blur(3px)}.overlay.hidden{display:none}.overlay-card{max-width:420px;text-align:center;padding:28px;background:#101a22eF;border:1px solid #ffffff22;border-radius:20px;box-shadow:0 20px 80px #0007}.overlay-card h2{font-size:clamp(24px,4vw,40px);line-height:1.05;letter-spacing:-.04em;margin:8px 0}.overlay-card p:not(.eyebrow){color:var(--muted)}.overlay-card button{margin-top:8px;background:var(--accent);color:var(--accent-ink);border-color:transparent;padding:12px 22px}.controls{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:12px 2px}.controls span{flex:1;min-width:220px;color:var(--muted);font-size:12px}.help{color:#81949f;font-size:11px;margin:4px 2px}@media(max-width:560px){.topbar{align-items:flex-start;flex-direction:column}.hud{width:100%;justify-content:space-between}.controls button{flex:1}.controls span{flex-basis:100%}canvas{height:56vh;min-height:280px}}@media(prefers-reduced-motion:reduce){*{transition:none!important;scroll-behavior:auto!important}}`;

function canvasGameJs(title, prompt, fullGame = false) {
  const profile = visualProfile(prompt, "canvas2d");
  const music = musicProfile(prompt);
  const platformer = /platform|jump|side.?scroll/i.test(prompt);
  const spooky = /horror|mystery|dark|haunt/i.test(prompt);
  const playerColor = profile.text;
  const backdropCode = profile.id === "cinematic" || profile.id === "noir"
    ? 'for(let i=0;i<9;i++){const x=(i*137-camera*.08)%1100;ctx.fillStyle="\${profile.panel}";ctx.globalAlpha=.35+(i%3)*.12;ctx.beginPath();ctx.moveTo(x,420);ctx.lineTo(x+22,150+(i%4)*25);ctx.lineTo(x+58,420);ctx.fill()}ctx.globalAlpha=1;for(let i=0;i<5;i++){ctx.fillStyle="\${profile.accent}";ctx.globalAlpha=.035;ctx.fillRect(0,90+i*58,W,18)}ctx.globalAlpha=1;'
    : profile.id === "velocity"
    ? 'ctx.strokeStyle="\${profile.accent}";ctx.globalAlpha=.24;ctx.lineWidth=3;for(let i=0;i<8;i++){const x=W/2+(i-4)*72;ctx.beginPath();ctx.moveTo(W/2+(x-W/2)*.12,245);ctx.lineTo(x+Math.sin(elapsed*2+i)*18,540);ctx.stroke()}ctx.globalAlpha=1;'
    : profile.id === "cosmic"
    ? 'for(let i=0;i<4;i++){const x=((i*271-camera*.025)%1150+1150)%1150-70,y=70+(i%3)*86,r=18+(i%3)*11;ctx.strokeStyle="\${profile.accent}";ctx.globalAlpha=.25;ctx.beginPath();ctx.ellipse(x,y,r*1.9,r*.7,elapsed*.03,0,Math.PI*2);ctx.stroke();ctx.fillStyle="\${profile.glow}";ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill()}ctx.globalAlpha=1;'
    : profile.id === "storybook"
    ? 'for(let i=0;i<7;i++){const x=((i*190-camera*.12)%1350+1350)%1350-150;ctx.fillStyle=i%2?"\${profile.panel}":"\${profile.glow}";ctx.globalAlpha=.6;ctx.beginPath();ctx.moveTo(x,420);ctx.quadraticCurveTo(x+75,250-(i%3)*30,x+155,420);ctx.fill()}ctx.globalAlpha=1;'
    : profile.id === "wild"
    ? 'for(let i=0;i<15;i++){const x=((i*83-camera*.09)%1100+1100)%1100;ctx.strokeStyle="\${profile.accent}";ctx.globalAlpha=.22;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,420);ctx.quadraticCurveTo(x-16,315-(i%4)*22,x+10,260+(i%3)*18);ctx.stroke()}ctx.globalAlpha=1;'
    : 'ctx.strokeStyle="\${profile.glow}";ctx.globalAlpha=.45;ctx.lineWidth=1;for(let i=0;i<9;i++){ctx.beginPath();ctx.moveTo(0,280+i*18);ctx.lineTo(W,280+i*18);ctx.stroke()}ctx.globalAlpha=1;';
  const nextStageCode = fullGame ? `function nextStage(){if(stage>=3){finish(true);return}stage++;camera=0;player.x=120;player.y=360;player.vx=0;player.vy=0;items=[];hazards=[];particles=[];for(let i=0;i<24;i++)items.push({x:260+i*155,y:${platformer ? "310+(i%3)*-65" : "160+(i%5)*62"},r:9,taken:false});for(let i=0;i<11;i++)hazards.push({x:500+i*300,y:${platformer ? "420" : "300+(i%3)*65"},r:${platformer ? "18" : "16"},phase:i*1.7});statusEl.textContent="STAGE "+stage+"/3";sound(720,.16);}` : "";
  return `(() => {
"use strict";
const canvas=document.getElementById("game-canvas"),ctx=canvas.getContext("2d");
const scoreEl=document.getElementById("score"),statusEl=document.getElementById("status"),overlay=document.getElementById("overlay"),overlayTitle=document.getElementById("overlay-title"),overlayCopy=document.getElementById("overlay-copy"),startBtn=document.getElementById("start-button"),pauseBtn=document.getElementById("pause-button"),restartBtn=document.getElementById("restart-button"),audioBtn=document.getElementById("audio-button");
const W=960,H=540;let stage=1,scale=1,score=0,running=false,paused=false,ended=false,last=0,elapsed=0,muted=false,audio=null,musicNodes=[];
const keys=new Set(),player={x:120,y:360,vx:0,vy:0,r:16,health:3,grounded:false};
let items=[],hazards=[],particles=[],camera=0;
function resize(){const rect=canvas.getBoundingClientRect();const dpr=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.max(1,Math.round(rect.width*dpr));canvas.height=Math.max(1,Math.round(rect.height*dpr));scale=Math.min(canvas.width/W,canvas.height/H);ctx.setTransform(scale,0,0,scale,0,0)}
window.addEventListener("resize",resize);resize();
function musicStart(){if(muted||musicNodes.length)return;try{audio=audio||new(window.AudioContext||window.webkitAudioContext)();if(audio.state==="suspended")audio.resume();const master=audio.createGain();master.gain.value=.018;master.connect(audio.destination);for(const [freq,type] of ${JSON.stringify(music.notes.map((freq,i)=>[freq,music.waves[i]]))}){const o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.value=freq;g.gain.value=type==="triangle" ? 0.22 : 0.34;o.connect(g);g.connect(master);o.start();musicNodes.push(o,g)}musicNodes.push(master)}catch{}}function musicStop(){for(const node of musicNodes){try{if(node.stop)node.stop();else node.disconnect()}catch{}}musicNodes=[]}
function sound(freq=440,duration=.08,type="sine"){if(muted)return;try{audio=audio||new(window.AudioContext||window.webkitAudioContext)();if(audio.state==="suspended")audio.resume();const o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(.055,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+duration)}catch{}}
function reset(){stage=1;score=0;elapsed=0;player.x=120;player.y=360;player.vx=0;player.vy=0;player.health=3;player.grounded=false;camera=0;items=[];hazards=[];particles=[];for(let i=0;i<24;i++)items.push({x:260+i*155,y:${platformer ? "310+(i%3)*-65" : "160+(i%5)*62"},r:9,taken:false});for(let i=0;i<11;i++)hazards.push({x:500+i*300,y:${platformer ? "420" : "300+(i%3)*65"},r:${platformer ? "18" : "16"},phase:i*1.7});scoreEl.textContent="0";${fullGame ? 'statusEl.textContent="STAGE 1/3";' : 'statusEl.textContent="READY";'}}
function start(){if(ended)reset();running=true;paused=false;ended=false;overlay.classList.add("hidden");statusEl.textContent="PLAYING";musicStart();sound(620,.12);last=performance.now();requestAnimationFrame(loop)}
function finish(win){running=false;ended=true;overlay.classList.remove("hidden");overlayTitle.textContent=win?"Challenge complete!":"Try again";overlayCopy.textContent=win?"You cleared the course. Restart to beat your score.":"You ran out of health. Your next run starts fresh.";startBtn.textContent="Play again";statusEl.textContent=win?"COMPLETE":"GAME OVER";sound(win?760:180,.24,win?"sine":"triangle");}
function pause(){if(!running)return;paused=!paused;statusEl.textContent=paused?"PAUSED":"PLAYING";pauseBtn.textContent=paused?"Resume":"Pause";if(!paused){last=performance.now();requestAnimationFrame(loop)}}
${nextStageCode}
function update(dt){elapsed+=dt;const left=keys.has("ArrowLeft")||keys.has("a"),right=keys.has("ArrowRight")||keys.has("d"),up=keys.has("ArrowUp")||keys.has("w"),down=keys.has("ArrowDown")||keys.has("s");
player.vx+=(Number(right)-Number(left))*1500*dt;player.vx*=Math.pow(.001,dt);player.vx=Math.max(-270,Math.min(270,player.vx));
${platformer ? "if((up||keys.has(' '))&&player.grounded){player.vy=-560;player.grounded=false;sound(420,.08)}player.vy+=1300*dt;player.y+=player.vy*dt;player.grounded=false;if(player.y+player.r>=420){player.y=420-player.r;player.vy=0;player.grounded=true}if(player.y<20){player.y=20;player.vy=0}" : "player.vy+=(Number(down)-Number(up))*1000*dt;player.vy*=Math.pow(.003,dt);player.vy=Math.max(-230,Math.min(230,player.vy));player.y+=player.vy*dt;player.y=Math.max(65,Math.min(H-55,player.y));"}
player.x+=player.vx*dt;player.x=Math.max(32,Math.min(340,player.x));camera+=Math.max(0,player.vx)*dt*.8;
for(const item of items){if(item.taken)continue;const ix=item.x-camera,iy=item.y;if(Math.hypot(player.x-ix,player.y-iy)<player.r+item.r){item.taken=true;score+=10;scoreEl.textContent=String(score);sound(820,.07);for(let j=0;j<8;j++)particles.push({x:ix,y:iy,vx:(Math.random()-.5)*170,vy:(Math.random()-.5)*170,life:.45})}}
for(const h of hazards){const hx=h.x-camera;if(hx< -50||hx>W+50)continue;const hy=h.y+${platformer ? "0" : "Math.sin(elapsed*1.5+h.phase)*26"};if(Math.hypot(player.x-hx,player.y-hy)<player.r+h.r){player.health--;h.x+=180;player.vx=-player.vx*.6;player.vy=-220;sound(140,.15,"triangle");if(player.health<=0){finish(false);return}}}
for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt}particles=particles.filter(p=>p.life>0);
${fullGame ? 'if(score>=stage*120){if(stage<3)nextStage();else{finish(true);return}}if(player.x+camera>3300){if(stage<3)nextStage();else{finish(true);return}}' : 'if(score>=120){finish(true);return}if(player.x+camera>3300){finish(true);return}'}
}
function draw(){const g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,"${profile.bg}");g.addColorStop(1,"${profile.glow}");ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
${backdropCode}
for(let i=0;i<40;i++){const x=((i*173-camera*.18)%1100+1100)%1100;const y=(i*79)%330;ctx.fillStyle=i%4===0?"#d7e7e755":"#9bb6c422";ctx.fillRect(x,y,2,2)}
ctx.fillStyle="${profile.panel}";for(let i=0;i<14;i++){const x=((i*120-camera*.4)%1200+1200)%1200-60;ctx.beginPath();ctx.moveTo(x,420);ctx.lineTo(x+55,240+(i%3)*28);ctx.lineTo(x+110,420);ctx.fill()}
ctx.fillStyle="${platformer ? "#304b43" : "#1b3039"}";ctx.fillRect(0,420,W,120);ctx.fillStyle="#91c9ad";ctx.fillRect(0,420,W,3);
${platformer ? "for(let i=0;i<18;i++){const x=((i*145-camera*.8)%1250+1250)%1250-30;const y=350-(i%3)*62;ctx.fillStyle='#355e55';ctx.fillRect(x,y,94,12);ctx.fillStyle='#8bc4a7';ctx.fillRect(x,y,94,3)}" : ""}
for(const item of items){if(item.taken)continue;const x=item.x-camera;if(x< -30||x>W+30)continue;ctx.save();ctx.translate(x,item.y);ctx.rotate(elapsed*1.5);ctx.fillStyle="${profile.accent}";ctx.shadowColor="${profile.accent}";ctx.shadowBlur=14;ctx.beginPath();ctx.moveTo(0,-10);ctx.lineTo(8,0);ctx.lineTo(0,10);ctx.lineTo(-8,0);ctx.closePath();ctx.fill();ctx.restore()}
for(const h of hazards){const x=h.x-camera;if(x< -50||x>W+50)continue;ctx.fillStyle="${profile.accent}";ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=10;ctx.beginPath();ctx.arc(x,h.y+${platformer ? "0" : "Math.sin(elapsed*1.5+h.phase)*26"},h.r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0}
ctx.fillStyle="${playerColor}";ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=16;ctx.beginPath();ctx.arc(player.x,player.y,player.r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.fillStyle="#14251f";ctx.beginPath();ctx.arc(player.x+5,player.y-3,3,0,Math.PI*2);ctx.fill();
ctx.fillStyle="#e5edf0";ctx.font="700 12px system-ui";ctx.fillText("HEALTH "+ "♥ ".repeat(Math.max(0,player.health)),20,28);ctx.fillStyle="#a8c0ca";ctx.fillText("GOAL 120",W-92,28);
for(const p of particles){ctx.globalAlpha=Math.max(0,p.life*2);ctx.fillStyle="#f6d58b";ctx.fillRect(p.x,p.y,3,3)}ctx.globalAlpha=1;
}
function loop(now){if(!running||paused)return;const dt=Math.min(.033,Math.max(0,(now-last)/1000));last=now;update(dt);draw();if(running&&!paused)requestAnimationFrame(loop)}
window.addEventListener("keydown",e=>{const key=e.key.toLowerCase();if(["arrowup","arrowdown","arrowleft","arrowright"," "].includes(key))e.preventDefault();keys.add(key);if(key==="p")pause();if(key==="r"){reset();draw();if(running){running=false;start()}}if(!running&&key==="enter")start()});
window.addEventListener("keyup",e=>keys.delete(e.key.toLowerCase()));
let pointer=null;canvas.addEventListener("pointerdown",e=>{pointer=e.clientX;canvas.setPointerCapture?.(e.pointerId);if(!running)start()});canvas.addEventListener("pointermove",e=>{if(pointer!==null){const delta=e.clientX-pointer;keys.delete("a");keys.delete("d");if(delta>4)keys.add("d");if(delta< -4)keys.add("a");pointer=e.clientX}});canvas.addEventListener("pointerup",()=>{pointer=null;keys.delete("a");keys.delete("d")});
startBtn.addEventListener("click",start);pauseBtn.addEventListener("click",pause);restartBtn.addEventListener("click",()=>{running=false;reset();draw();start()});audioBtn.addEventListener("click",()=>{muted=!muted;audioBtn.textContent="Sound: "+(muted?"off":"on");if(muted)musicStop();else{musicStart();sound(600,.06)}});
reset();draw();
})();`;
}
function webglGameJs(fullGame = false, prompt = "") {
  const profile = visualProfile(prompt, "webgl3d");
  const accentRgb = profile.accent.match(/[0-9a-f]{2}/gi).map(value => parseInt(value, 16) / 255);
  const music = musicProfile(prompt);
  return `(() => {"use strict";
const canvas=document.getElementById("game-canvas"),gl=canvas.getContext("webgl",{antialias:true,alpha:false});
const overlay=document.getElementById("overlay"),startBtn=document.getElementById("start-button"),scoreEl=document.getElementById("score"),status=document.getElementById("status"),pauseBtn=document.getElementById("pause-button"),restartBtn=document.getElementById("restart-button"),audioBtn=document.getElementById("audio-button"),overlayTitle=document.getElementById("overlay-title"),overlayCopy=document.getElementById("overlay-copy");
if(!gl){overlayTitle.textContent="WebGL unavailable";overlayCopy.textContent="Enable WebGL or use the 2D target.";return}
const vs="attribute vec3 aPosition;attribute vec3 aColor;uniform mat4 uMvp;varying vec3 vColor;void main(){vColor=aColor;gl_Position=uMvp*vec4(aPosition,1.0);}";
const fs="precision mediump float;varying vec3 vColor;void main(){gl_FragColor=vec4(vColor,1.0);}";
function makeShader(type,src){const sh=gl.createShader(type);gl.shaderSource(sh,src);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(sh));return sh}
const program=gl.createProgram();gl.attachShader(program,makeShader(gl.VERTEX_SHADER,vs));gl.attachShader(program,makeShader(gl.FRAGMENT_SHADER,fs));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));gl.useProgram(program);
const faces=[
 [[[-.5,-.5,.5],[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5]],[${accentRgb.join(",")}]],
 [[[.5,-.5,-.5],[-.5,-.5,-.5],[-.5,.5,-.5],[.5,.5,-.5]],[.2,.48,.75]],
 [[[-.5,.5,.5],[.5,.5,.5],[.5,.5,-.5],[-.5,.5,-.5]],[.75,.9,.85]],
 [[[-.5,-.5,-.5],[.5,-.5,-.5],[.5,-.5,.5],[-.5,-.5,.5]],[.22,.32,.4]],
 [[[.5,-.5,.5],[.5,-.5,-.5],[.5,.5,-.5],[.5,.5,.5]],[.85,.56,.35]],
 [[[-.5,-.5,-.5],[-.5,-.5,.5],[-.5,.5,.5],[-.5,.5,-.5]],[.38,.67,.65]]
];
const positions=[],colors=[];
for(const [q,color] of faces){for(const i of [0,1,2,0,2,3]){positions.push(...q[i]);colors.push(...color)}}
function buffer(data,location){const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);const loc=gl.getAttribLocation(program,location);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,3,gl.FLOAT,false,0,0)}
buffer(positions,"aPosition");buffer(colors,"aColor");
function identity(){return new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1])}
function multiply(a,b){const o=new Float32Array(16);for(let col=0;col<4;col++)for(let row=0;row<4;row++)o[col*4+row]=a[row]*b[col*4]+a[4+row]*b[col*4+1]+a[8+row]*b[col*4+2]+a[12+row]*b[col*4+3];return o}
function translation(x,y,z){const m=identity();m[12]=x;m[13]=y;m[14]=z;return m}
function scaling(x,y,z){const m=identity();m[0]=x;m[5]=y;m[10]=z;return m}
function rotationX(a){const c=Math.cos(a),s=Math.sin(a);return new Float32Array([1,0,0,0,0,c,s,0,0,-s,c,0,0,0,0,1])}
function rotationY(a){const c=Math.cos(a),s=Math.sin(a);return new Float32Array([c,0,-s,0,0,1,0,0,s,0,c,0,0,0,0,1])}
function perspective(fov,aspect,near,far){const f=1/Math.tan(fov/2),nf=1/(near-far);return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)*nf,-1,0,0,2*far*near*nf,0])}
const mvpLoc=gl.getUniformLocation(program,"uMvp");let running=false,paused=false,finished=false,muted=false,audio=null,musicNodes=[],last=0,elapsed=0,score=0,health=3,stage=1;
const keys=new Set(),player={x:0,y:.65,z:0,vx:0,vz:0};let pickups=[],hazards=[];
function makeWorld(){pickups=[];hazards=[];for(let i=1;i<=12;i++)pickups.push({x:Math.sin(i*1.7)*4,z:-i*5,y:.8,taken:false});for(let i=1;i<=10;i++)hazards.push({x:Math.cos(i*2.1)*4,z:-i*6-3,y:.55,hit:false})}
function reset(){player.x=0;player.z=0;player.vx=0;player.vz=0;score=0;health=3;stage=1;elapsed=0;finished=false;makeWorld();scoreEl.textContent="0";status.textContent=${fullGame ? '"STAGE 1/3"' : '"READY"'};overlayTitle.textContent="Ready to explore?";overlayCopy.textContent="Move through the 3D course, collect the glowing shards, and avoid the red hazards.";startBtn.textContent="Start game";overlay.classList.remove("hidden")}
function musicStart(){if(muted||musicNodes.length)return;try{audio=audio||new(window.AudioContext||window.webkitAudioContext)();if(audio.state==="suspended")audio.resume();const master=audio.createGain();master.gain.value=.016;master.connect(audio.destination);for(const [freq,type] of ${JSON.stringify(music.notes.map((freq,i)=>[freq,music.waves[i]]))}){const o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.value=freq;g.gain.value=type==="triangle" ? 0.2 : 0.32;o.connect(g);g.connect(master);o.start();musicNodes.push(o,g)}musicNodes.push(master)}catch{}}function musicStop(){for(const node of musicNodes){try{if(node.stop)node.stop();else node.disconnect()}catch{}}musicNodes=[]}
function beep(freq=560){if(muted)return;try{audio=audio||new(window.AudioContext||window.webkitAudioContext)();if(audio.state==="suspended")audio.resume();const o=audio.createOscillator(),g=audio.createGain();o.frequency.value=freq;g.gain.setValueAtTime(.035,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.12);o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+.12)}catch{}}
function resize(){const d=Math.min(window.devicePixelRatio||1,2),w=canvas.clientWidth,h=canvas.clientHeight;if(canvas.width!==Math.round(w*d)||canvas.height!==Math.round(h*d)){canvas.width=Math.max(1,Math.round(w*d));canvas.height=Math.max(1,Math.round(h*d))}gl.viewport(0,0,canvas.width,canvas.height)}
function drawCube(viewProj,x,y,z,sx,sy,sz,turn=0){let model=multiply(translation(x,y,z),rotationY(turn));model=multiply(model,scaling(sx,sy,sz));gl.uniformMatrix4fv(mvpLoc,false,multiply(viewProj,model));gl.drawArrays(gl.TRIANGLES,0,positions.length/3)}
function render(now){resize();gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);gl.clearColor(${profile.bg.match(/[0-9a-f]{2}/gi).map(value => (parseInt(value,16)/255).toFixed(3)).join(",")},1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);const proj=perspective(Math.PI/3,canvas.width/Math.max(1,canvas.height),.1,140);const view=multiply(rotationX(-.12),translation(-player.x,-2.5,-player.z-8));const vp=multiply(proj,view);drawCube(vp,0,-.55,-36,22,.5,90);for(let i=0;i<32;i++){const z=-i*2.8-1;drawCube(vp,Math.sin(i*1.7)*10,.15,z,.12,.3,.12,elapsed*.2)}for(const h of hazards){if(Math.abs(h.z-player.z)>55)continue;drawCube(vp,h.x,h.y+Math.sin(elapsed*2+h.z)*.12,h.z,1,1,1,elapsed*.8)}for(const item of pickups){if(item.taken||Math.abs(item.z-player.z)>55)continue;drawCube(vp,item.x,item.y+Math.sin(elapsed*3-item.z)*.14,item.z,.5,.5,.5,elapsed*1.8)}drawCube(vp,player.x,player.y,player.z,.8,1.2,.8,Math.atan2(player.vx,-player.vz||.001));}
function end(win){running=false;finished=true;status.textContent=win?"COMPLETE":"GAME OVER";overlay.classList.remove("hidden");overlayTitle.textContent=win?"Course complete!":"Run ended";overlayCopy.textContent=win?"You collected enough shards. Restart for another run.":"You hit too many hazards. Restart and try another route.";startBtn.textContent="Play again";beep(win?820:160)}
function update(dt){elapsed+=dt;const left=keys.has("arrowleft")||keys.has("a"),right=keys.has("arrowright")||keys.has("d"),forward=keys.has("arrowup")||keys.has("w")||keys.has(" "),back=keys.has("arrowdown")||keys.has("s");player.vx+=(Number(right)-Number(left))*13*dt;player.vz+=(Number(back)-Number(forward))*13*dt;player.vx*=Math.pow(.025,dt);player.vz*=Math.pow(.025,dt);player.x=Math.max(-8,Math.min(8,player.x+player.vx*dt));player.z=Math.min(4,Math.max(-75,player.z+player.vz*dt));for(const item of pickups){if(item.taken)continue;if(Math.hypot(player.x-item.x,player.z-item.z)<1.15){item.taken=true;score+=10;scoreEl.textContent=String(score);beep(850)}}for(const h of hazards){if(h.hit)continue;if(Math.hypot(player.x-h.x,player.z-h.z)<1.15){h.hit=true;health--;beep(130);if(health<=0){end(false);return}}}${fullGame ? 'if(score>=stage*80||player.z<=-72){if(stage<3)nextStage();else{end(true)}}' : 'if(score>=80||player.z<=-72){end(true)}'}}
function loop(now){if(!running||paused)return;const dt=Math.min(.04,Math.max(0,(now-last)/1000));last=now;update(dt);render(now);if(running&&!paused)requestAnimationFrame(loop)}
function start(){if(finished)reset();running=true;paused=false;overlay.classList.add("hidden");status.textContent="EXPLORING";pauseBtn.textContent="Pause";last=performance.now();musicStart();beep();requestAnimationFrame(loop)}
function pause(){if(!running)return;paused=!paused;status.textContent=paused?"PAUSED":"EXPLORING";pauseBtn.textContent=paused?"Resume":"Pause";if(!paused){last=performance.now();requestAnimationFrame(loop)}}
${fullGame ? 'function nextStage(){if(stage>=3){end(true);return}stage++;player.x=0;player.z=0;player.vx=0;player.vz=0;health=3;makeWorld();status.textContent="STAGE "+stage+"/3";beep(820);}' : ''}
window.addEventListener("resize",resize);window.addEventListener("keydown",e=>{const k=e.key.toLowerCase();if(["arrowup","arrowdown","arrowleft","arrowright"," "].includes(k))e.preventDefault();keys.add(k);if(k==="p")pause();if(k==="r"){running=false;reset();render(performance.now())}});window.addEventListener("keyup",e=>keys.delete(e.key.toLowerCase()));canvas.addEventListener("pointerdown",e=>{canvas.setPointerCapture?.(e.pointerId);if(!running)start()});canvas.addEventListener("pointermove",e=>{if(e.buttons){player.vx+=(e.movementX||0)*.012;player.vz-=(e.movementY||0)*.012}});startBtn.addEventListener("click",start);pauseBtn.addEventListener("click",pause);restartBtn.addEventListener("click",()=>{running=false;reset();render(performance.now());start()});audioBtn.addEventListener("click",()=>{muted=!muted;audioBtn.textContent="Sound: "+(muted?"off":"on");if(muted)musicStop();else{musicStart();beep()}});reset();render(0);
})();`;
}
function themedCss(prompt, engine) {
  const profile = visualProfile(prompt, engine);
  let themed = css
    .replace('--bg:#0b1015', '--bg:' + profile.bg)
    .replace('--panel:#141d25', '--panel:' + profile.panel)
    .replace('--line:#293744', '--line:' + profile.line)
    .replace('--text:#edf4f7', '--text:' + profile.text)
    .replace('--muted:#a0b1bb', '--muted:' + profile.muted)
    .replace('--accent:#b8e3d0', '--accent:' + profile.accent)
    .replace('--accent-ink:#10251e', '--accent-ink:' + profile.ink)
    .replace('radial-gradient(ellipse at 50% -20%,#263b46 0,transparent 55%)', 'radial-gradient(ellipse at 50% -20%,' + profile.glow + ' 0,transparent 58%)')
    .replace('background:#0a1118', 'background:' + profile.bg)
    .replace('border:1px solid #344754', 'border:1px solid ' + profile.line)
    .replace('background:linear-gradient(120deg,#071018aa,#07101855)', 'background:linear-gradient(120deg,' + profile.bg + 'ee,' + profile.bg + '66)')
    .replace('background:#101a22eF', 'background:' + profile.panel + 'f2');
  if (profile.id === "playful") themed = themed.replace('border-radius:18px', 'border-radius:28px').replace('border-radius:20px', 'border-radius:26px');
  if (profile.id === "cinematic" || profile.id === "noir") themed = themed.replace('letter-spacing:-.04em;margin:8px 0', 'letter-spacing:.01em;margin:8px 0').replace('backdrop-filter:blur(3px)', 'backdrop-filter:blur(8px)');
  if (profile.id === "arcade" || profile.id === "velocity") themed = themed.replace('border-radius:18px', 'border-radius:8px').replace('border-radius:20px', 'border-radius:10px');
  return themed;
}
function themedAppCss(prompt) {
  const profile = visualProfile(prompt, "webapp");
  return appCss.replace("--ink:#17232a", "--ink:" + profile.text).replace("--muted:#667780", "--muted:" + profile.muted).replace("--line:#dce5e8", "--line:" + profile.line).replace("--accent:#176b58", "--accent:" + profile.accent).replace("--bg:#f3f7f6", "--bg:" + profile.bg).replace("linear-gradient(145deg,#edf5f1,#f8faf9 60%)", "linear-gradient(145deg," + profile.bg + "," + profile.panel + " 60%)").replace("background:#fff", "background:" + profile.panel);
}
function appJs(title) {
  return `(() => {"use strict";const form=document.getElementById("task-form"),input=document.getElementById("task-input"),list=document.getElementById("task-list"),count=document.getElementById("task-count"),filter=document.getElementById("task-filter");let tasks=[];try{tasks=JSON.parse(localStorage.getItem("gene-native-tasks")||"[]")}catch{}function save(){localStorage.setItem("gene-native-tasks",JSON.stringify(tasks));render()}function render(){list.innerHTML="";const shown=tasks.filter(t=>filter.value==="all"||(filter.value==="open"&&!t.done)||(filter.value==="done"&&t.done));for(const task of shown){const li=document.createElement("li");li.className=task.done?"done":"";const check=document.createElement("input");check.type="checkbox";check.checked=task.done;check.setAttribute("aria-label","Complete "+task.text);check.addEventListener("change",()=>{task.done=check.checked;save()});const label=document.createElement("span");label.textContent=task.text;const del=document.createElement("button");del.type="button";del.textContent="Delete";del.addEventListener("click",()=>{tasks=tasks.filter(t=>t.id!==task.id);save()});li.append(check,label,del);list.append(li)}count.textContent=tasks.filter(t=>!t.done).length+" remaining · "+tasks.length+" total"}form.addEventListener("submit",e=>{e.preventDefault();const value=input.value.trim();if(!value){input.focus();return}tasks.unshift({id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),text:value.slice(0,180),done:false});input.value="";save();input.focus()});filter.addEventListener("change",render);render()})();`;
}
function appHtml(title, prompt = "") {
  const profile = visualProfile(prompt, "webapp");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><link rel="stylesheet" href="game.css"></head><body><main class="app"><header><p class="eyebrow">${esc(profile.genre)} / GENE APP</p><h1>${esc(title)}</h1><p class="sub">${esc(profile.subtitle)} Your data stays in this browser.</p></header><section class="panel"><form id="task-form"><label for="task-input">What do you want to track?</label><div class="entry"><input id="task-input" maxlength="180" placeholder="Add a task or idea…" required><button type="submit">Add item</button></div></form><div class="list-head"><strong id="task-count">0 remaining</strong><label>Show <select id="task-filter"><option value="all">All items</option><option value="open">Open</option><option value="done">Completed</option></select></label></div><ul id="task-list"></ul></section><p class="help">No account or external service required. Data is saved in this browser.</p></main><script src="game.js"></script></body></html>`;
}
const appCss = `:root{color-scheme:light;--ink:#17232a;--muted:#667780;--line:#dce5e8;--accent:#176b58;--bg:#f3f7f6}*{box-sizing:border-box}body{margin:0;background:linear-gradient(145deg,#edf5f1,#f8faf9 60%);color:var(--ink);font:15px/1.5 ui-sans-serif,system-ui,sans-serif}.app{width:min(760px,calc(100% - 32px));margin:clamp(28px,8vh,90px) auto}.eyebrow{font-size:10px;letter-spacing:.18em;color:var(--accent);font-weight:800;margin:0 0 8px}h1{font-size:clamp(30px,5vw,48px);letter-spacing:-.05em;margin:0}.sub{color:var(--muted);margin:8px 0 26px}.panel{background:#fff;border:1px solid var(--line);border-radius:20px;padding:clamp(16px,4vw,28px);box-shadow:0 18px 60px #29473a0a}label{font-weight:650;font-size:13px}.entry{display:flex;gap:8px;margin-top:8px}input,select,button{font:inherit;border:1px solid var(--line);border-radius:10px;padding:11px 12px}input{flex:1;min-width:0}button{background:var(--accent);border-color:var(--accent);color:#fff;font-weight:700;cursor:pointer}button:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #7bc4ae;outline-offset:2px}.list-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:24px;padding-top:18px;border-top:1px solid var(--line)}.list-head label{display:flex;align-items:center;gap:7px}ul{list-style:none;padding:0;margin:12px 0 0}li{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid #edf1f2}li input{flex:0 0 auto;width:17px;height:17px;accent-color:var(--accent)}li span{flex:1;overflow-wrap:anywhere}li.done span{color:#81908a;text-decoration:line-through}li button{background:transparent;color:#68777c;border-color:var(--line);padding:6px 9px;font-size:12px}.help{font-size:12px;color:var(--muted);margin-top:16px}@media(max-width:480px){.entry{flex-direction:column}.list-head{align-items:flex-start;flex-direction:column}}`;

async function searchNativeSources(query) {
  const q = text(query, 220);
  if (!q) return [];
  const timeout = () => AbortSignal.timeout(4500);
  const requests = [
    (async () => {
      const url = "https://developer.mozilla.org/api/v1/search?q=" + encodeURIComponent(q) + "&locale=en-US";
      const response = await fetch(url, { signal: timeout(), headers: { "Accept": "application/json" } });
      if (!response.ok) return [];
      const data = await response.json();
      return (Array.isArray(data.documents) ? data.documents : []).slice(0, 4).map(item => ({
        title: text(item.title, 180) || "MDN reference",
        url: typeof item.mdn_url === "string" ? "https://developer.mozilla.org" + item.mdn_url : typeof item.url === "string" ? item.url : "",
        note: text(item.summary || item.popularity, 420) || "MDN documentation search result",
        source: "MDN",
        live: true
      })).filter(item => item.url.startsWith("https://developer.mozilla.org/"));
    })(),
    (async () => {
      const url = "https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=" + encodeURIComponent(q) + "&format=json&origin=*&srlimit=3";
      const response = await fetch(url, { signal: timeout(), headers: { "Accept": "application/json" } });
      if (!response.ok) return [];
      const data = await response.json();
      return (Array.isArray(data?.query?.search) ? data.query.search : []).slice(0, 3).map(item => ({
        title: text(item.title, 180) || "Wikipedia article",
        url: "https://en.wikipedia.org/wiki/" + encodeURIComponent(String(item.title || "").replace(/ /g, "_")),
        note: text(String(item.snippet || "").replace(/<[^>]*>/g, " ").replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, "&"), 420),
        source: "Wikipedia",
        live: true
      })).filter(item => item.title && item.url);
    })()
  ];
  const settled = await Promise.allSettled(requests);
  const output = [];
  for (const item of settled) if (item.status === "fulfilled") output.push(...item.value);
  return output.slice(0, 7);
}

export async function createNativeResult(input = {}) {
  const prompt = text(input.message || input.prompt);
  if (!prompt) throw new TypeError("Enter a game or app idea first.");
  const operation = text(input.operation || "build");
  const kind = input.project?.kind === "app" || input.kind === "app" ? "app" : "game";
  const attachedReferences = Array.isArray(input.project?.references) ? input.project.references.slice(0, 24).map(ref => ({
    name: text(ref?.name, 180) || "attached-reference",
    kind: ref?.kind === "image" ? "image" : "text",
    mimeType: text(ref?.mimeType, 80),
    textContent: ref?.kind === "text" ? text(ref?.textContent, 5000) : ""
  })) : [];
  const referenceText = attachedReferences.filter(ref => ref.textContent).map(ref => ref.name + ": " + ref.textContent).join("\n").slice(0, 10000);
  const savedAnswers = input.answers && typeof input.answers === "object" ? input.answers : {};
  const answerText = Object.entries(savedAnswers).filter(([key]) => key.startsWith("native-")).map(([key, value]) => key.replace("native-", "") + ": " + text(value, 300)).join("\n");
  const baseIdea = operation === "interview" ? text(input.project?.initialPrompt) || prompt : prompt;
  const designPrompt = [baseIdea, answerText ? "Design decisions:\n" + answerText : "", referenceText ? "Reference context:\n" + referenceText : ""].filter(Boolean).join("\n\n");
  const engine = pickEngine({ kind, engine: input.project?.preferredEngine || input.project?.plan?.engine || input.engine, prompt: designPrompt });
  const projectName = text(input.project?.name);
  const title = titleFrom(input.project?.plan?.title || (projectName && projectName !== "New project" ? projectName : "") || input.project?.initialPrompt || prompt);
  const fullGameExpansion = operation === "buildPart" && input.stagePath === "game.js" && /FULL GAME EXPANSION PASS/i.test(prompt);
  const references = [...ENGINE_DOCS[engine], ...attachedReferences.map(ref => ({ title: ref.name, note: ref.kind === "image" ? "User/research image reference attached; this template does not analyze image pixels." : ref.textContent.slice(0, 420), source: "project-attachment" }))];
  const profile = visualProfile(designPrompt, engine);
  const soundtrack = musicProfile(designPrompt);
  const plan = {
    title, kind, engine,
    genre: profile.genre,
    summary: ("Native-only build plan for: " + designPrompt.slice(0, 2200)).slice(0, 2600),
    design: {
      visualIdentity: profile.id,
      palette: { background: profile.bg, panel: profile.panel, accent: profile.accent, text: profile.text },
      menuDirection: text(savedAnswers["native-menu"], 240) || profile.menu,
      menuCopy: { title: profile.menu, subtitle: profile.subtitle, primaryAction: profile.cta },
      soundtrack: { mood: soundtrack.mood, synthesis: "Web Audio API oscillator/gain layers", notes: soundtrack.notes, waves: soundtrack.waves },
      variationSeed: title + "|" + profile.id + "|" + soundtrack.mood
    },
    stages: kind === "app" ? [
      { name: "Define", goal: "Turn the main user task into a clear flow", acceptance: ["Primary action is visible", "Empty and invalid states are explained"] },
      { name: "Build", goal: "Implement responsive screens and state", acceptance: ["Keyboard and touch work", "State changes are visible"] },
      { name: "Verify", goal: "Test persistence and recovery", acceptance: ["Reload preserves saved state", "Invalid input does not destroy work"] }
    ] : [
      { name: "Identity and core loop", goal: "Establish genre, player fantasy, controls, and game feel", acceptance: ["Title menu matches genre", "Core loop is playable", "Controls are explained"] },
      { name: "World and progression", goal: "Create a distinct environment and meaningful objective progression", acceptance: ["World uses the selected art direction", "At least one objective completes", "Win and loss states are reachable"] },
      { name: "Polish and audio", goal: "Add responsive feedback, soundtrack, and recovery", acceptance: ["Music and effects have independent mute behavior", "Pause and restart work", "UI remains usable on narrow screens"] },
      { name: "Verification", goal: "Run static checks and interactive gameplay tests", acceptance: ["No uncaught startup error", "Primary controls change game state", "Restart returns to a valid initial state"] }
    ],
    tasks: kind === "app"
      ? ["Define the main user flow and data contract", "Build responsive semantic UI in the selected visual style", "Wire validation and visible state changes", "Persist state locally", "Run source and interaction checks"]
      : ["Establish the genre-specific title/menu and playable core loop", "Implement the selected camera/perspective and responsive rendering", "Add objective progression, hazards, recovery, and restart", "Synthesize genre-appropriate music and event-based sound effects", "Run source checks and interactive gameplay tests"],
    mechanics: kind === "app" ? ["Responsive UI", "Form validation", "Local persistence", "Accessible interactions"] : [
      ...new Set([text(savedAnswers["native-core-loop"], 100) || "Exploration", "Objective progression", "Contextual feedback", "Pause and restart", soundtrack.mood + " procedural audio"])
    ],
    testMatrix: kind === "app" ? [
      { test: "Primary workflow", method: "Browser interaction", expected: "User can complete the primary task" },
      { test: "Persistence", method: "Reload browser", expected: "Saved state is restored" },
      { test: "Responsive layout", method: "Narrow viewport", expected: "Controls remain visible and usable" }
    ] : [
      { test: "Startup", method: "Load generated page", expected: "Canvas/context initializes without uncaught error" },
      { test: "Core controls", method: "Keyboard and pointer input", expected: "Player or world state responds" },
      { test: "Audio", method: "Start then mute/unmute", expected: "Audio starts on user gesture and respects mute" },
      { test: "Recovery", method: "Pause, restart, win/loss", expected: "State transitions remain valid" }
    ],
    risks: [
      { risk: engine === "webgl3d" ? "WebGL unavailable on some devices" : "Audio may be blocked before a user gesture", mitigation: engine === "webgl3d" ? "Show a clear fallback message and offer the 2D target" : "Start audio only after explicit interaction and provide a mute control" },
      { risk: "Rule-based native generation has limited semantic flexibility", mitigation: "Keep scope honest, validate generated output, and use verified project experiences for future scratch-model training" }
    ],
    performanceBudget: { targetFps: 60, maxEnemies: kind === "app" ? 0 : 12, maxObjects: 350, maxParticles: kind === "app" ? 0 : 90 },
    references,
    research: { mode: "source-index", externalAiUsed: false, searchedLiveWeb: false, note: "These are curated official/reference sources, not live search results. Use the included search links for live web research." }
  };
  if (operation === "research") {
    const q = encodeURIComponent(prompt);
    const searches = [
      { title: "Search the web", url: "https://www.google.com/search?q=" + q },
      { title: "Search GitHub", url: "https://github.com/search?q=" + q + "&type=code" },
      { title: "Search MDN", url: "https://developer.mozilla.org/en-US/search?q=" + q }
    ];
    const liveSources = await searchNativeSources(prompt);
    return {
      reply: liveSources.length
        ? "Native research completed using public documentation/search endpoints. No AI API was called. Treat snippets as discovery leads and verify technical details in the linked source."
        : "Native research could not retrieve live results in this run. No AI API was called; use the search links and curated engine documentation below.",
      files: [], plan, complete: true, needsUserDecision: false,
      research: { sources: [...liveSources, ...references], searches, liveSearchAttempted: true, liveSearchSucceeded: liveSources.length > 0, externalAiUsed: false }
    };
  }
  if (operation === "interview") {
    const answers = input.answers && typeof input.answers === "object" ? input.answers : {};
    const question = nativeInterviewQuestion(kind, answers, String(input.project?.initialPrompt || prompt));
    if (question) {
      return {
        reply: "Gene Native interview: decision " + question.step + " of " + question.total + ". I will adapt the build plan to these answers; no external AI was called.",
        question, files: [], plan: null, complete: false, needsUserDecision: true,
        processingTrace: ["Interview: classified project type", "Interview: checked saved decisions", "Interview: selected the next high-impact question"]
      };
    }
    const decisions = Object.entries(answers).filter(([key]) => key.startsWith("native-")).map(([key, value]) => key.replace("native-", "") + "=" + text(value, 180));
    plan.summary += " Interview choices: " + decisions.join("; ").slice(0, 900);
    if (answers["native-core-loop"]) plan.mechanics = [text(answers["native-core-loop"], 100), ...plan.mechanics.filter(item => item !== "Movement")].slice(0, 8);
    if (answers["native-progression"]) plan.tasks[2] = "Implement progression: " + text(answers["native-progression"], 180);
    if (answers["native-audio"]) plan.tasks[3] = "Implement audio direction: " + text(answers["native-audio"], 180);
    return {
      reply: "Interview complete. Gene has saved the design decisions into the plan. Review the plan, then ask Gene to build it. Native mode uses no external AI; this plan is rule-based.",
      question: null, files: [], plan, complete: true, needsUserDecision: false, references,
      processingTrace: ["Interview: all required decisions captured", "Planning: applied interview constraints", "Planning: prepared build checklist"]
    };
  }
  if (operation === "enhancePrompt") {
    return { reply: prompt + "\n\nNative implementation checklist:\n- Preserve the requested genre, platform, perspective, and visual identity.\n- Build a playable core loop before adding optional systems.\n- Keep controls, scoring/progression, pause/restart, and win/loss behavior testable.\n- Use the attached research notes and references as constraints; verify licenses before shipping assets.\n- Run source validation and browser gameplay tests; report anything not verified.", files: [], plan, complete: true, needsUserDecision: false, references };
  }
  if (operation === "plan") {
    return { reply: "Created a native, rule-based plan without external AI calls. This is structured planning, not neural-model reasoning.", files: [], plan, complete: true, needsUserDecision: false, references };
  }
  if (operation === "edit") {
    return { reply: "No files were changed. Gene Native can create and validate its current starter templates, but arbitrary semantic edits to existing source are not safe yet without the native code-reasoning model. Use a fresh native build, or switch to a provider-backed mode for this edit until native code editing is implemented.", files: [], plan, complete: true, needsUserDecision: false, nativeGeneration: { modelUsed: false, externalAiUsed: false, editSupported: false } };
  }
  if (operation === "chat") {
    const history = Array.isArray(input.history) ? input.history : [];
    const q = prompt.toLowerCase();
    const context = "Current project: " + plan.title + " (" + plan.engine + ", " + profile.genre + ").";
    let reply;
    if (q.includes("menu") || q.includes("title screen") || q.includes("interface") || q.includes("visual") || q.includes("design") || q.includes("theme")) {
      reply = context + "\n\nDesign direction: " + profile.genre + ", using the " + profile.id + " visual profile and " + profile.menu + " title-screen direction. To apply a change, ask Gene to rebuild with the menu style you want. The native builder can vary rule-based profiles, but cannot yet invent arbitrary high-end layouts like a trained general model.";
    } else if (q.includes("music") || q.includes("soundtrack") || q.includes("audio") || q.includes("sound effect")) {
      reply = context + "\n\nAudio direction: " + soundtrack.mood + ". Gene synthesizes original tones locally with Web Audio; notes and timbres vary by genre. This is procedural audio, not a neural composer or recorded orchestral soundtrack.";
    } else if (q.includes("model") || q.includes("neural") || q.includes("train") || q.includes("intelligence") || q.includes("quality") || q.includes("better games")) {
      reply = context + "\n\nHonest status: this native path does not call another AI, but generation still uses rule-based templates and deterministic planning. The scratch-trained neural model is not yet driving complete game creation. The next milestone is verified examples, held-out evaluation, model-assisted generation, and browser tests that reject broken outputs.";
    } else if (q.includes("plan") || q.includes("roadmap") || q.includes("next") || q.includes("steps") || q.includes("progress")) {
      reply = context + "\n\nImplementation stages:\n" + (plan.stages || []).map((stage, i) => (i + 1) + ". " + stage.name + ": " + stage.goal).join("\n") + "\n\nA plan is not proof that the game passed browser tests.";
    } else if (q.includes("research") || q.includes("reference") || q.includes("search") || q.includes("inspiration")) {
      reply = context + "\n\nI can attach curated engine documentation and public search links without an AI API. Live research is only claimed when retrieval succeeds; reference images are guidance, not proof that their pixels or licenses were analyzed.";
    } else if (q.includes("error") || q.includes("bug") || q.includes("broken") || q.includes("crash") || q.includes("fix")) {
      reply = context + "\n\nSend the exact error or the steps that reproduce it. Native mode must not claim a fix until the output and relevant interaction have been tested.";
    } else {
      const memory = history.slice(-6).map(item => text(item?.content || item?.text, 260)).filter(Boolean);
      reply = "I understood: " + text(prompt, 700) + ". " + context + "\n\nI can discuss the saved plan, genre profile, audio direction, references, and test checklist without an external AI. This chat response alone does not modify project files; ask for a build or a specific edit to change them." + (memory.length ? "\n\nRecent context: " + memory.join(" | ").slice(0, 700) : "");
    }
    return { reply, files: [], plan, complete: true, needsUserDecision: false, references, conversation: { mode: "native-rule-based", externalAiUsed: false, contextualHistoryUsed: history.length > 0 } };
  }
  const spec = { ...projectSpec(title, engine, designPrompt), designProfile: { id: profile.id, genre: profile.genre, palette: plan.design.palette, menu: plan.design.menuCopy, menuDirection: plan.design.menuDirection }, audio: { ...projectSpec(title, engine, designPrompt).audio, mood: soundtrack.mood, notes: soundtrack.notes, waveforms: soundtrack.waves, implementation: "procedural-web-audio" }, implementationPlan: { stages: plan.stages, tasks: plan.tasks, testMatrix: plan.testMatrix, risks: plan.risks }, references: attachedReferences.map(({ name, kind, mimeType }) => ({ name, kind, mimeType })), researchSources: references.map(({ title, url, source }) => ({ title, url, source: source || "curated-documentation" })) };
  const files = engine === "webapp"
    ? [
        { path: "game.html", content: appHtml(title, designPrompt) },
        { path: "game.css", content: themedAppCss(designPrompt) },
        { path: "game.js", content: appJs(title) },
        { path: "game-spec.json", content: JSON.stringify({ ...spec, features: ["Add and delete items", "Mark items complete", "Filter by status", "Persist data in local storage"], routes: ["Main workspace"], userFlows: ["Add item", "Complete item", "Delete item", "Filter items"] }, null, 2) }
      ]
    : [
        { path: "game.html", content: htmlShell(title, engine, designPrompt) },
        { path: "game.css", content: themedCss(designPrompt, engine) },
        { path: "game.js", content: engine === "webgl3d" ? webglGameJs(fullGameExpansion, designPrompt) : canvasGameJs(title, designPrompt, fullGameExpansion) },
        { path: "game-spec.json", content: JSON.stringify(spec, null, 2) }
      ];
  return {
    reply: "Native-only starter generated for " + title + ". No third-party AI provider was called. This is a playable foundation, not a finished high-end game: the current native generator uses deterministic templates rather than a trained capable language model. Run validation and gameplay tests, then iterate.",
    files,
    plan: { ...plan, nativeGeneration: { modelUsed: false, externalAiUsed: false, strategy: "deterministic-native-template-v1" } },
    complete: true,
    needsUserDecision: false,
    references,
    nativeGeneration: { modelUsed: false, externalAiUsed: false, qualityLevel: "playable-starter" }
  };
}

export function nativeSearchLinks(query) {
  const q = encodeURIComponent(text(query, 500));
  return [
    { title: "Web search", url: "https://www.google.com/search?q=" + q },
    { title: "GitHub code search", url: "https://github.com/search?q=" + q + "&type=code" },
    { title: "MDN documentation search", url: "https://developer.mozilla.org/en-US/search?q=" + q }
  ];
}
