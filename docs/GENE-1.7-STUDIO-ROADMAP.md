# GENE 1.7 — Studio, Memory, and Asset Intelligence Roadmap

Status: proposal for after GENE 1.6 reliability gates. This document is a plan, not a claim that these capabilities already exist.

## Product direction

GENE 1.6 focuses on dependable project creation, persistent plans, differentiated reasoning modes, bounded context, preview-aware repair, and truthful release validation. GENE 1.7 should make projects easier to grow over weeks, improve 3D asset quality, and support more real workflows without sacrificing reliability or weak-device performance.

## Guiding rule

Only ship a 1.7 feature when its acceptance test is defined and the existing 1.6 reliability suite still passes. Do not use new model names, fancy progress UI, fake build artifacts, or generated screenshots as substitutes for functionality.

## Proposed workstreams

### 1. Durable project memory and plan revisions
- Introduce a versioned plan artifact with stable task IDs, explicit decisions, requirements, acceptance criteria, and dependency edges.
- Show a concise plan diff after a request: added, changed, deferred, and removed tasks.
- Track plan revision separately from source revision and build-run revision.
- Preserve confirmed decisions, user corrections, asset choices, and known limitations across sessions.
- Add import/export for the project manifest and plan, with migration for existing localStorage projects.
- If cloud persistence is introduced, make it opt-in and authenticated; do not send project source to a cloud database without clear user action and privacy boundaries.

Acceptance: reload and resume a project; update one requirement; only dependent tasks change; prior successful source and plan revisions remain recoverable.

### 2. Project graph and dependency-aware edits
- Build a file/module manifest with import/export relationships, entry points, runtime assets, routes, and tests.
- Use that graph to select context and decide which files need changes.
- Apply multi-file changes as a transaction: preflight, patch, validate, commit, or roll back.
- Detect stale edit proposals by file hash and ask for a fresh diff instead of overwriting newer changes.
- Add explicit migration steps when a project changes engine, framework, or data shape.

Acceptance: a targeted edit updates all and only the necessary files, catches stale proposals, and restores the previous version after a failed validation.

### 3. 3D asset pipeline v2
- Add reusable style profiles (stylized low-poly, industrial, cozy, sci-fi, fantasy, realistic-inspired) with coherent scale, palette, silhouette, and material rules.
- Expand procedural mesh primitives into shape-aware asset generators: extrusions, bevels, lathed forms, curve/tube forms, layered surfaces, and controlled vertex variation.
- Add material and texture atlas generation where the renderer supports it, with deterministic fallbacks for weak GPUs.
- Create reusable modular kits and asset variants instead of regenerating every object independently.
- Improve GLTF/GLB and OBJ/MTL import validation, texture path repair, triangle budgets, and missing-material diagnostics.
- Add asset thumbnails and a provenance manifest recording whether each asset is procedural, imported, or user-provided.
- Keep rigging and animation as a separate verified capability; do not imply static mesh geometry is animated.

Acceptance: asset fixtures pass geometry/format checks; materials and paths load; style profiles produce visibly distinct coherent results; model complexity stays within chosen budgets.

### 4. Genre specialist packs and game design intelligence
- Create structured, testable specialist packs for platformer, runner, top-down action, horror, survival, racing, puzzle, RPG, and local co-op.
- Each pack defines the core loop, expected controls, progression, level pacing, camera, AI behaviors, failure cases, and acceptance tests.
- Require a playable vertical slice before expanding content.
- Add level/content variation through data-driven definitions instead of giant monolithic game.js files.
- For local multiplayer, test input independence, player ownership, pause/restart, and split/shared camera behavior.
- Add optional save slots and deterministic seeds where supported.

Acceptance: representative genre fixtures start, respond to controls, reach a win/loss/restart state, and pass project-specific checks.

### 5. Preview telemetry and visual regression
- Tie every screenshot, runtime error, and test report to an exact source revision.
- Record boot time, first frame, console exceptions, failed network/asset loads, and supported interaction traces.
- Add optional screenshot comparison for stable fixtures with tolerant thresholds.
- Separate static analysis, browser smoke tests, interaction tests, and human playtest recommendations in the UI.
- Automatically repair only when the error evidence is sufficiently specific; cap attempts and retain the last known-good preview.

Acceptance: an intentionally broken fixture produces a revision-matched failure report; a repaired revision gets a new report; stale screenshots cannot mark newer code as playable.

### 6. Reliable long-running jobs
- Use server-side durable jobs for long builds, with idempotency keys, progress events, cancellation, checkpoints, retry budgets, and per-stage timeouts.
- Make refresh/reconnect safe: reconnect to the same job rather than starting duplicate generation.
- Separate request acceptance from actual completion and provide a job timeline with stage logs.
- Add resource budgets for provider tokens, file count/size, build duration, asset complexity, and cloud artifacts.
- Keep user edits queued with clear conflict behavior; never silently drop a request.

Acceptance: refresh during a job, retry a transient failure, cancel, and resume without duplicate commits or lost completed work.

### 7. App-builder capabilities
- Add explicit app templates for dashboards, CRUD tools, landing pages, portfolios, internal tools, and data viewers.
- Model each route, form, state transition, validation rule, empty/loading/error state, and persistence boundary.
- Generate API integrations only when credentials and endpoints are configured; otherwise create an honest mock adapter that is visibly marked as mock.
- Add accessible keyboard navigation and responsive layout tests.
- Provide a data adapter boundary so users can later connect a real backend without rewriting UI components.

Acceptance: app fixtures test navigation, form validation, duplicate submissions, persistence behavior, error handling, and responsive layouts.

### 8. Collaboration and portability
- Add portable project manifests and lockfile-aware exports.
- Support safe import of ZIP projects with path traversal protection, file size limits, type allowlists, and dependency review.
- Provide patch/diff export for review and manual application.
- Consider collaboration only after project persistence, identity, access control, conflict resolution, and audit trails are implemented.
- Never expose API keys in ZIP exports, logs, client bundles, or generated source.

Acceptance: exported project can be reopened in its supported target; unsafe ZIP fixtures are rejected; secrets tests find no configured keys in outputs.

### 9. Provider and model routing
- Use a server-side provider registry with capabilities, context limits, output limits, reasoning controls, timeout budgets, and health state.
- Select a model based on the task, user-selected mode, actual configured provider, and available budget.
- Show the actual provider/model and fallback transitions; never silently downgrade Thinking to a weak model while claiming maximum reasoning.
- Test malformed JSON, output truncation, rate limits, network timeout, provider outages, and model-specific unsupported parameters.
- Keep provider branding out of generated products unless the user explicitly requests it, while keeping provider attribution transparent in GENE's own diagnostics.

Acceptance: simulated provider failures result in a clear status and preserve project files; every fallback is recorded and the user-facing status is truthful.

### 10. Release engineering and quality gates
- Add a golden-project suite covering a web app, a 2D game, a 3D game, a local co-op game, a multi-file edit, a truncated model response, and a failing cloud build.
- Require CI to run contract tests, type checks, production build, browser smoke tests, and project fixtures.
- Add a release manifest with commit SHA, deployment URL, test summary, artifact hashes, and target/signing status.
- Treat Vercel deployment, playable preview, source ZIP, Windows installer, and Android APK as separate release targets.
- Do not promote a release if core AI integration, project edits, or preview checks fail.

Acceptance: every release can be traced to a commit and test run; each offered download has a verified checksum and accurate target/signing label.


### 11. Full sound and music system (new priority)

Treat sound as a first-class part of every generated game, app, and interactive experience—not a last-minute collection of random effects. Use a shared audio specification and engine adapters so capabilities are explicit for browser games, Godot, Unity, Unreal, and exported builds.

#### 11.1 Audio planning and sound direction
- Interview for sound style only when it matters: cinematic, cozy, arcade, horror, realistic, minimalist, music-led, or intentionally silent.
- Include a versioned audio brief in the plan: mood, intensity curve, instrument palette, ambience, key sound events, music transitions, voice needs, accessibility needs, target platforms, and asset/licensing constraints.
- Map gameplay events to named sound events and states (boot, menu, hover/select/confirm/back, gameplay, combat, damage, jump/land, pickup, objective, pause, win/lose, loading, save/load, multiplayer join/leave, error).
- Keep a clear distinction between required, optional, placeholder, and intentionally silent cues. Never mark a placeholder as a finished sound asset.

#### 11.2 Audio asset creation and sourcing
- Support imported WAV, MP3, OGG, and supported platform formats with format/duration/size/sample-rate checks and clear transcoding guidance.
- Allow users to upload their own audio and organize it into a searchable asset library with tags, preview, waveform/duration metadata, loop points, variants, and attribution.
- Add procedural sound synthesis for suitable SFX (UI clicks, beeps, impacts, wind, drones, simple steps, sci-fi pulses) using oscillators/noise/envelopes/filters; provide seeded generation so builds are reproducible.
- Add music composition assistance through structured prompts, tempo, meter, mood, instrumentation, loop length, stems, intensity layers, and transition points. If a music-generation provider is not configured, offer honest procedural/midi-like or user-imported alternatives rather than claiming a full produced song exists.
- Support optional voice/dialogue generation only through a configured provider; expose pronunciation, language, emotion, subtitle, and regeneration controls.
- Add batch generation and variation for footsteps, impacts, UI sounds, weapon families, creatures, and ambience, with loudness normalization and duplicate detection.
- Keep every asset's origin, license, attribution, provider, prompt (if applicable), generation date, and allowed-use notes in a manifest. Never scrape copyrighted soundtracks or imitate a named living artist's voice without authorization.
- Never bundle an asset unless it exists, decodes, passes licensing/source policy, and is included in the build manifest.

#### 11.3 Runtime audio engine
- Build a centralized audio service with one managed context/engine per runtime, pooled/reused decoded buffers, asset streaming for long music/dialogue, and cached short SFX.
- Add named buses/groups: Master, Music, Ambience, SFX, UI, Dialogue/Voice, and Accessibility/Assistive cues, with per-bus volume, mute, and optional ducking.
- Support event-based playback, priorities, concurrency caps, voice stealing, cooldowns, random/weighted variants, pitch/volume variation within safe bounds, fades, crossfades, loop regions, stop/replace, pause/resume, and scene teardown cleanup.
- Handle browser autoplay restrictions correctly: initialize or resume audio only after a real user gesture, surface a clear “enable audio” affordance where needed, and recover from suspended/interrupted contexts.
- Prevent sound leaks: stop or detach event listeners and dispose audio nodes on project reset, preview reload, scene change, or hot reload.
- Add fallback behavior when audio is unavailable, blocked, unsupported, or fails to decode; gameplay must not crash or hang because a sound is missing.
- Avoid starting duplicate music or stacking repeated loops when a user restarts a level or reconnects to a preview.
- Offer a reduced-motion/reduced-stimulation option that can also reduce abrupt audio changes, flashing visualizers, and intense sound events.

#### 11.4 Spatial and dynamic sound
- For supported 3D runtimes, support listener position/orientation, distance attenuation, stereo/spatial panning, occlusion/reverb zones where feasible, and moving sources attached to entities.
- Connect camera/player position to the audio listener and expose indoor/outdoor/underwater/room presets where the engine supports them.
- Use priority and distance-based culling/virtualization so distant ambience and many simultaneous emitters do not overload weak devices.
- Provide a 2D fallback and mark unsupported spatial features clearly; never claim full 3D positional audio for a runtime that only pans stereo.

#### 11.5 Adaptive music and game-state transitions
- Allow layered stems or intensity layers (calm/exploration/tension/combat/boss/victory) with synchronized transitions where assets support it.
- Define state transitions and crossfade rules in data rather than hard-coded timers.
- Support dynamic ambience based on time, weather, biome, underwater state, room, or gameplay threat when relevant.
- Add mix ducking so dialogue or critical gameplay cues remain audible over music and ambience.
- Prevent abrupt restart/cut at loop boundaries; validate loop points and transition compatibility.

#### 11.6 Audio settings, accessibility, and UX
- Generate a polished in-game audio settings screen when appropriate: master/music/SFX/ambience/voice sliders, mute toggles, output test, reset-to-default, and persistent preferences.
- Add captions/subtitles for dialogue and optional descriptions for important non-speech audio cues; do not rely on sound alone to communicate critical information.
- Respect keyboard/gamepad navigation, screen readers for settings, mobile touch targets, mute preferences, and platform accessibility controls.
- Include safe default volume, no unexpected autoplay with sound on page load, no excessively loud peak transients, and an easy mute control.
- Support mono compatibility and avoid requiring stereo-only cues for critical gameplay information.

#### 11.7 Authoring, debugging, and editor tools
- Add a Sound panel to the GENE workspace: asset list, audition controls, event map, bus mixer, missing-cue warnings, and per-scene/event assignment.
- Let users ask in chat to add, replace, tune, or remove sound; show a source diff and update only relevant audio assets/config/scripts.
- Add an audio event timeline/inspector with event, source asset, bus, volume, pitch range, loop, spatial setting, priority, and cooldown.
- Add an audio test scene/preview with mute, test tones, event triggering, and meters; avoid expensive always-on visualizers.
- Report missing files, decode failures, duplicate event bindings, clipping risk, unbounded concurrency, missing user gesture, and assets not included in exports.
- Add exportable audio manifest and dependency report, and ensure source ZIPs preserve asset paths.

#### 11.8 Performance and platform support
- Set per-project budgets for total audio bytes, decoded memory, simultaneous voices, music streaming, and optional effects.
- Compress/stream long tracks; keep short frequently played SFX decoded when appropriate; cache only within memory budgets.
- Support low-end mode with fewer simultaneous voices, simpler effects, shorter ambience ranges, and no expensive visualizers.
- Verify behavior separately in browser preview, deployed web, desktop wrapper, Android export, and native engine exports; don't assume one runtime's audio behavior proves another's.
- Use Web Audio API for web-specific routing/spatial effects where supported, with simple media playback and silent/no-audio fallback paths as needed. AudioWorklet-based processing is optional and only for features that justify it.

#### 11.9 Automated audio acceptance tests
- Test asset existence, decoding, supported format, metadata, manifest references, loop points, and license/provenance fields.
- Test that each critical event maps to a valid cue or an explicitly approved silent state.
- Test user-gesture initialization, resume after suspension, mute/volume behavior, bus routing, music restart prevention, and cleanup after reload.
- Test missing/corrupt audio assets and ensure the game remains playable with a visible warning.
- Add deterministic browser audio mocks for CI; where real audio output cannot be validated headlessly, label the check as structural rather than audible-quality verification.
- Add golden checks for clipping/peak level, silence gaps, loop seams, and basic loudness consistency where tooling supports them.
- Acceptance: a sample game has a coherent audio brief, valid licensed/imported or generated assets, working event mapping, functioning mixer/settings, and passing audio tests; removing one sound file yields a clear warning without breaking gameplay.

### 12. Additional 1.7 quality-of-life and reliability upgrades
- Add global undo/redo for supported user edits, with clear boundaries for generated files, plan changes, and asset operations.
- Add project snapshots and named checkpoints before risky migrations, large generation runs, or automated repairs.
- Add a unified diagnostics panel for AI provider, preview, build, asset import, sound, and export errors with copyable redacted reports.
- Add a project portability audit before ZIP/export: missing assets, unsupported features, environment variables, platform-specific APIs, and dependency/license notes.
- Add a real “quality vs speed vs cost” budget profile that changes context limits, number of review passes, asset detail, and test depth; show the actual policy applied.
- Add a recovery assistant that proposes a minimal repair from a saved failing state and shows a diff before applying.
- Add generated project documentation: controls, architecture, asset list, build/run steps, limitations, and third-party notices.
- Add optional localization workflow for UI strings, subtitles, text direction (including RTL Arabic), and per-language font coverage.
- Add accessibility checks for keyboard navigation, contrast, reduced motion, caption availability, and critical information not conveyed by audio alone.
- Add a threat-model and dependency audit for imported projects and generated integrations, including secrets scanning and unsafe archive rejection.
- Add an opt-in telemetry-free local diagnostics mode and make any remote diagnostics explicit, minimal, and redacted.
- Add project-level resource dashboards for build duration, token use where available, asset bytes, preview memory, and validation coverage.

Acceptance: recovery snapshots restore a known-good revision, exports produce an actionable portability report, diagnostics are redacted, and quality/cost profiles measurably alter work rather than only changing labels.

## Ideas to keep in the backlog until 1.6 is stable

- Visual node editor for scene and gameplay systems.
- Optional plugin/extension API with capability permissions and a sandbox.
- Collaborative editing and shared project spaces.
- Asset marketplace and user-managed style libraries.
- Scene/level editor with direct manipulation and undo/redo.
- Voice input and spoken walkthroughs.
- One-click publishing to additional hosting providers.
- Automatic project documentation and architecture diagrams.

These are not 1.6 blockers. Build them only when there is evidence that the foundation, security, cost controls, and test suite can support them.

## 1.7 release gate

GENE 1.7 is ready only when the 1.6 golden-project suite still passes, project revisions are recoverable, context selection is traceable, imported/generated assets are validated, long jobs survive refreshes and transient failures, and release artifacts are tied to a tested commit.
