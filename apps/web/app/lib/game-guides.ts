export type GameGuide = {
  id: string;
  title: string;
  engine: "canvas2d" | "webgl3d";
  implementation: string[];
  acceptance: string[];
  performance: { targetFps: number; maxEnemies: number; maxObjects: number; maxParticles: number };
};

const GUIDES: Record<string, GameGuide> = {
  platformer2d: {
    id: "platformer2d",
    title: "2D Platformer",
    engine: "canvas2d",
    implementation: [
      "Use a world coordinate system and camera follow, not a single static screen.",
      "Implement horizontal acceleration/friction, gravity, ground/platform collision, coyote time and jump buffering.",
      "Allow variable jump height by cutting upward velocity when the jump button is released.",
      "Include at least one distinct level layout, platforms at multiple heights, solid terrain, collectibles, a hazard/enemy, and a visible finish/checkpoint.",
      "Show readable hit feedback and restart after loss; avoid tiny player/collision shapes."
    ],
    acceptance: [
      "Right/left movement changes player world position.",
      "Jump rises then gravity returns player to a platform without falling through it.",
      "Platform collision prevents falling through the floor.",
      "Collectible increments score once and disappears.",
      "A hazard causes a visible loss or damage state; restart restores a playable state.",
      "The finish condition is reachable and produces an explicit win state."
    ],
    performance: { targetFps: 60, maxEnemies: 8, maxObjects: 220, maxParticles: 50 }
  },
  rhythm2d: {
    id: "rhythm2d",
    title: "Rhythm / Precision Runner",
    engine: "canvas2d",
    implementation: [
      "Use deterministic horizontal auto-scroll with obstacle placements on a visible rhythm grid.",
      "Use jump buffering and a stable collision box; obstacles must align with the ground and scrolling coordinate system.",
      "Make death immediate and restart fast. Keep the next obstacle visible before the player reaches it.",
      "Use a strong color palette, parallax layers, landing/impact effects and level progression without requiring audio to play correctly."
    ],
    acceptance: [
      "World scroll speed is stable using delta time.",
      "Space/click jumps and the player lands correctly.",
      "Touching a spike/hazard causes loss once, not repeated state flicker.",
      "Restart resets scroll, player and obstacles.",
      "The level has a reachable finish marker and win state."
    ],
    performance: { targetFps: 60, maxEnemies: 0, maxObjects: 180, maxParticles: 35 }
  },
  runner2d: {
    id: "runner2d",
    title: "2D Endless Runner",
    engine: "canvas2d",
    implementation: [
      "Keep player position and obstacles in world coordinates; recycle off-screen obstacles rather than growing the entity list forever.",
      "Implement jump, obstacles, collectible pickups, score/speed progression and game over/restart.",
      "At least three distinct obstacle silhouettes and two parallax environment layers are required."
    ],
    acceptance: [
      "Jump changes vertical state and resolves landing.",
      "Obstacle collision ends the run or reduces health visibly.",
      "Pickup collection increments score exactly once.",
      "Old offscreen entities are recycled/removed and object count remains bounded.",
      "Restart restores initial speed, score and obstacles."
    ],
    performance: { targetFps: 60, maxEnemies: 4, maxObjects: 140, maxParticles: 30 }
  },
  topdown: {
    id: "topdown",
    title: "Top-down Action",
    engine: "canvas2d",
    implementation: [
      "Implement movement in two axes with normalized diagonal speed and world-space collision.",
      "Create distinct enemy behavior, player health/damage, attack/projectile behavior, pickups and a wave/objective system.",
      "Use a camera/world layout large enough to move, not just a single HUD panel."
    ],
    acceptance: [
      "WASD/arrows move the player in four directions with no diagonal speed boost.",
      "Attack input causes a visible hit/projectile and enemies react or disappear when defeated.",
      "Enemy contact/projectiles affect player health.",
      "Pickups or objectives change persistent in-run state.",
      "Win, loss and restart work."
    ],
    performance: { targetFps: 60, maxEnemies: 14, maxObjects: 260, maxParticles: 60 }
  },
  towerDefense: {
    id: "towerDefense",
    title: "Tower Defense",
    engine: "canvas2d",
    implementation: [
      "Define an explicit path with waypoints; enemies must move along the path toward a base.",
      "Allow placing at least one turret, selecting targets by distance, firing projectiles or applying visible damage, and spending/earning currency.",
      "Include wave progression, base health, win/loss and restart."
    ],
    acceptance: [
      "Enemies reach the base unless killed.",
      "Turret attacks the nearest valid enemy within range.",
      "Currency changes when placing a turret and defeating an enemy.",
      "Wave increases after the current wave is cleared.",
      "Base health reaching zero loses; surviving the defined final wave wins."
    ],
    performance: { targetFps: 60, maxEnemies: 30, maxObjects: 360, maxParticles: 45 }
  },
  runner3d: {
    id: "runner3d",
    title: "3D Lane Runner",
    engine: "webgl3d",
    implementation: [
      "Use an actual WebGL renderer: compile vertex/fragment shaders, link a program, upload vertex/index buffers, set projection/view/model transforms, and call drawArrays or drawElements every frame.",
      "Render real perspective geometry with a ground plane, three lanes, a chase camera, environment structures, a visible runner, obstacles and coins. Do not draw the whole scene as a 2D HUD.",
      "Implement left/right lane switching, jump, slide, forward world movement, collision, coins, score, increasing difficulty and game-over/restart.",
      "Use chunk recycling/object pooling for the endless track and environment; keep meshes/objects within the budget.",
      "Use shaded colors/material-like variation and a distinct environment silhouette (e.g. rail yard, metro tunnel, elevated city) with depth cues."
    ],
    acceptance: [
      "The JavaScript requests a WebGL context and compiles/links valid shaders.",
      "The frame loop submits real geometry draw calls after clearing the buffer.",
      "The runner visibly moves/animates in perspective and the camera follows it.",
      "Left/right moves between three lanes, jump rises/lands, and slide changes the collision/visual pose.",
      "Obstacle collision ends the run; coin collection updates score.",
      "Track chunks are recycled so object count stays bounded.",
      "Restart resets lane, speed, score, obstacles and game state."
    ],
    performance: { targetFps: 60, maxEnemies: 0, maxObjects: 160, maxParticles: 24 }
  },
  arena3d: {
    id: "arena3d",
    title: "3D Arena / Adventure",
    engine: "webgl3d",
    implementation: [
      "Use actual WebGL shader compilation, GPU buffers, projection/view/model transforms, and repeated geometry draw calls; no flat 2D-only fallback for the requested 3D scene.",
      "Render a ground plane and a camera perspective with a visible player mesh, multiple environment structures, pickups and enemies.",
      "Implement movement, world-space enemy approach, melee/projectile attack, health, pickup/objective, win/loss/restart.",
      "Keep shadow/effect costs low; prioritize clear silhouettes, materials and camera framing over excessive geometry."
    ],
    acceptance: [
      "A real WebGL context, linked shader program and non-empty geometry are present.",
      "Player movement changes the rendered world position.",
      "Attack input affects enemy state and player health can change.",
      "Objective/exit produces a clear win; health reaching zero produces loss.",
      "Restart resets all runtime state."
    ],
    performance: { targetFps: 60, maxEnemies: 8, maxObjects: 120, maxParticles: 20 }
  },
  localMultiplayer2d: {
    id: "localMultiplayer2d",
    title: "Local Multiplayer 2D",
    engine: "canvas2d",
    implementation: [
      "Build a genuinely simultaneous local couch-multiplayer game on one machine. Both players must be visible and independently controllable during the same update loop.",
      "Create separate player objects with independent positions, velocities, health/lives, cooldowns, score and input ownership. Never route the same keyboard event to both players.",
      "Default keyboard layout: Player 1 uses WASD with F for action; Player 2 uses arrow keys with Enter or Right Shift for action. Display these bindings in the game UI and avoid browser scrolling while playing.",
      "Poll navigator.getGamepads() once per frame and assign connected controllers by stable gamepad index to a distinct player slot; a controller must not silently take over both players. If no controller is connected, keyboard controls must work fully.",
      "Make the core mechanic support two participants: shared co-op objectives or clear versus scoring. Show distinct player colors/silhouettes, labels, scores and health/lives so the state is readable at a glance.",
      "Choose a camera that keeps both players visible: a shared fixed/zoomed-out arena is preferred for compact games; for larger worlds use a bounded camera that frames both players or a clear split-screen layout.",
      "Handle simultaneous opposing inputs, collision between players where appropriate, player knockouts, round end, pause/resume, rematch and full state reset. Pause must freeze the whole simulation, not just one player.",
      "Provide an accessible start screen that explains the two control sets and lets users choose co-op or versus if both modes fit the requested concept. Keep it playable without a controller or network.",
      "Use delta time, normalized diagonal movement, bounded world/entity counts and deterministic test hooks for player positions, scores, frame count and round state. Do not claim hardware controller testing unless performed."
    ],
    acceptance: [
      "Pressing a Player 1 key changes only Player 1 state; pressing a Player 2 key changes only Player 2 state.",
      "Both players can move during the same frame without one overwriting the other's input or position.",
      "Keyboard controls remain playable when navigator.getGamepads() is empty.",
      "A collectible, attack, goal or round mechanic changes the correct player's score/health and does not award the same event twice.",
      "The screen keeps both players visible, clearly distinguishes them and displays their individual scores/status.",
      "Pause freezes both players and all gameplay timers; resume continues without a jump in delta time.",
      "Restart/rematch restores both players, objectives, scores, cooldowns and round state.",
      "The first render shows the arena and both players rather than a placeholder menu or HUD-only screen."
    ],
    performance: { targetFps: 60, maxEnemies: 8, maxObjects: 180, maxParticles: 40 }
  },
  localMultiplayer3d: {
    id: "localMultiplayer3d",
    title: "Local Multiplayer 3D",
    engine: "webgl3d",
    implementation: [
      "Build a genuinely simultaneous local couch-multiplayer 3D game on one machine using raw WebGL. Render real perspective geometry for both players in the same world; do not use a flat 2D-only scene.",
      "Maintain independent player transforms, velocity, health/lives, cooldowns, score and input ownership. Process both players in one authoritative update loop and resolve their movement/collisions independently.",
      "Default keyboard layout: Player 1 uses WASD with F for action; Player 2 uses arrow keys with Enter or Right Shift for action. Display both layouts in-game and prevent browser scrolling for handled keys.",
      "Poll navigator.getGamepads() once per frame, apply stick dead zones and map each connected controller to a distinct player slot by gamepad index. Keyboard controls must remain fully playable without controllers.",
      "Use a shared arena camera that frames both players for compact arenas; for larger worlds implement split-screen viewports with independent cameras and correct viewport/scissor handling. Never let one player disappear off-camera without a deliberate split-screen design.",
      "Give players visually distinct meshes/materials and readable player-specific score/health indicators. Implement co-op objectives or clear versus scoring, plus feedback for attacks, pickups and collisions.",
      "Handle simultaneous input, player-to-player collision if relevant, knockout/round end, whole-game pause/resume, rematch and complete state reset. Pause all player movement, AI and timers together.",
      "Keep WebGL shaders, geometry, draw calls and world-space collision valid for both players; bound entity counts and provide a visible error if WebGL is unavailable instead of a blank screen.",
      "Add deterministic test hooks for both player transforms, scores, frame count and round state without affecting normal play. Never claim physical controller testing unless actually performed."
    ],
    acceptance: [
      "The game requests a WebGL context, links valid shaders and draws non-empty perspective geometry containing both players.",
      "Pressing a Player 1 key changes only Player 1 state; pressing a Player 2 key changes only Player 2 state.",
      "Both players move simultaneously in the same update loop and remain visible through the chosen camera strategy.",
      "Keyboard play works when navigator.getGamepads() returns no controllers.",
      "The core objective/attack mechanic changes the correct player's score or health without double-awarding events.",
      "Pause freezes both players, enemies and gameplay timers; resume resets frame delta to avoid a movement jump.",
      "Rematch resets both players, objectives, scores, cooldowns and round state.",
      "The first render contains the actual 3D world and both player models, not a HUD-only or 2D placeholder."
    ],
    performance: { targetFps: 60, maxEnemies: 8, maxObjects: 140, maxParticles: 30 }
  },
  default2d: {
    id: "default2d",
    title: "Custom 2D Game",
    engine: "canvas2d",
    implementation: [
      "Build a bespoke game scene around the requested central mechanic, with distinct art direction and visible world elements.",
      "Implement controls, collision/interaction, feedback, objective, win/loss and restart.",
      "Use delta time, bounded entities and no dependency on network resources."
    ],
    acceptance: [
      "Input changes player or game state.",
      "At least one gameplay interaction changes score/health/objectives.",
      "Win and loss states are distinct and restart works.",
      "The initial frame has visible scene details, not only a HUD."
    ],
    performance: { targetFps: 60, maxEnemies: 8, maxObjects: 180, maxParticles: 40 }
  }
};

function is3d(text: string) {
  return /\b(3d|three.?dimensional|webgl|subway|train runner|metro runner|third.?person|first.?person|driving|racing|small horror|3d adventure)\b/i.test(text);
}

export function selectGameGuide(input: {
  message: string;
  initialPrompt?: string;
  planTitle?: string;
  planEngine?: "canvas2d" | "webgl3d";
}): GameGuide {
  const text = [input.message, input.initialPrompt || "", input.planTitle || ""].join("\n").toLowerCase();
  if (/local multiplayer|couch co.?op|same.?screen multiplayer|split.?screen multiplayer|two.?player|2.?player|versus multiplayer|player.?vs.?player|co.?op game/.test(text)) return is3d(text) ? GUIDES.localMultiplayer3d : GUIDES.localMultiplayer2d;
  if (/geometry dash|rhythm game|rhythm runner|precision runner|auto.?runner/.test(text)) return GUIDES.rhythm2d;
  if (/mario|platformer|platform game|side.?scroll/.test(text)) return GUIDES.platformer2d;
  if (/subway|metro|three.?lane|lane runner|endless runner/.test(text) && is3d(text)) return GUIDES.runner3d;
  if (/endless runner|runner/.test(text) && !is3d(text)) return GUIDES.runner2d;
  if (/tower defense|tower defence|td game/.test(text)) return GUIDES.towerDefense;
  if (/top.?down|twin.?stick|shooter|survival arena/.test(text) && !is3d(text)) return GUIDES.topdown;
  if (/arena|horror|third.?person|first.?person|3d adventure|wave survival/.test(text) && is3d(text)) return GUIDES.arena3d;
  if (input.planEngine === "webgl3d" || is3d(text)) return GUIDES.arena3d;
  return GUIDES.default2d;
}

export function formatGameGuide(guide: GameGuide): string {
  return [
    "GUIDE: " + guide.title + " (" + guide.engine + ")",
    "Required implementation rules:",
    ...guide.implementation.map((item, index) => (index + 1) + ". " + item),
    "Acceptance checks to satisfy:",
    ...guide.acceptance.map((item, index) => "- " + item),
    "Performance defaults: " + JSON.stringify(guide.performance),
    "Make the specific requested game's own objects, setting, mechanics and UI. Do not reuse a generic HUD-only game or claim that acceptance checks passed unless the runtime/test system actually measured them."
  ].join("\n");
}
