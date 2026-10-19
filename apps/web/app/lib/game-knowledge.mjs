/**
 * GENE brain — structured knowledge about real games and how to build them well.
 *
 * Every entry names real reference games, the core loop, the mechanics and "game feel" that make the genre
 * work, the models/art to use (mapped to the GeneModels kit), and music direction (mapped to GeneAudio moods).
 * `matchGameKnowledge` picks the entries that fit a request; `formatBrain` turns them into a compact block that
 * is injected into chat, plan, build and edit prompts, and `musicStylesFor` feeds the research panel.
 *
 * GeneAudio moods: calm | mystery | tense | action | triumph | sad.
 */

export const GAME_KNOWLEDGE = [
  {
    id: "platformer", title: "Platformer (Mario-style)", pattern: "mario|platformer|platform game|side.?scroll|sonic|celeste|metroidvania|hollow knight|jump and run|run and jump",
    examples: ["Super Mario Bros.", "Celeste", "Sonic the Hedgehog", "Hollow Knight"], engine: "canvas2d",
    loop: "Run right, time jumps over gaps and enemies, collect coins, reach the flag; checkpoints keep failure cheap.",
    mechanics: ["acceleration + friction instead of instant speed", "variable jump height (release to cut the jump)", "coyote time (~0.1s) and jump buffering (~0.1s)", "stomp-on-enemy bounce, hit invulnerability frames", "question blocks / bricks / power-ups, one hazard taught at a time"],
    feel: ["camera leads the player's facing direction", "squash and stretch on jump/land", "dust puff on land, coin pop + sparkle", "short screen shake on hit"],
    models: "GeneModels.drawCharacter (run/jump/fall), drawEnemy (walker/slime/flyer), drawBlock (brick/question/ground), drawCoin, drawGem, drawHeart, drawTree, drawBackdrop with parallax.",
    music: { mood: "action", bpm: 140, scale: "major pentatonic", instruments: "square lead, triangle bass, light noise hi-hat", notes: "bouncy chiptune loop; switch to 'tense' underground, 'triumph' at the flag" },
    sfx: ["jump", "coin", "land", "hit", "powerup", "win", "lose"],
    pitfalls: ["no coyote time makes jumps feel unfair", "camera that hides the next hazard", "teaching nothing before the first gap"]
  },
  {
    id: "runner3d", title: "3D lane runner (Subway-style)", pattern: "subway|temple run|lane runner|3d runner|train runner|metro runner|three.?lane|endless 3d",
    examples: ["Subway Surfers", "Temple Run", "Crossy Road (3D)"], engine: "webgl3d",
    loop: "Auto-run forward, swipe/keys to change lane, jump and slide, collect coins, dodge trains and barriers while speed ramps up.",
    mechanics: ["three discrete lanes with smooth lerp between them", "jump over low obstacles, slide under high ones", "chunk recycling of track segments", "difficulty ramp by speed and obstacle density", "coin lines and power-ups (magnet, jetpack)", "crash ends the run with score + restart"],
    feel: ["chase camera slightly above and behind with FOV kick at speed", "run cycle with swinging arms and leaning body", "coin spin and pickup chime", "near-miss whoosh and lane-change tilt"],
    models: "GeneModels.rig3D.character + bake(run/jump/slide), props3D.train, barrier, coin, crate, tree; lit shader with per-vertex colour; ground plane with lane markings.",
    music: { mood: "action", bpm: 128, scale: "minor pentatonic", instruments: "driving bass, square arpeggio, snare on 2 and 4", notes: "urban energetic loop; raise intensity as speed increases" },
    sfx: ["coin", "jump", "land", "dash", "hit", "lose"],
    pitfalls: ["rendering the scene as a flat 2D HUD", "no object pooling so memory grows", "unfair first obstacle before the player moves"]
  },
  {
    id: "runner2d", title: "2D endless runner / one-button", pattern: "endless runner|2d runner|jetpack|dino|canabalt|flappy|one.?button|tap to jump|auto.?runner",
    examples: ["Chrome Dino", "Jetpack Joyride", "Flappy Bird", "Canabalt"], engine: "canvas2d",
    loop: "Auto-scroll; one input (jump/flap/fly) threads the player through obstacles; score = distance.",
    mechanics: ["single input with generous buffering", "procedurally generated obstacle patterns with guaranteed solvable gaps", "speed ramp capped at a fair maximum", "instant restart"],
    feel: ["parallax layers at different speeds", "particle trail", "tiny screen shake on death", "best-score flash"],
    models: "GeneModels.drawCharacter (run/jump/slide), drawCar/drawShip/drawEnemy for obstacles, drawCoin, drawBackdrop.",
    music: { mood: "action", bpm: 132, scale: "minor pentatonic", instruments: "square lead, pulse bass, simple drums", notes: "short looping hook; stop on death, restart on retry" },
    sfx: ["jump", "coin", "hit", "lose"], pitfalls: ["impossible gaps", "slow restart", "speed that never plateaus"]
  },
  {
    id: "rhythm", title: "Rhythm / precision auto-runner", pattern: "geometry dash|rhythm|beat.?sync|music.?platform|beat saber|guitar hero|osu",
    examples: ["Geometry Dash", "Guitar Hero", "osu!", "Beat Saber"], engine: "canvas2d",
    loop: "Obstacles/notes arrive on a song clock; the player acts on the beat; accuracy and combo drive score.",
    mechanics: ["one authoritative audio clock for spawns and judgement", "hit windows (perfect/good/miss) as data", "combo multiplier, practice checkpoints", "chart stored as timestamped events"],
    feel: ["pulse the background on the beat", "judgement text popups", "short flash on perfect hits"],
    models: "Procedural shapes + GeneModels.drawBackdrop; drawGem for notes.",
    music: { mood: "action", bpm: 140, scale: "minor", instruments: "four-on-the-floor kick, synth bass, arpeggiated lead", notes: "the music IS the level: schedule events from the audio clock, not frames" },
    sfx: ["select", "hit", "pickup", "lose", "win"], pitfalls: ["timing from frame count", "no calibration offset", "unreadable upcoming hazards"]
  },
  {
    id: "topdown", title: "Top-down adventure (Zelda-style)", pattern: "zelda|top.?down|adventure|dungeon crawler|rpg|action rpg|stardew|pokemon|overworld",
    examples: ["The Legend of Zelda", "Stardew Valley", "Pokémon", "Link's Awakening"], engine: "canvas2d",
    loop: "Explore rooms, fight or avoid enemies, find keys/items, unlock new areas, beat a boss.",
    mechanics: ["tile or room grid with collision", "8-direction movement with sword/attack arc", "keys, doors, switches, pickups", "enemy AI states (patrol, chase, retreat)", "health hearts and a boss with a readable pattern"],
    feel: ["knockback and hit-stop on attacks", "item pickup jingle", "room transition scroll"],
    models: "GeneModels.drawCharacter (walk), drawEnemy, drawHeart, drawGem, drawTree, drawBlock; tile ground drawn procedurally.",
    music: { mood: "mystery", bpm: 96, scale: "dorian", instruments: "plucked arpeggio, warm pad, soft flute-like lead", notes: "calm exploration theme; 'tense' in dungeons, 'triumph' after the boss" },
    sfx: ["select", "hit", "hurt", "pickup", "powerup", "checkpoint", "win"], pitfalls: ["no clear next goal", "enemies that hit through walls", "soft-locks without keys"]
  },
  {
    id: "arena-shooter", title: "Arena / twin-stick / survivors shooter", pattern: "vampire survivors|survivor|twin.?stick|arena shooter|geometry wars|bullet hell|horde|wave shooter|top.?down shooter",
    examples: ["Vampire Survivors", "Geometry Wars", "Nuclear Throne", "Brotato"], engine: "canvas2d",
    loop: "Survive escalating waves, auto or manual aim, collect XP, pick upgrades that change the build.",
    mechanics: ["wave director that ramps count and variety", "XP gems with magnet radius", "level-up choice of 3 upgrades", "object pooling for bullets/enemies/particles", "spatial hash for collisions"],
    feel: ["hit flash and knockback", "damage numbers", "screen shake on big kills", "satisfying XP vacuum sound"],
    models: "GeneModels.drawCharacter, drawEnemy (walker/slime/flyer), drawGem for XP, drawHeart; additive particles.",
    music: { mood: "tense", bpm: 150, scale: "phrygian", instruments: "distorted-style saw bass, fast hi-hat, stabbing lead", notes: "intensity rises with the wave number" },
    sfx: ["shoot", "hit", "pickup", "powerup", "explosion", "lose"], pitfalls: ["unbounded entity counts", "upgrades that do nothing visible", "no invulnerability after damage"]
  },
  {
    id: "space-shooter", title: "Space shooter (Galaga-style)", pattern: "space invaders|galaga|space shooter|shmup|asteroids|1942|r-type|spaceship",
    examples: ["Space Invaders", "Galaga", "Asteroids", "R-Type"], engine: "canvas2d",
    loop: "Move and shoot waves of enemies in formation, dodge bullets, grab power-ups, defeat a boss.",
    mechanics: ["formation waves with dive attacks", "power-up tiers for the main weapon", "lives and bombs", "scrolling starfield", "boss with phases"],
    feel: ["muzzle flash and recoil", "explosion particles", "starfield parallax", "score popups"],
    models: "GeneModels.drawShip (player/enemies, flip for enemies), drawGem, drawHeart, drawBackdrop('night').",
    music: { mood: "action", bpm: 138, scale: "minor", instruments: "square arpeggio, saw bass, snare rolls", notes: "retro arcade synth; boss gets 'tense'" },
    sfx: ["shoot", "hit", "explosion", "powerup", "warning", "lose"], pitfalls: ["bullets you cannot see", "no invulnerability on respawn"]
  },
  {
    id: "snake-pacman", title: "Classic arcade (Snake / Pac-Man)", pattern: "snake|pac.?man|maze|arcade classic|dot eater|nokia",
    examples: ["Snake", "Pac-Man", "Dig Dug"], engine: "canvas2d",
    loop: "Move on a grid collecting pellets while avoiding hazards/ghosts; clearing the board advances the level.",
    mechanics: ["grid movement with buffered turns", "ghost AI with distinct personalities (chase/ambush/random)", "power pellet reversal", "level speed ramp", "wrap-around tunnels"],
    feel: ["chomp animation", "ghost blink when vulnerable", "level-clear flash"],
    models: "Procedural shapes; GeneModels.drawEnemy for ghosts, drawGem/drawCoin for pellets.",
    music: { mood: "tense", bpm: 120, scale: "chromatic", instruments: "square wave siren, pulse bass", notes: "short repeating siren loop that speeds up" },
    sfx: ["pickup", "powerup", "hit", "lose", "win"], pitfalls: ["instant-turn input dropping", "ghosts that trap the player"]
  },
  {
    id: "breakout-pong", title: "Paddle games (Breakout / Pong)", pattern: "breakout|arkanoid|pong|paddle|brick breaker",
    examples: ["Breakout", "Arkanoid", "Pong"], engine: "canvas2d",
    loop: "Bounce a ball off a paddle to clear bricks or beat an opponent; power-ups modify the ball.",
    mechanics: ["angle depends on where the ball hits the paddle", "fixed-timestep physics to avoid tunnelling", "brick types with hit points", "power-ups (multi-ball, wide paddle)", "lives"],
    feel: ["ball trail", "brick shatter particles", "paddle squash on hit", "rising pitch on combo"],
    models: "Procedural shapes; GeneModels.drawBlock for bricks, drawGem for power-ups.",
    music: { mood: "action", bpm: 124, scale: "major", instruments: "square lead, pulse bass", notes: "light arcade loop" },
    sfx: ["hit", "pickup", "powerup", "lose", "win"], pitfalls: ["ball tunnelling through bricks", "stuck horizontal ball"]
  },
  {
    id: "match3", title: "Match-3 puzzle", pattern: "match.?3|candy crush|bejeweled|match three|gem swap|tile match",
    examples: ["Candy Crush Saga", "Bejeweled", "Puzzle Quest"], engine: "canvas2d",
    loop: "Swap adjacent tiles to match 3+, cascades refill the board, reach the target score within limited moves.",
    mechanics: ["swap validation (only if it creates a match)", "cascade resolution loop with gravity and refill", "special tiles from 4/5 matches", "move counter and goals", "reshuffle when no moves exist"],
    feel: ["tile swap tween", "pop particles with rising pitch per cascade", "screen flash on big combos"],
    models: "GeneModels.drawGem in many colours, drawHeart, drawCoin; animated tweens.",
    music: { mood: "calm", bpm: 100, scale: "major", instruments: "soft marimba, warm pad, light shaker", notes: "relaxed loop with sparkly chimes on matches" },
    sfx: ["select", "pickup", "powerup", "win", "error"], pitfalls: ["starting boards that already contain matches", "no valid move detection"]
  },
  {
    id: "block-puzzle", title: "Block puzzle (Tetris / 2048)", pattern: "tetris|2048|block puzzle|falling blocks|sokoban|sliding puzzle|puzzle game",
    examples: ["Tetris", "2048", "Sokoban"], engine: "canvas2d",
    loop: "Place or merge pieces to clear lines/reach a target; speed or board pressure increases.",
    mechanics: ["7-bag randomizer", "rotation with wall kicks", "line clear and gravity", "ghost piece and hold", "level speed curve", "undo for puzzle variants"],
    feel: ["line-clear flash and shake", "soft-drop vs hard-drop sounds", "combo text"],
    models: "GeneModels.drawBlock for tiles; procedural bevelled cells.",
    music: { mood: "calm", bpm: 130, scale: "minor", instruments: "folk-style lead, steady bass", notes: "classic looping theme that gets faster with level" },
    sfx: ["select", "land", "powerup", "lose", "win"], pitfalls: ["unfair piece randomness", "no hold or preview"]
  },
  {
    id: "tower-defense", title: "Tower defense", pattern: "tower defense|td game|bloons|plants vs zombies|defend the base|lane defense",
    examples: ["Bloons TD", "Plants vs. Zombies", "Kingdom Rush"], engine: "canvas2d",
    loop: "Place and upgrade towers along a path to stop waves; earn gold from kills to scale defence.",
    mechanics: ["waypoint pathing", "tower types with range/damage/rate", "wave scripting with rest periods", "gold economy and upgrade tiers", "targeting modes"],
    feel: ["projectile trails", "range preview on placement", "enemy health bars", "wave-incoming banner"],
    models: "GeneModels.drawEnemy for creeps, drawBlock/drawTree for terrain, drawGem/drawCoin for gold.",
    music: { mood: "tense", bpm: 110, scale: "minor", instruments: "marching snare, low strings pad, brass stabs", notes: "calm build phase, tense during waves" },
    sfx: ["select", "confirm", "shoot", "hit", "explosion", "lose", "win"], pitfalls: ["unbalanced early economy", "towers with no visible range"]
  },
  {
    id: "racing", title: "Racing (OutRun / kart)", pattern: "racing|race car|outrun|mario kart|kart|drift|driving game|top gear",
    examples: ["OutRun", "Mario Kart", "Need for Speed"], engine: "webgl3d",
    loop: "Steer around a track at speed, manage drift/boost, beat the clock or AI opponents across laps.",
    mechanics: ["steering with speed-dependent turn rate", "drift and boost meter", "checkpoints and lap counting", "rubber-banding AI", "off-track slowdown"],
    feel: ["camera shake and FOV widening at speed", "tyre smoke", "engine pitch with speed", "countdown start"],
    models: "GeneModels.props3D.car (colour per racer), tree, crate/barrier for track props; drawCar for a 2D version.",
    music: { mood: "action", bpm: 150, scale: "minor", instruments: "driving synth bass, sawtooth lead, fast hats", notes: "high-energy loop; triumph on podium" },
    sfx: ["start", "dash", "hit", "checkpoint", "win", "lose"], pitfalls: ["floaty steering", "no off-track feedback"]
  },
  {
    id: "fighting", title: "Fighting game", pattern: "fighting game|street fighter|smash|mortal kombat|brawler|beat em up|beat 'em up",
    examples: ["Street Fighter II", "Super Smash Bros.", "Streets of Rage"], engine: "canvas2d",
    loop: "Two fighters trade attacks with spacing and timing; deplete the opponent's health within the round timer.",
    mechanics: ["frame-based attack states (startup/active/recovery)", "hitboxes vs hurtboxes", "block and combo chaining", "round timer and best-of-3", "simple CPU opponent"],
    feel: ["hit-stop on contact", "screen shake on heavy hits", "damage flash"],
    models: "GeneModels.drawCharacter for both fighters (different style palettes), drawHeart for health, drawBackdrop.",
    music: { mood: "action", bpm: 145, scale: "minor", instruments: "electric-style lead, heavy kick, brass hits", notes: "round start sting, intensity spike at low health" },
    sfx: ["hit", "hurt", "dash", "win", "lose", "start"], pitfalls: ["attacks with no recovery", "hitbox larger than the sprite"]
  },
  {
    id: "roguelike", title: "Roguelike dungeon", pattern: "roguelike|rogue.?lite|dungeon|binding of isaac|dead cells|procedural dungeon|permadeath",
    examples: ["The Binding of Isaac", "Dead Cells", "Hades", "Spelunky"], engine: "canvas2d",
    loop: "Clear procedurally generated rooms, pick up items that combine, die, restart stronger or smarter.",
    mechanics: ["seeded room generation with guaranteed connectivity", "item synergies", "enemy variety per floor", "boss each floor", "meta-progression between runs"],
    feel: ["room-clear chime and door unlock", "item pedestal glow", "hit flash"],
    models: "GeneModels.drawCharacter, drawEnemy, drawHeart, drawGem, drawBlock for walls.",
    music: { mood: "mystery", bpm: 100, scale: "phrygian", instruments: "dark pad, plucked bass, sparse percussion", notes: "ambient exploration, 'action' when a fight starts" },
    sfx: ["select", "hit", "hurt", "pickup", "powerup", "explosion", "lose"], pitfalls: ["disconnected rooms", "items with no visible effect"]
  },
  {
    id: "quiz", title: "Quiz show / trivia (Millionaire-style)", pattern: "quiz|trivia|millionaire|who wants|question and answer|general knowledge|kahoot|من سيربح|المليون|مسابقة",
    examples: ["Who Wants to Be a Millionaire?", "Kahoot!", "Jeopardy!", "QuizUp"], engine: "webapp",
    loop: "Answer escalating multiple-choice questions for a growing prize; lifelines rescue hard questions; a wrong answer ends or drops the run.",
    mechanics: ["question bank as data with category and difficulty", "prize ladder with safe checkpoints", "lifelines (50:50, audience poll, phone a friend) usable once", "answer lock-in with suspense delay then reveal", "timer per question optional", "RTL support for Arabic"],
    feel: ["dramatic pause before reveal", "correct = green sweep and chime, wrong = red shake", "prize ladder highlighting current step", "spotlight-style background glow"],
    models: "DOM/CSS UI; GeneModels.drawBackdrop optional; use gradients, glows and a spotlight; coins via drawCoin.",
    music: { mood: "tense", bpm: 80, scale: "minor with suspended pad", instruments: "low drone pad, slow pulse, rising string swell", notes: "tension bed while thinking, 'triumph' sting on correct, 'sad' on wrong" },
    sfx: ["select", "confirm", "win", "lose", "warning"], pitfalls: ["questions with several right answers", "text overflow in Arabic/RTL layouts", "lifelines that can be used repeatedly"]
  },
  {
    id: "card", title: "Card game", pattern: "card game|solitaire|poker|blackjack|uno|deck builder|slay the spire|hearthstone",
    examples: ["Solitaire", "Blackjack", "Uno", "Slay the Spire"], engine: "canvas2d",
    loop: "Draw, play and combine cards under rules to beat the dealer, an opponent or a board.",
    mechanics: ["deck as data with shuffle (Fisher-Yates)", "turn state machine", "drag or click to play", "rule validation with clear illegal-move feedback", "score or health tracking"],
    feel: ["card flip animation", "deal slide with stagger", "chip/score tick-up"],
    models: "Procedural card faces drawn on canvas; GeneModels.drawHeart/drawGem for suits and tokens.",
    music: { mood: "calm", bpm: 90, scale: "major", instruments: "soft piano, brushed percussion, warm pad", notes: "lounge style; short win/lose stings" },
    sfx: ["select", "confirm", "pickup", "win", "lose"], pitfalls: ["biased shuffle", "no undo of misclicks"]
  },
  {
    id: "idle", title: "Idle / clicker", pattern: "idle game|clicker|incremental|cookie clicker|tycoon|adventure capitalist",
    examples: ["Cookie Clicker", "Adventure Capitalist", "Universal Paperclips"], engine: "webapp",
    loop: "Click to earn, buy generators and upgrades that earn automatically, prestige to scale further.",
    mechanics: ["exponential cost curve per generator", "offline progress on load", "big-number formatting", "milestones and achievements", "prestige reset with permanent bonus", "autosave"],
    feel: ["floating +N numbers", "button press squash", "unlock reveal animation"],
    models: "DOM/CSS UI; GeneModels.drawCoin/drawGem for currency icons.",
    music: { mood: "calm", bpm: 92, scale: "major pentatonic", instruments: "mellow keys, soft bass, light chimes", notes: "relaxed loop that never gets annoying" },
    sfx: ["select", "coin", "powerup", "win"], pitfalls: ["number overflow", "no save"]
  },
  {
    id: "physics-puzzle", title: "Physics puzzle (Angry Birds-style)", pattern: "angry birds|physics puzzle|cut the rope|slingshot|projectile|catapult|bridge builder",
    examples: ["Angry Birds", "Cut the Rope", "World of Goo"], engine: "canvas2d",
    loop: "Aim and launch a limited number of objects to topple structures or reach a goal; stars for efficiency.",
    mechanics: ["slingshot drag with trajectory preview", "fixed-timestep rigid bodies with simple impulses", "destructible blocks with hit points", "star rating by shots used", "level data as JSON"],
    feel: ["camera follows the projectile", "debris particles", "satisfying collapse sounds"],
    models: "GeneModels.drawEnemy (targets), drawBlock (structures), drawBackdrop, drawGem.",
    music: { mood: "calm", bpm: 110, scale: "major", instruments: "ukulele-style pluck, soft bass, hand percussion", notes: "playful loop; triumph on level clear" },
    sfx: ["shoot", "hit", "explosion", "win", "lose"], pitfalls: ["unstable physics", "levels that cannot be solved"]
  },
  {
    id: "crossy", title: "Cross the road (Frogger / Crossy Road)", pattern: "crossy road|frogger|cross the road|hop|lane hopper",
    examples: ["Frogger", "Crossy Road"], engine: "webgl3d",
    loop: "Hop forward across lanes of traffic and rivers without being hit; score = distance; endless generation.",
    mechanics: ["discrete grid hops with input buffering", "lanes with different hazards and speeds", "log/platform riding", "chunk generation ahead, deletion behind", "eagle or timeout if you stall"],
    feel: ["hop squash and stretch", "camera glides forward", "car whoosh"],
    models: "GeneModels.props3D.car/tree/crate, rig3D.character with jump pose; or drawCar/drawTree in 2D.",
    music: { mood: "action", bpm: 120, scale: "major", instruments: "quirky pizzicato, bouncy bass", notes: "light playful loop" },
    sfx: ["jump", "hit", "lose", "coin"], pitfalls: ["unavoidable traffic patterns", "no restart"]
  },
  {
    id: "sandbox", title: "Voxel sandbox (Minecraft-style)", pattern: "minecraft|voxel|block.?world|block.?craft|sandbox|crafting game",
    examples: ["Minecraft", "Terraria", "Roblox"], engine: "webgl3d",
    loop: "Explore a block world, mine resources, craft tools, build structures, survive the night.",
    mechanics: ["chunked world with seeded noise terrain", "mesh only visible faces per chunk", "raycast block break/place", "inventory and recipes as data", "day-night cycle and simple mobs"],
    feel: ["block crack animation", "footstep sounds by surface", "sunrise colour grade"],
    models: "Cube meshes via GeneModels.mesh.box with per-face shading; props3D.tree; sky gradient.",
    music: { mood: "calm", bpm: 70, scale: "major with open fifths", instruments: "soft piano, ambient pad", notes: "sparse ambient pieces, silence between them" },
    sfx: ["select", "pickup", "land", "hit", "explosion"], pitfalls: ["generating the whole world in one frame", "one object per block"]
  },
  {
    id: "fps3d", title: "3D arena shooter (Doom-style)", pattern: "doom|fps|first.?person|3d shooter|first person shooter|boomer shooter|wolfenstein",
    examples: ["Doom", "Wolfenstein 3D", "Quake"], engine: "webgl3d",
    loop: "Move through corridors/arenas, shoot enemies, find keys and ammo, reach the exit.",
    mechanics: ["mouse-look + WASD with pointer lock", "hitscan or projectile weapons", "enemy AI with line of sight", "pickups and health", "level geometry from a grid map"],
    feel: ["weapon bob and recoil", "muzzle flash light", "enemy pain flinch", "damage vignette"],
    models: "GeneModels.mesh.box/cylinder/sphere for walls, enemies and pickups; props3D.crate/barrier.",
    music: { mood: "tense", bpm: 160, scale: "phrygian", instruments: "distorted saw riffs, double-kick drums", notes: "aggressive loop; ambience in quiet rooms" },
    sfx: ["shoot", "hit", "hurt", "explosion", "pickup", "lose"], pitfalls: ["motion sickness from fixed fov/no sensitivity setting", "enemies that cannot be seen"]
  },
  {
    id: "word", title: "Word game (Wordle-style)", pattern: "wordle|word game|crossword|hangman|spelling|anagram|word puzzle",
    examples: ["Wordle", "Hangman", "Scrabble"], engine: "webapp",
    loop: "Guess or build words under constraints, get colour-coded feedback, win within limited tries.",
    mechanics: ["curated answer list and larger valid-guess list", "per-letter feedback with duplicate-letter rules", "on-screen keyboard state", "daily seed option", "share-result text"],
    feel: ["tile flip reveal with stagger", "shake on invalid word", "streak counter"],
    models: "DOM/CSS tiles; no sprite models needed.",
    music: { mood: "calm", bpm: 80, scale: "major", instruments: "soft piano and pad", notes: "very quiet optional ambience with mute prominent" },
    sfx: ["select", "error", "win", "lose"], pitfalls: ["wrong duplicate-letter feedback", "dictionary too small"]
  },
  {
    id: "memory", title: "Memory / matching pairs", pattern: "memory game|matching pairs|concentration|pairs game|card matching",
    examples: ["Memory", "Concentration"], engine: "canvas2d",
    loop: "Flip two cards at a time to find pairs in as few moves/time as possible.",
    mechanics: ["shuffled pair grid", "lock input while two cards are shown", "move and time counters", "difficulty by grid size"],
    feel: ["3D-style flip", "match glow", "mismatch shake"],
    models: "Procedural card faces; GeneModels.drawGem/drawHeart/drawCoin/drawTree as symbols.",
    music: { mood: "calm", bpm: 96, scale: "major pentatonic", instruments: "music-box, soft pad", notes: "gentle loop" },
    sfx: ["select", "pickup", "error", "win"], pitfalls: ["clicking a third card mid-flip", "an odd number of cards so one can never be matched"]
  },
  {
    id: "farming-sim", title: "Farming / life sim", pattern: "farming|farm sim|stardew|harvest|animal crossing|life sim|garden",
    examples: ["Stardew Valley", "Harvest Moon", "Animal Crossing"], engine: "canvas2d",
    loop: "Plant, water, harvest and sell crops on a day cycle; reinvest in tools, land and relationships.",
    mechanics: ["day clock with energy", "crop growth stages as data", "inventory and shop", "tool use on tiles", "save/load"],
    feel: ["soft day-night tint", "growth pop animation", "coin jingle on sale"],
    models: "GeneModels.drawCharacter (walk), drawTree, drawCoin, drawHeart, drawBlock for tiles.",
    music: { mood: "calm", bpm: 88, scale: "major", instruments: "acoustic guitar-style pluck, flute-like lead, soft shaker", notes: "pastoral loop; changes by season/time of day" },
    sfx: ["select", "confirm", "pickup", "coin", "powerup"], pitfalls: ["grind with no goals", "no save"]
  },
  {
    id: "sports", title: "Sports / penalty / arcade sports", pattern: "football|soccer|basketball|penalty|golf|bowling|sports game|tennis",
    examples: ["FIFA (arcade modes)", "Basketball Stars", "Mini Golf"], engine: "canvas2d",
    loop: "Aim and time a shot or play against an opponent for points within a time limit.",
    mechanics: ["aim + power meter or drag-and-release", "ball physics with bounce and friction", "goalkeeper/opponent AI", "score and rounds", "replay of the last shot"],
    feel: ["crowd cheer swell on goals", "ball trail", "slow-mo on near misses"],
    models: "GeneModels.drawCharacter (run/jump) for players, drawBackdrop('day'), procedural ball/goal.",
    music: { mood: "action", bpm: 118, scale: "major", instruments: "stadium-style brass, handclap rhythm, bass", notes: "energetic anthem; short win/lose stings" },
    sfx: ["shoot", "hit", "win", "lose", "start"], pitfalls: ["power meters that are too fast to read", "an opponent that never misses or never scores"]
  }
];

/** Always-true facts about what GENE itself can do, so chat answers match reality. */
export const GENE_CAPABILITIES = [
  "GENE builds playable browser games (Canvas 2D, WebGL 3D) and web apps as real project files, then validates and previews them.",
  "Every runtime has GeneAudio (procedural music in 6 moods, 20+ sound effects, volume/mute settings) and GeneModels (animated 2D characters, enemies, coins, gems, hearts, blocks, trees, ships, cars, backdrops; a rigged 3D character with run/jump/slide poses; 3D train, barrier, car, ship, tree, coin and crate props; box/cylinder/sphere mesh builders).",
  "GENE can attach research to a message: real Wikipedia facts and images, Wikimedia Commons images and audio, CC0 Poly Haven 3D models, and music-style references. Research text and images are sent to the model as reference material.",
  "GENE edits existing files in place and reports exactly which files changed and by how many lines; failed validations are repaired automatically where possible."
];

function scoreEntry(entry, text, words) {
  let score = 0;
  try { if (new RegExp(entry.pattern, "i").test(text)) score += 10; } catch { /* ignore bad pattern */ }
  for (const example of entry.examples) if (text.includes(example.toLowerCase())) score += 6;
  for (const word of words) {
    if (word.length < 4) continue;
    if (entry.title.toLowerCase().includes(word)) score += 2;
    if (entry.loop.toLowerCase().includes(word)) score += 1;
  }
  return score;
}

/** Best-matching knowledge entries for free text (the user's request, plan title, etc). */
export function matchGameKnowledge(text, limit = 3) {
  const source = String(text || "").toLowerCase();
  if (!source.trim()) return [];
  const words = Array.from(new Set(source.split(/[^\p{L}\p{N}]+/u).filter(word => word.length > 3))).slice(0, 40);
  return GAME_KNOWLEDGE
    .map(entry => ({ entry, score: scoreEntry(entry, source, words) }))
    .filter(item => item.score >= 6)
    .sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title))
    .slice(0, Math.max(1, limit))
    .map(item => item.entry);
}

/** Music styles for the research panel: genre-specific direction mapped to GeneAudio moods. */
export function musicStylesFor(text, limit = 3) {
  return matchGameKnowledge(text, limit).map(entry => ({
    genre: entry.title,
    mood: entry.music.mood,
    bpm: entry.music.bpm,
    scale: entry.music.scale,
    instruments: entry.music.instruments,
    notes: entry.music.notes,
    sfx: entry.sfx,
    source: "GENE music knowledge",
    reference: entry.examples.slice(0, 2).join(", ")
  }));
}

function formatEntry(entry) {
  return [
    "• " + entry.title + " — references: " + entry.examples.join(", ") + ". Suggested engine: " + entry.engine + ".",
    "  Core loop: " + entry.loop,
    "  Must-have mechanics: " + entry.mechanics.join("; ") + ".",
    "  Game feel: " + entry.feel.join("; ") + ".",
    "  Models/art: " + entry.models,
    "  Music: GeneAudio mood '" + entry.music.mood + "' (~" + entry.music.bpm + " BPM, " + entry.music.scale + "; " + entry.music.instruments + "). " + entry.music.notes + ". SFX: " + entry.sfx.join(", ") + ".",
    "  Avoid: " + entry.pitfalls.join("; ") + "."
  ].join("\n");
}

/** Compact block injected into every GENE prompt (chat, plan, build, edit). */
export function formatBrain(text, options = {}) {
  const limit = options.limit || 2;
  const matches = matchGameKnowledge(text, limit);
  const lines = ["GENE BRAIN — what GENE is and what it knows:", ...GENE_CAPABILITIES.map(item => "- " + item)];
  if (matches.length) {
    lines.push("GAME KNOWLEDGE matched to this request (use as expert guidance, adapt it to the user's idea, never copy a commercial game's assets, names or code):");
    for (const entry of matches) lines.push(formatEntry(entry));
  } else {
    lines.push("No specific genre matched yet; if the user names a game or genre, reason from how that real game plays (core loop, feel, models, music) before answering.");
  }
  return lines.join("\n").slice(0, options.maxChars || 5200);
}
