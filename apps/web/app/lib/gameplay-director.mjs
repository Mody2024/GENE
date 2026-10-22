const PROFILES = [
  {
    id: "precision-platformer",
    match: /platformer|side.?scroller|precision jump|metroidvania|jump.?and.?run/i,
    loop: "Move, read the next landing, commit to a jump, recover, and reach a safe checkpoint.",
    pacing: ["Teach safe movement on broad ground", "Introduce one low-risk gap", "Combine a gap with a simple moving or timed hazard only after teaching both", "Offer a breather and checkpoint before the hardest sequence"],
    fairness: ["Use jump buffering and coyote time when movement physics support them", "Calculate safe gap widths from the actual jump impulse, gravity and horizontal speed", "Never place an unseen instant-death hazard directly after a blind landing", "Keep a forgiving first attempt and quick restart"],
    feedback: ["Anticipate jump/landing with readable pose and shadows", "Confirm pickups immediately", "Use brief hit-stop or screen shake only for meaningful impacts", "Make checkpoint and finish states unmistakable"]
  },
  {
    id: "combat-action",
    match: /shooter|combat|action|soulslike|beat.?em.?up|arena|boss|hack.?and.?slash/i,
    loop: "Read a threat, choose positioning or timing, act, receive clear feedback, then exploit a recovery window.",
    pacing: ["Safe encounter that teaches one enemy tell", "Small encounter combining movement and the taught action", "Reward or traversal breather", "Distinct elite/boss pattern with readable phases and a recovery window"],
    fairness: ["Telegraph damaging attacks before impact", "Keep hitboxes consistent with visible attacks", "Prevent enemies spawning inside the player or camera blind spots", "Scale challenge through new combinations before inflated health"],
    feedback: ["Separate hit, block, dodge, damage and defeat signals", "Show invulnerability/cooldown states clearly", "Keep camera shake brief and never hide threats", "Provide immediate retry after failure"]
  },
  {
    id: "exploration-adventure",
    match: /adventure|exploration|open.?world|dungeon|quest|metroidvania|puzzle/i,
    loop: "Notice a landmark or mystery, explore a bounded route, discover a tool/clue, use it, and unlock a meaningful return or next path.",
    pacing: ["Establish a safe landmark and readable goal", "Offer a low-risk discovery", "Use a clue/tool to change the world or unlock a route", "Return with new knowledge and deliver a clear payoff"],
    fairness: ["Keep critical paths distinguishable from optional detours", "Avoid soft locks when an item is missed or used early", "Use consistent interaction affordances", "Give recovery or hint paths after repeated failure"],
    feedback: ["Signal interactable objects consistently", "Make quest state changes visible", "Use landmarks to support navigation", "Summarize meaningful discoveries without interrupting play"]
  },
  {
    id: "survival-management",
    match: /survival|crafting|farming|management|colony|city.?builder|simulation|tycoon/i,
    loop: "Gather or produce, allocate limited resources, respond to pressure, upgrade a system, and see a persistent consequence.",
    pacing: ["Start with a safe, achievable task", "Introduce one resource pressure at a time", "Let the first upgrade solve a visible problem", "Combine resource trade-offs only after the player understands each"],
    fairness: ["Show resource costs before commitment", "Avoid irreversible failure from hidden rules", "Keep critical feedback and shortages readable", "Provide a recoverable path from early mistakes"],
    feedback: ["Show before/after changes for upgrades", "Explain why a transaction or action failed", "Use compact status indicators with clear thresholds", "Persist only validated versioned progress"]
  },
  {
    id: "puzzle-strategy",
    match: /puzzle|strategy|tactics|tower.?defen[cs]e|chess|logic|escape.?room/i,
    loop: "Understand a rule, predict a consequence, act, observe the result, and refine the plan.",
    pacing: ["Teach a single rule in a safe puzzle", "Test the same rule with a different arrangement", "Combine two known rules", "Offer an optional mastery challenge after a clear baseline solution"],
    fairness: ["Avoid solutions that depend on pixel-perfect input unless intended", "Make all required information visible", "Provide undo/restart for experimentation", "Never require random luck to solve a deterministic puzzle"],
    feedback: ["Show what changed after each action", "Distinguish invalid action from valid but suboptimal action", "Make undo and reset state-safe", "Reward insight rather than hidden trial-and-error"]
  },
  {
    id: "racing-runner",
    match: /racing|driving|runner|endless|truck|vehicle|kart/i,
    loop: "Read the upcoming route, steer or change lane, manage speed/risk, collect rewards, and survive to a checkpoint or finish.",
    pacing: ["Begin with a clear lane and one gentle obstacle", "Teach steering/braking or lane switching", "Combine obstacles with wider recovery space", "Raise speed or density gradually with a capped fairness budget"],
    fairness: ["Generate only reachable obstacle patterns", "Keep reaction time proportional to speed", "Ensure the camera reveals the next obstacle before commitment", "Cap acceleration and provide a predictable restart"],
    feedback: ["Use readable drift/speed cues", "Differentiate collision, near miss and pickup feedback", "Keep road boundaries visible", "Make finish and best-score states clear"]
  }
];

function chooseProfile(intent) {
  const text = String(intent || "").slice(0, 12000);
  return PROFILES.find(profile => profile.match.test(text)) || {
    id: "general",
    loop: "Give the player a clear goal, a meaningful action, visible consequence and a reason to continue.",
    pacing: ["Orient the player", "Teach the core mechanic", "Combine known mechanics", "Deliver a satisfying payoff and a clear next step"],
    fairness: ["Keep the opening safe and understandable", "Avoid impossible layouts and hidden rules", "Make failure recoverable", "Ensure the objective is reachable"],
    feedback: ["Confirm meaningful actions", "Show current objective and progress", "Make success and failure distinct", "Keep effects readable"]
  };
}

/** Genre-aware design contract: suggestions for a better game, not evidence of completed implementation or playtesting. */
export function buildGameplayDirector({ intent = "", engine = "canvas2d", platform = "desktop" } = {}) {
  const profile = chooseProfile(intent);
  const mobile = /mobile|android|touch/i.test(String(platform) + " " + String(intent));
  return {
    version: 1,
    profile: profile.id,
    loop: profile.loop,
    pacing: profile.pacing,
    fairness: profile.fairness,
    feedback: profile.feedback,
    priorities: [
      "Define one signature mechanic and express it through the core loop, level layout, rewards, enemy/obstacle patterns and audio/visual feedback; do not replace depth with a checklist of unrelated features.",
      "Design a short, complete vertical slice first: opening, tutorial, meaningful challenge, reward, climax and ending or replay loop.",
      "Use deterministic seeds for procedural layouts and save the seed in debug output so unfair or broken runs can be reproduced.",
      "Separate tuning data from logic: speed, gravity, damage, cooldowns, spawn intervals, reward values and difficulty parameters belong in named config objects.",
      "Use a difficulty curve with safe onboarding, a gentle ramp, varied challenge peaks and recovery beats; do not increase every difficulty variable simultaneously.",
      "Build explicit game states and transitions. Paused/won/lost screens must stop simulation and input that should no longer run; restart must reset timers, enemies, audio, score and temporary effects.",
      "For every core action, connect input -> validated state change -> animation/VFX/audio feedback -> UI/progression update. Remove decorative controls that do nothing.",
      "Keep an accessibility baseline: remappable or clearly documented controls where feasible, readable contrast, adjustable audio, reduced-motion option for intense effects, and forgiving input timing when genre permits.",
      "Make the first 30 seconds immediately understandable without a long wall of text; teach through safe play, short prompts and visible affordances.",
      "Use pooling or bounded collections for repeated particles, projectiles, enemies and pickups. Avoid allocating unbounded objects in the frame loop; clamp delta time after tab suspension.",
      "Design camera and HUD together: reserve safe areas, keep upcoming hazards and goals visible, avoid camera motion that hides collision cues, and support resize/touch layouts.",
      "For mobile, use generous touch targets, avoid precision-only controls unless explicitly requested, limit shader/particle cost and preserve a stable frame budget.",
      "Store versioned progress only when needed; handle corrupted saves safely and provide a reset path.",
      "Do not claim online multiplayer, sophisticated AI, rigged animation, physics destruction, or native export unless a real implementation exists and its acceptance path has evidence."
    ],
    engineGuidance: engine === "webgl3d"
      ? ["Use one world-unit convention and Y-up transforms", "Match colliders to actual object bounds", "Use stable camera follow with wall avoidance when implemented", "Budget meshes, draw calls and lights for the target hardware"]
      : ["Use one world-to-screen transform for drawing, hit-testing and collision", "Separate world coordinates from camera offsets and UI coordinates", "Use swept collision or substeps for fast-moving bodies when needed", "Clamp frame delta after background-tab suspension"],
    platformGuidance: mobile
      ? ["Provide touch controls with clear pressed states", "Keep the active playfield clear of virtual controls", "Use device-safe margins and resize-aware layout", "Offer lower-effects mode if performance is constrained"]
      : ["Provide keyboard controls with a visible controls hint", "Keep mouse/pointer actions accessible where relevant", "Pause or safely resynchronize after tab focus changes"],
    acceptance: [
      "Fresh start reaches playable state without a console-breaking error",
      "A new player can identify the goal and perform the core action promptly",
      "The critical route/objective is reachable with the declared physics and controls",
      "Pause/resume, failure, restart and victory/ending do not leave stale timers or inputs",
      "The game remains usable at a narrow/mobile viewport when that platform is targeted",
      "The last playable checkpoint and current content are not destroyed by a failed repair"
    ]
  };
}

export function formatGameplayDirectorContract(intent = "", engine = "canvas2d", platform = "desktop") {
  const contract = buildGameplayDirector({ intent, engine, platform });
  return [
    "GENE GAMEPLAY DIRECTOR — genre-aware design and implementation guide (not a claim that the game has been tested):",
    "Selected profile: " + contract.profile + ".",
    "Core loop: " + contract.loop,
    "Pacing: " + contract.pacing.join(" -> "),
    "Fairness: " + contract.fairness.join(" "),
    "Game feel and feedback: " + contract.feedback.join(" "),
    "Implementation priorities:",
    ...contract.priorities.map((item, index) => (index + 1) + ". " + item),
    "Engine guidance: " + contract.engineGuidance.join("; "),
    "Platform guidance: " + contract.platformGuidance.join("; "),
    "Acceptance checklist: " + contract.acceptance.map(item => "- " + item).join(" ")
  ].join("\n");
}
