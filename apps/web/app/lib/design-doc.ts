import type { DesignDoc, GeneProject, ProjectKind, Question } from "./types";

/**
 * GENE design intelligence: an adaptive interview and a deterministic design document.
 *
 * Both work with no AI provider (they are rule-based and labelled as such by the callers), and both are
 * also used to give a real model the approved decisions in a compact form, so a big game is built from
 * an agreed design instead of from a one-line guess.
 */

type Answers = Record<string, string>;

type GameArchetype = "precision-platformer" | "voxel-sandbox" | "rhythm-runner" | "open-world-adventure" | "story-adventure" | "survival-crafting" | "general";

function detectGameArchetype(text: string): GameArchetype {
  if (/minecraft|voxel|block.?world|block.?craft/i.test(text)) return "voxel-sandbox";
  if (/geometry.?dash|rhythm|beat.?sync|music.?platform/i.test(text)) return "rhythm-runner";
  if (/mario|precision platform|metroidvania|platformer/i.test(text)) return "precision-platformer";
  if (/open.?world|sandbox|exploration world|large world/i.test(text)) return "open-world-adventure";
  if (/story|narrative|dialogue|cinematic|adventure/i.test(text)) return "story-adventure";
  if (/survival|crafting|hunger|resource gathering/i.test(text)) return "survival-crafting";
  return "general";
}

const ARCHETYPE_PLANS: Record<GameArchetype, { pillars: string[]; milestones: string[]; risks: string[]; research: string[] }> = {
  "precision-platformer": {
    pillars: ["Responsive movement with coyote time and jump buffering where appropriate", "Readable hazards and fair checkpoints", "Levels teach, combine and remix movement skills"],
    milestones: ["Movement sandbox and jump-feel tuning", "One complete level with hazards, collectibles and restart", "Distinct level set with new mechanic combinations", "Boss or finale, accessibility options and polish"],
    risks: ["Unfair collision boxes or inconsistent jump timing", "Camera framing hides upcoming hazards", "Difficulty spikes without teaching the mechanic"],
    research: ["Platformer movement feel and input buffering", "Level pacing, hazard readability and checkpoint placement", "Animation readability and original visual identity"]
  },
  "voxel-sandbox": {
    pillars: ["Editable voxel terrain with stable world coordinates", "Streaming/chunked world and deterministic generation", "Gathering, crafting and exploration that reinforce each other"],
    milestones: ["Chunked terrain renderer with movement and collision", "Block break/place, inventory and deterministic world seed", "Save/load, chunk streaming and performance budgets", "Crafting/progression, creatures and world events in staged passes"],
    risks: ["Generating an entire world in one frame", "Save corruption or chunk-coordinate seams", "Unbounded meshes, entities or memory growth"],
    research: ["Voxel chunk meshing, greedy meshing and terrain LOD", "Seeded procedural generation and chunk persistence", "Inventory/crafting data models and world-save versioning"]
  },
  "rhythm-runner": {
    pillars: ["Gameplay timing follows an authoritative beat clock", "Obstacles communicate rhythm before demanding precision", "Instant restart and consistent hit windows"],
    milestones: ["Beat clock and fixed song/chart timeline", "One playable song section with hitboxes and restart", "Chart authoring format, difficulty variants and effects", "Calibration options, full menu flow and performance polish"],
    risks: ["Frame-rate-dependent timing drift", "Audio latency makes inputs feel unfair", "Visual effects obscure hitboxes or beat cues"],
    research: ["Audio-clock timing versus frame delta", "Input latency calibration and judgment windows", "Chart data formats and accessible rhythm cues"]
  },
  "open-world-adventure": {
    pillars: ["Exploration is rewarded with clear landmarks and discoveries", "Streaming world regions keep memory and frame time bounded", "Quests and traversal systems support the setting"],
    milestones: ["Small traversable region with landmarks and navigation", "World streaming, interactions and save/load", "Quest/data system and two distinct regions", "Progression, encounters and staged content expansion"],
    risks: ["World scope grows before the traversal loop is fun", "Long-distance navigation lacks landmarks", "Unbounded asset loading or save data"],
    research: ["World streaming and spatial partitioning", "Landmark-based navigation and exploration rewards", "Quest-state modeling and incremental save formats"]
  },
  "story-adventure": {
    pillars: ["Player choices have clear, consistent consequences", "Dialogue and objectives remain understandable", "Scenes and pacing support the emotional arc"],
    milestones: ["Opening scene, controls and first meaningful choice", "Dialogue/quest state system and save/load", "Branching missions with tested state transitions", "Finale, recap and narrative continuity pass"],
    risks: ["Choice flags become inconsistent across scenes", "Story beats depend on unreachable states", "Cutscenes block controls without recovery"],
    research: ["Branching narrative state graphs", "Dialogue presentation and accessibility", "Quest flags, save compatibility and scene transitions"]
  },
  "survival-crafting": {
    pillars: ["Gathering feeds useful, legible crafting decisions", "Threat creates pressure without arbitrary punishment", "Resources and progression stay understandable"],
    milestones: ["Gathering loop and inventory", "Crafting recipes, needs and readable feedback", "Threat cycle, shelter/upgrades and save/load", "Balance pass and optional difficulty settings"],
    risks: ["Resource grind overwhelms exploration", "Needs systems become busywork", "Progress can soft-lock without recovery"],
    research: ["Resource economy and recipe graph design", "Survival pacing and fair threat escalation", "Save-safe crafting transactions and inventory invariants"]
  },
  general: {
    pillars: ["One recognizable signature mechanic", "Clear objectives and feedback", "A coherent visual and audio identity"],
    milestones: ["Playable core loop and controls", "Complete win/loss/restart flow", "Distinct content and progression", "Polish, accessibility and acceptance review"],
    risks: ["Scope exceeds the selected runtime", "Features look connected but do not share state", "Visual effects hide gameplay information"],
    research: ["Comparable genre mechanics and player expectations", "Performance constraints for the target platform", "Asset licenses and integration requirements"]
  }
};

const GENRE_PATTERNS: Array<[string, RegExp]> = [
  ["platformer", /platform|mario|jump|metroidvania|side.?scroll/i],
  ["runner", /runner|subway|endless|lane|dash|rhythm/i],
  ["shooter", /shoot|shmup|bullet|space|arena|twin.?stick|fps/i],
  ["racing", /rac(e|ing)|drift|car|kart|drive/i],
  ["tower", /tower|defen[cs]e|wave|strategy|rts|economy/i],
  ["puzzle", /puzzle|match|logic|physics puzzle|sokoban|word/i],
  ["survival", /surviv|craft|horror|zombie|sandbox|open world/i],
  ["rpg", /rpg|quest|story|adventure|dungeon|roguelike|card/i],
  ["fighter", /fight|combat|brawl|beat.?em|duel|sword/i],
  ["sports", /sport|football|soccer|basket|tennis|golf|pong/i]
];

export function detectGenre(...texts: Array<string | undefined>): string {
  const text = texts.filter(Boolean).join(" ");
  for (const [genre, pattern] of GENRE_PATTERNS) if (pattern.test(text)) return genre;
  return "action";
}

const GAME_BASE: Array<Omit<Question, "step" | "total">> = [
  {
    id: "genre",
    text: "What should the core gameplay feel like?",
    why: "This defines the main loop, the challenge, and the win and loss rules.",
    choices: ["Action / combat", "Adventure / story", "Platformer / precision", "Racing / endless runner", "Survival / crafting", "Puzzle / strategy", "Use a creative surprise"],
    recommended: "Use a creative surprise"
  },
  {
    id: "fantasy",
    text: "What world or fantasy is the player living in?",
    why: "A specific setting gives the game identity: enemies, props, palette and story beats all follow from it.",
    choices: ["Sci-fi / space", "Fantasy / myth", "Ancient / historical", "Modern city / street", "Horror / dark", "Cute / cozy", "Let GENE invent one that fits"],
    recommended: "Let GENE invent one that fits"
  },
  {
    id: "art",
    text: "Which visual style should it have?",
    why: "The art direction decides the palette, shapes and effects that every asset and illustration will follow.",
    choices: ["Neon / synthwave", "Pixel art", "Flat vector / clean", "Painterly / storybook", "Low-poly 3D", "Dark & gritty", "Pick the best fit"],
    recommended: "Pick the best fit"
  },
  {
    id: "camera",
    text: "What perspective should players use?",
    why: "Camera and perspective affect controls, level design, and performance.",
    choices: ["2D side view", "2D top-down", "3D first-person", "3D third-person", "Choose what best fits the idea"],
    recommended: "Choose what best fits the idea"
  },
  {
    id: "scope",
    text: "How big should this game be?",
    why: "Scope sets how many levels, enemies and systems are planned. Bigger games are built in staged, checkpointed passes.",
    choices: ["Tight polished slice (about 10 minutes)", "Medium game (about 30 minutes, several levels)", "Big game (multi-hour structure, built in stages)", "Let GENE pick for the idea"],
    recommended: "Medium game (about 30 minutes, several levels)"
  },
  {
    id: "content",
    text: "What should make the full game worth finishing?",
    why: "The prototype proves the loop; the full game needs distinct content and progression.",
    choices: ["Story, missions, and an ending", "Levels with new mechanics", "Runs, unlocks, and replayability", "Co-op or competitive play", "A mix chosen for the idea"],
    recommended: "A mix chosen for the idea"
  },
  {
    id: "challenge",
    text: "How should the challenge ramp up?",
    why: "Difficulty pacing is what keeps a game fair and exciting instead of frustrating or flat.",
    choices: ["Gentle and forgiving", "Steady ramp with a boss", "Hard and precise", "Adaptive to the player", "Let GENE tune it"],
    recommended: "Steady ramp with a boss"
  },
  {
    id: "controls",
    text: "Which controls must work?",
    why: "Controls are planned and tested as part of the game, not added as an afterthought.",
    choices: ["Keyboard and mouse", "Touch controls", "Controller / gamepad", "Keyboard, touch, and controller", "Use the best supported defaults"],
    recommended: "Keyboard, touch, and controller"
  },
  {
    id: "audio",
    text: "What should it sound like?",
    why: "Music mood and sound effects are built in from the first playable, so this picks their character.",
    choices: ["Calm and atmospheric", "Tense and urgent", "Fast and energetic", "Mysterious", "Triumphant and heroic", "Match the world"],
    recommended: "Match the world"
  }
];

const GENRE_FOLLOW_UPS: Record<string, Omit<Question, "step" | "total">> = {
  platformer: { id: "movement", text: "How should movement feel?", why: "Jump feel is the soul of a platformer: buffering, coyote time and air control are tuned from this.", choices: ["Tight and precise", "Floaty and forgiving", "Fast and momentum-based", "Let GENE tune it"], recommended: "Tight and precise" },
  runner: { id: "lanes", text: "How should the track be structured?", why: "Lane count and obstacle rhythm decide readability at speed.", choices: ["Three lanes", "Free horizontal movement", "Auto-run with one-button jumps", "Let GENE decide"], recommended: "Three lanes" },
  shooter: { id: "weapons", text: "How deep should weapons and upgrades go?", why: "Weapon variety and upgrades drive long-term engagement.", choices: ["One weapon, mastered", "Several weapons to unlock", "Upgrades between waves", "Let GENE decide"], recommended: "Upgrades between waves" },
  racing: { id: "track", text: "What kind of tracks?", why: "Track variety and handling model are the core of a racer.", choices: ["Arcade circuits", "Endless highway", "Drift-focused courses", "Let GENE decide"], recommended: "Arcade circuits" },
  tower: { id: "economy", text: "How should the economy work?", why: "Resources and upgrade paths decide strategic depth.", choices: ["Gold per kill", "Gold per wave", "Upgrade trees", "Let GENE decide"], recommended: "Upgrade trees" },
  puzzle: { id: "mechanic", text: "What is the central puzzle mechanic?", why: "One clear mechanic, introduced and then twisted, makes puzzle levels memorable.", choices: ["Matching / chaining", "Physics and placement", "Logic and rules", "Let GENE invent one"], recommended: "Let GENE invent one" },
  survival: { id: "pressure", text: "What is the main source of pressure?", why: "Threat and scarcity create the survival tension.", choices: ["Enemies and hordes", "Hunger / resources", "Environment and time", "Let GENE decide"], recommended: "Enemies and hordes" },
  rpg: { id: "systems", text: "Which systems matter most?", why: "RPG depth comes from a few interlocking systems, not many shallow ones.", choices: ["Quests and dialogue", "Combat and builds", "Exploration and loot", "Let GENE decide"], recommended: "Combat and builds" },
  fighter: { id: "roster", text: "How big should the roster be?", why: "Move sets per character are the real content of a fighter.", choices: ["One hero, many enemies", "Two to four fighters", "Larger roster", "Let GENE decide"], recommended: "Two to four fighters" }
};

const APP_BASE: Array<Omit<Question, "step" | "total">> = [
  { id: "audience", text: "Who is this app mainly for?", why: "The primary audience determines the main workflow and interface.", choices: ["Just me / personal use", "Customers or the public", "A team or business", "Use smart defaults"], recommended: "Use smart defaults" },
  { id: "goal", text: "What is the one job it must do really well?", why: "A single clear job keeps the interface focused and the flows complete.", choices: ["Show and present information", "Collect and manage data", "Sell or convert visitors", "Track progress and analytics", "Let GENE decide"], recommended: "Let GENE decide" },
  { id: "platform", text: "Where should the app work first?", why: "This determines responsive layout and the most important input patterns.", choices: ["Desktop web", "Mobile web", "Desktop and mobile"], recommended: "Desktop and mobile" },
  { id: "look", text: "What visual direction fits it?", why: "A concrete art direction makes the app feel designed rather than generic.", choices: ["Minimal and professional", "Bold and playful", "Premium glass / editorial", "Dark and technical", "Use smart defaults"], recommended: "Use smart defaults" },
  { id: "data", text: "Does it need to save user data?", why: "Persistence changes the architecture and validation requirements.", choices: ["No, local temporary state", "Save on this device", "Accounts and cloud data", "Recommend the simplest reliable option"], recommended: "Save on this device" },
  { id: "content", text: "How many screens or sections does it need?", why: "This sets the navigation structure and how much to build.", choices: ["One focused screen", "A few core screens", "A full multi-section product", "Let GENE decide"], recommended: "A few core screens" }
];

/** Ordered question list for the current answers, with adaptive genre follow-ups. */
export function interviewQuestions(kind: ProjectKind, answers: Answers, idea = ""): Question[] {
  if (kind === "app") return APP_BASE.map((q, i, all) => ({ ...q, step: i + 1, total: all.length }));
  const genre = detectGenre(idea, answers.genre);
  const follow = GENRE_FOLLOW_UPS[genre];
  const list = [...GAME_BASE];
  if (follow) list.splice(5, 0, follow);
  return list.map((q, i, all) => ({ ...q, step: i + 1, total: all.length }));
}

export function nextInterviewQuestion(kind: ProjectKind, answers: Answers, idea = ""): Question | null {
  const list = interviewQuestions(kind, answers, idea);
  return list.find(question => !Object.prototype.hasOwnProperty.call(answers, question.id)) || null;
}

const PALETTES: Array<[RegExp, string, string[]]> = [
  [/neon|synth/i, "Neon synthwave", ["#0b0220", "#ff2bd6", "#26e6ff", "#fcee0a", "#f5f1ff"]],
  [/pixel/i, "Chunky pixel art", ["#1a1c2c", "#5d275d", "#b13e53", "#ef7d57", "#ffcd75"]],
  [/flat|vector|clean/i, "Flat vector", ["#14213d", "#fca311", "#e5e5e5", "#2a9d8f", "#e76f51"]],
  [/paint|story/i, "Painterly storybook", ["#2b2d42", "#8d99ae", "#edf2f4", "#ef233c", "#d90429"]],
  [/low.?poly/i, "Low-poly 3D", ["#0f1c2e", "#3a6ea5", "#7fb069", "#e6aa68", "#f2e9dc"]],
  [/dark|grit/i, "Dark and gritty", ["#0a0a0a", "#2d2d2d", "#6b0f1a", "#b91c1c", "#d4d4d4"]]
];

const MUSIC_MOODS: Array<[RegExp, string]> = [
  [/calm|atmos/i, "calm"],
  [/tense|urgent/i, "tense"],
  [/fast|energ/i, "action"],
  [/myst/i, "mystery"],
  [/triumph|hero/i, "triumph"]
];

function pick(answers: Answers, key: string, fallback: string): string {
  const value = String(answers[key] || "").trim();
  return value && !/^(use|let gene|pick|choose|match)/i.test(value) ? value : fallback;
}

function scopeTargets(scope: string): { prototype: number; full: number; levels: number } {
  if (/big|multi-hour/i.test(scope)) return { prototype: 15, full: 120, levels: 8 };
  if (/medium|30/i.test(scope)) return { prototype: 10, full: 30, levels: 4 };
  if (/tight|10/i.test(scope)) return { prototype: 10, full: 12, levels: 2 };
  return { prototype: 10, full: 30, levels: 4 };
}

/** Deterministic design document built from the approved interview answers and plan. */
export function buildDesignDoc(project: GeneProject): DesignDoc {
  const answers = project.answers || {};
  const plan = project.plan;
  const isApp = project.kind === "app";
  const idea = project.initialPrompt || plan?.title || project.name || "Untitled project";
  const genre = isApp ? "app" : detectGenre(idea, answers.genre, plan?.summary);
  const artText = [answers.art, answers.look, idea].filter(Boolean).join(" ");
  const palette = PALETTES.find(([pattern]) => pattern.test(artText));
  const mood = (MUSIC_MOODS.find(([pattern]) => pattern.test(String(answers.audio || ""))) || [null, ""])[1] ||
    (genre === "shooter" || genre === "racing" || genre === "runner" || genre === "fighter" ? "action" : genre === "survival" ? "tense" : genre === "puzzle" ? "calm" : "mystery");
  const targets = scopeTargets(String(answers.scope || ""));
  const title = plan?.title || project.name || "Untitled project";
  const heroSubject = isApp ? "product hero illustration" : "player character";
  const assetPlan = isApp
    ? [
        { id: "hero", kind: "background" as const, prompt: "Hero illustration for " + title + ": " + idea.slice(0, 160) },
        { id: "icon", kind: "icon" as const, prompt: "Simple brand mark for " + title }
      ]
    : [
        { id: "logo", kind: "logo" as const, prompt: "Title logo for the game " + title + ", " + (palette?.[1] || "bold") + " style" },
        { id: "hero", kind: "sprite" as const, prompt: heroSubject + " for " + title + ", " + pick(answers, "fantasy", "fitting world") + ", readable silhouette, front/side pose" },
        { id: "enemy", kind: "sprite" as const, prompt: "main enemy or hazard for " + title + " with a distinct silhouette from the player" },
        { id: "pickup", kind: "icon" as const, prompt: "collectible pickup icon for " + title + ", glowing, simple shape" },
        { id: "backdrop", kind: "background" as const, prompt: "layered background scene for " + title + ", " + pick(answers, "fantasy", "fitting world") + ", depth with foreground, midground and sky" }
      ];
  const archetype = isApp ? "general" : detectGameArchetype([idea, answers.genre, answers.fantasy, answers.art, answers.scope].filter(Boolean).join(" "));
  const archetypePlan = ARCHETYPE_PLANS[archetype];
  const milestones = isApp
    ? ["Core layout and navigation", "Primary user flow end to end", "Validation, empty and error states", "Accessibility and responsive polish"]
    : archetypePlan.milestones;
  const risks = isApp
    ? ["Dead controls or fake success states", "Missing validation and error recovery", "Layout breaking at phone width"]
    : archetypePlan.risks;
  return {
    version: 1,
    title,
    pitch: (plan?.summary || idea).slice(0, 400),
    genre,
    audience: pick(answers, "audience", isApp ? "General users" : "Players who like " + genre + " games"),
    platform: pick(answers, "platform", "Desktop and mobile browsers"),
    camera: isApp ? "n/a" : pick(answers, "camera", plan?.engine === "webgl3d" ? "3D" : "2D"),
    controls: pick(answers, "controls", isApp ? "Mouse, touch and keyboard" : "Keyboard, touch, and controller"),
    pillars: isApp
      ? [pick(answers, "goal", "One job done well"), pick(answers, "look", "Clear hierarchy"), "Every control works"]
      : archetypePlan.pillars,
    coreLoop: (plan?.mechanics || []).slice(0, 8),
    content: {
      scope: pick(answers, "scope", "Medium game"),
      levels: isApp ? 0 : targets.levels,
      progression: pick(answers, "content", isApp ? "Complete primary flow" : "A mix chosen for the idea")
    },
    art: {
      style: palette?.[1] || pick(answers, "art", pick(answers, "look", "Distinctive, cohesive style chosen for the concept")),
      palette: palette?.[2] || ["#0e1116", "#2f6fed", "#7bd88f", "#f6c453", "#f4f6f8"]
    },
    audio: { mood, notes: "Use GeneAudio: music.start('" + mood + "'), event SFX, and a settings panel." },
    scope: { prototypeMinutes: targets.prototype, fullMinutes: targets.full },
    milestones,
    risks,
    researchBrief: isApp ? ["Primary user workflow and accessibility", "Responsive interaction patterns", "Data persistence and authorization requirements"] : archetypePlan.research,
    assetPlan,
    createdAt: new Date().toISOString()
  };
}

/** Compact JSON for model context. */
export function formatDesignDoc(doc: DesignDoc | null | undefined): string {
  if (!doc) return "No approved design document yet.";
  const { createdAt: _createdAt, ...rest } = doc;
  return JSON.stringify(rest).slice(0, 3800);
}
