# GENE 1.7: Studio Forge — Studio-Scale Game Creation

Status: living implementation roadmap. This document is not a claim that every listed capability exists.

## Implementation snapshot — 2026-10-13

Implemented on the `feat/gene-monster-builder` branch (not yet merged or promoted to production):
- Capability-aware studio contract and `/api/capabilities` endpoint, including explicit partial capability records for the audio mixer and scene asset integration.
- Stronger game-generation acceptance guidance for event-driven sound, browser-safe audio startup, bus/mute controls, graceful missing-audio behavior, honest spatial-audio claims, coherent asset silhouettes/materials, and mesh/material budgets.
- New games are explicitly required to implement sound by default unless the user asks for silence. The prompt now specifies an integrated AudioManager, genre-matched procedural music/SFX fallback when real media assets are absent, event-driven gameplay/UI sound, Settings controls, volume buses, pause/restart cleanup, and source-aligned audio metadata.
- Added a server-side build gate for newly built/assembled games: it checks audio metadata, master/music/SFX buses, at least three mapped events, an instantiated browser audio playback API, a playback/output call, multiple sound-event call sites, a music playback path, and adjustable audio controls. A mute button or metadata alone does not pass. Targeted edits are not blocked solely because an older project has not yet adopted the audio contract.
- Added game-identity guidance requiring a distinctive signature mechanic, purposeful content variety, art-directed scene composition, and immediate event-matched feedback.
- Added regression assertions for the default-audio prompt, standardized audio metadata, server-side audio validation, and staged-generation exceptions.
- Added the first source-linked **Scene Studio** slice in `apps/web/app/components/SceneStudio.tsx`: reads existing `game-spec.json`, presents a hierarchy, adds/removes entries, edits name/type/position/rotation/scale/color/visibility, provides bounded undo/redo, and writes versioned changes back to the actual project manifest. It explicitly labels itself as a scene-data editor, not a visual 3D gizmo viewport; a one-click chat handoff asks GENE to wire the schema into the actual game renderer and verify preview behavior.
- Added **Audio Studio** in `apps/web/app/components/AudioStudio.tsx`: a real browser Web Audio test bench that generates short event-specific tones and a procedural music motif on demand, exposes master/music/SFX levels, respects mute/zero volume, and writes the audio buses/volumes/event map into the project manifest. The UI explicitly distinguishes editor test playback from the generated game runtime; a sound test alone does not wire the game gameplay events.
- Integrated both studios into workspace navigation with responsive layouts and versioned manifest saving; manifest changes can sync to the local agent.
- Added smoke assertions for Scene Studio navigation, source persistence, bounded undo/redo, runtime-wiring handoff, Audio Studio Web Audio construction, manifest controls, and styling. Added Playwright browser steps to create/save a scene object, play a sound cue, and save the audio manifest.
- Saved Forge meshes now offer an **Integrate into game** action. It prepares a chat request tied to that asset's actual OBJ/MTL file paths and asks for scene loading, materials, collision/gameplay integration, and visible preview proof; the user reviews and sends the request rather than the UI pretending integration already happened.
- Regression assertions cover the new contract and asset-integration workflow.

Still roadmap work, not delivered by this snapshot: a game-runtime audio manager that consumes Audio Studio settings and connects mapped events, plus an event timeline and game-audio test scene; a live 3D viewport with direct transform gizmos, runtime-bound object editing, material/light/camera inspectors, and undo/redo; richer authored/imported model and animation pipelines; automated gameplay/audio-quality tests; and complete verified EXE/APK pipelines. Passing CI validates repository tests, not every possible generated game or native target.

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


### 21. Whole-project dependency graph and impact analysis

- Maintain a machine-readable graph connecting plans, tasks, scenes, scripts, assets, audio events, UI screens, data schemas, tests, and exports.
- Before a change, identify its direct and downstream dependencies; e.g. changing an input action should surface affected tutorials, key prompts, tests, and controller mappings.
- Track ownership and source of truth for duplicated values so the same setting is not silently copied into unrelated files.
- Detect orphan files, unused assets, missing references, circular dependencies, dead routes, duplicate IDs, and mismatched event names.
- Generate an impact summary and focused regression-test list for each proposed edit.
- Keep the graph incremental and cacheable; avoid rescanning the entire project on every chat message.
- Show confidence and unknown edges for project types the analyzer cannot fully parse.

Acceptance: a fixture with a renamed asset/event reports all affected references before the change and verifies that the repaired graph has no broken links.

### 22. Project-specific knowledge base and decision memory

- Keep confirmed decisions, rejected approaches, coding conventions, architecture constraints, user-approved defaults, known bugs, and verified build instructions in structured project memory separate from the chat transcript.
- Record the source, timestamp, revision, and confidence of each decision; allow users to inspect, edit, pin, or forget stored facts.
- Resolve conflicts explicitly: newer user instructions can supersede older decisions, but the system must not silently discard important constraints.
- Retrieve only relevant memory for a task and summarize deltas instead of attaching the entire conversation or plan to every request.
- Store reproducible failed-attempt summaries so the agent doesn't repeatedly retry the same broken approach.
- Keep credentials, private keys, personal data, and sensitive values out of memory and logs.
- Support export/import of project memory and graceful recovery when storage is unavailable.

Acceptance: after reload or a new session, GENE preserves approved decisions and project constraints without inventing unconfirmed facts or resending the entire transcript.

### 23. Multiplayer and network architecture workbench

- Add an explicit multiplayer design interview: local co-op, LAN, online peer-hosted, dedicated server, or asynchronous; player count, authority, persistence, latency tolerance, and reconnect behavior.
- Generate a network contract covering message types, state ownership, validation, replication frequency, join/leave, reconnect, timeout, and version compatibility.
- Distinguish local split-screen from network multiplayer and from a visual mock of multiplayer; clearly report which mode is actually implemented.
- Add deterministic simulation fixtures for latency, jitter, packet loss, duplicate messages, disconnects, reconnects, and out-of-order events.
- Provide server-authoritative patterns for competitive or security-sensitive actions, server-side input validation, rate limits, and abuse-resistant state changes.
- Add multiplayer session telemetry and privacy-safe diagnostics; never log authentication tokens or private message content by default.
- Validate lobby, ready states, player spawning, late join, host migration where supported, and return-to-menu paths.

Acceptance: multiplayer claims require a real two-client test or a clearly labeled limitation; simulated network tests cannot be presented as proof of a live online deployment.

### 24. Data, save files, migrations, and backend workbench

- Model application data and game saves as versioned schemas with validation, defaults, migration paths, and rollback strategy.
- Detect incompatible save/schema changes before applying them and provide migration previews on representative fixtures.
- Add save-slot inspection, backup/export/import, corruption detection, and recovery to the last valid save where possible.
- For backend-connected apps, define authentication, authorization, row/data ownership, rate limits, secret boundaries, and failure states before generating endpoints.
- Provide local/offline fallback only where product semantics allow it; never silently pretend remote persistence succeeded.
- Add test fixtures for empty data, malformed input, stale versions, interrupted writes, duplicate submissions, and unavailable services.
- Keep secrets in supported server-side environment configuration and scan generated client bundles for accidental exposure.

Acceptance: schema upgrades preserve valid old data in tested fixtures, invalid data fails safely, and offline/remote persistence status is reported truthfully.

### 25. Release engineering and reproducible delivery

- Add a release manifest containing source revision, target platform, runtime/engine version, dependencies, asset hashes, build settings, and validation results.
- Produce checksums and verify that uploaded artifacts match the files created by the build job.
- Separate development preview, test/staging, and production release channels with explicit promotion steps and rollback targets.
- Make builds resumable by artifact/task, with persisted logs and clear retry boundaries; a failed Android signing step should not require regenerating unrelated assets.
- Track binary provenance and report whether an EXE/APK is a real native build, a web wrapper, or an unavailable target.
- Verify installation/launch smoke tests when infrastructure permits, and report the exact validation level if a real device or OS runner is unavailable.
- Include signing-key safety, environment-variable checks, dependency licenses, release notes, and artifact retention policy.

Acceptance: every published artifact maps to an exact source revision and has integrity metadata; unsupported or untested release claims are visibly labeled.

### 26. Content pipeline, procedural variation, and asset consistency

- Maintain a canonical asset registry with stable IDs, semantic tags, dimensions, scale, material conventions, animation/sound links, origin, and usage locations.
- Generate consistent asset variants (biome, damage state, rarity, colorway, size) from explicit rules rather than unrelated one-off outputs.
- Add import pipelines for supported image, model, audio, font, and animation formats with validation, thumbnails, and actionable error reports.
- Use deterministic seeds and parameter manifests for procedural assets and level content so a specific output can be regenerated.
- Detect duplicate/near-duplicate files, wrong scale, incompatible texture dimensions, missing material references, and assets that exceed target budgets.
- Support placeholder-to-final replacement while preserving stable asset IDs and all scene/event references.
- Add an asset license and provenance gate before shipping or sharing a project.

Acceptance: replacing an asset preserves valid references, repeatable procedural generation uses the same seed/settings, and missing imports cannot silently ship as if complete.

### 27. Narrative, dialogue, quest, and world-state systems

- Provide structured narrative tools for characters, dialogue trees, quest objectives, prerequisites, branching outcomes, inventory conditions, and world-state flags.
- Validate dialogue graph reachability, missing responses, dead-end quests, contradictory state requirements, and unachievable objectives.
- Link dialogue, subtitles, voice assets, portraits, animation cues, and sound events through stable IDs.
- Support localization-ready strings and per-language voice/subtitle variants without hardcoding text into gameplay logic.
- Add narrative preview paths to test choices, consequences, quest completion, failure, and replay.
- Preserve player choices in save data only when the chosen save schema supports them.
- Keep authored content under user control; AI suggestions should not overwrite approved story canon without a reviewable change.

Acceptance: representative quest graphs have reachable completion/failure paths, no unhandled dialogue node, and testable save/load behavior for required story flags.

### 28. Collaboration, review, and task handoff

- Support safe project handoff with a compact project brief, open tasks, known failures, architecture notes, and exact current revision.
- Add task ownership/status and conflict warnings for files edited by multiple collaborators or simultaneous AI jobs.
- Allow review comments on a file diff, scene object, plan task, asset, or test failure rather than only on the whole chat response.
- Provide role-based permissions for viewing, editing, approving releases, and managing deployment secrets where a connected collaboration backend supports it.
- Keep user and AI changes attributable in revision history without exposing private credentials.
- Let a user pause a long build, inspect the current checkpoint, resume it, or cancel without losing the last working project.

Acceptance: concurrent edits never silently overwrite each other, and a handed-off task contains enough verified context to resume without replaying the entire conversation.

### 29. Learning playground and explainable project structure

- Offer optional explanations attached to actual generated files and components: what it does, where it is used, how to change it, and which tests cover it.
- Add safe “teach me” walkthroughs for scene hierarchy, signals/events, materials, input, data flow, audio routing, and deployment.
- Let users switch between concise builder mode and learning mode without forcing long tutorials into every answer.
- Include small isolated experiments/sandboxes for testing a script, shader, material, or gameplay rule before applying it to the main project.
- Add examples that demonstrate good project structure, performance-aware patterns, and common failure recovery.
- Keep explanations synchronized with source revisions and mark them stale after relevant edits.

Acceptance: explanations link to real current files and tests; sandbox experiments cannot accidentally overwrite the production project.

### 30. Quality gates, risk scoring, and honest project health

- Calculate project health from explicit evidence: broken references, failed tests, known runtime errors, missing controls, build status, asset/license status, and target compatibility.
- Separate blockers, warnings, unverified areas, and optional polish; never collapse them into a single unexplained “100% complete” score.
- Require risk-based gates for destructive migrations, public releases, online multiplayer, permissions, and handling user data.
- Let users configure acceptable release criteria, but do not allow a setting to relabel a known failing check as passing.
- Show the latest successful validation revision and mark checks stale when relevant source files change.
- Provide a “what remains before release?” report with actionable steps and evidence for each status.

Acceptance: changing a source file invalidates only relevant stale checks; a release summary accurately distinguishes passed, failed, skipped, and unverified criteria.


### 31. Studio-scale Game Director and specialist coordination

- Create a director that turns the approved game brief into a single canonical design bible, production plan, asset requirements, quality targets, and acceptance tests.
- Coordinate bounded specialist roles for gameplay, world/level design, character/art, animation, UI/UX, audio, narrative, performance, and QA; each role owns explicit deliverables and must use shared project contracts.
- Resolve disagreements through the canonical brief and measurable constraints instead of letting agents silently overwrite each other's decisions.
- Define dependency-aware stages: playable core loop first, then vertical slice, content production, integration, polish, and release validation.
- Give each specialist a limited context package containing relevant files, current decisions, and test evidence; avoid sending every agent the entire project transcript.
- Require integration gates after each major stage and preserve the last known-good playable milestone.
- Let users choose creative freedom versus strict adherence to the brief, with explicit approval required for major scope changes.

Acceptance: a multi-specialist fixture produces one consistent design spec, no duplicate conflicting ownership, a playable milestone, and traceable approvals for major decisions.

### 32. Visual bible and asset-consistency critic

- Create a project art bible describing style, silhouette language, scale, palette, material response, shape language, lighting, camera framing, UI typography, and reference boundaries.
- Generate asset sheets and turnarounds where supported, plus a scene-level look-development target before mass asset production.
- Compare imported/generated assets to the project's approved references and constraints using measurable metadata and image-based similarity where available.
- Detect mismatched scale, incompatible art styles, inconsistent roughness/metalness, palette drift, texture density mismatch, repeated props, and overly uniform procedural placement.
- Support approval sets and rejected examples so users can teach the project its visual direction without fine-tuning a model.
- Keep reference images and third-party assets' source/license metadata attached to their use.
- Report when visual review is unavailable or subjective; do not treat a heuristic similarity score as proof of professional quality.

Acceptance: deliberately mismatched asset fixtures trigger actionable warnings; accepted assets remain stable across later generation passes unless the user changes the art bible.

### 33. Cinematic staging and camera grammar

- Provide data-driven cinematic sequences with camera tracks, shot sizes, focus targets, timing, dialogue beats, animation cues, transitions, and skip/replay behavior.
- Use reusable camera grammars for reveal, chase, boss introduction, traversal, dialogue, victory, and tutorial demonstrations.
- Validate that cinematics return input control, respect pause/skip settings, and recover after interruption, scene unload, or player death.
- Connect animation, sound, subtitles, gameplay events, and camera cues through stable timeline event IDs.
- Include a storyboard/blocking preview before generating expensive final assets or animation.
- Keep all sequences editable in the project and avoid rendering a fake cutscene as a substitute for a functioning native sequence.

Acceptance: test sequences can be skipped, paused where supported, replayed, and interrupted safely; all required events fire in the expected order.

### 34. Combat and interaction feel tuner

- Create genre-specific tuning surfaces for movement acceleration, turn rate, input buffering, coyote time, jump curve, camera response, attack startup/active/recovery frames, hit-stop, recoil, stagger, dodge windows, enemy telegraphs, and feedback intensity.
- Link every exposed tuning value to actual runtime behavior and provide safe ranges plus a restore-defaults action.
- Use repeatable micro-test arenas for movement, platforming, melee, ranged combat, driving, and interactions.
- Capture input-to-response latency and frame-time metrics when the runtime exposes them; distinguish measured values from estimated values.
- Offer A/B comparison of two tuning profiles with identical seeds and test scenarios.
- Preserve accessibility options and avoid making camera shake, flashes, vibration, or loud sounds mandatory for gameplay clarity.

Acceptance: tuning changes produce observable behavior differences, regression tests catch invalid values, and users can restore the prior profile.

### 35. Living-world simulation and systemic interactions

- Add opt-in world-system templates for weather, time of day, day/night schedules, ambient life, destructible props, physics interactions, environmental hazards, factions, and NPC routines.
- Define interactions through data-driven rules and events instead of independent hard-coded scripts that conflict.
- Validate system combinations for performance, impossible states, runaway event loops, and broken quest or navigation assumptions.
- Use deterministic seeds and configurable simulation depth so the same world can run in high detail nearby and simplified simulation at distance where the engine supports it.
- Provide per-system budgets and explicit capability notes for each target engine.
- Make systems composable and optional; small games should not inherit a heavy simulation framework they don't need.

Acceptance: interaction fixtures cover expected state changes, simulation can be paused/reset, and low-end profiles reduce optional work without breaking core rules.

### 36. Procedural content with authored control

- Combine deterministic procedural generation with artist-authored anchor points, exclusions, landmarks, critical paths, and hand-edited overrides.
- Use parameters and seed manifests for terrain, vegetation, props, dungeons, encounters, loot, and environment dressing.
- Preserve manual edits when upstream parameters change by tracking authored overrides separately from generated output.
- Add generation previews, density/overlap checks, navigation validation, visual repetition detection, and regeneration scopes.
- Let creators regenerate only one room, biome, encounter, or asset family without changing the rest of the world.
- Keep platform-aware budgets and use chunking/streaming only where the engine and target support it.
- Prefer a small, distinctive, art-directed world over a huge empty map when the project's scope does not justify an open world.

Acceptance: same seed and configuration reproduce the same generated result; local regeneration preserves unrelated authored work and stable references.

### 37. Physics, destruction, and material interaction toolkit

- Add reusable, engine-aware templates for rigid-body props, breakable objects, doors, switches, ropes, moving platforms, vehicles, ragdolls, and environmental reactions where supported.
- Define material response profiles for impact sounds, particles, decals, damage, friction, bounce, and break behavior.
- Validate collider shape/scale, mass, collision layers, tunneling risk, joints, and interactions with gameplay navigation.
- Offer low-cost alternatives when full simulation is too expensive or unavailable, and label approximations honestly.
- Make destruction deterministic or seed-controlled where practical so tests and replays can reproduce outcomes.
- Provide a physics test arena and reset mechanism to prevent debugging experiments from corrupting the main level.

Acceptance: representative physics fixtures behave within declared tolerances, reset cleanly, and have a supported fallback for targets without equivalent features.

### 38. Visual effects and feedback choreography

- Build a shared VFX library and event grammar for impacts, muzzle flashes, magic, environmental dust, weather, footsteps, pickups, damage, UI feedback, and objective completion.
- Synchronize effects with animation, audio, camera cues, and gameplay events through a common event contract.
- Add lifetime, particle-count, overdraw, transparency, light-count, and memory budgets; provide reduced-quality variants for weak hardware.
- Detect effects that obscure UI, obscure critical threats, persist after their owner is removed, or trigger repeatedly without bounds.
- Support deterministic effect seeds and editor previews, plus a clear mute/disable-effects debugging mode.
- Add accessibility controls for flashes, camera shake, motion intensity, and visual clutter.

Acceptance: effect events clean up after scene reload, stay within budgets or warn, and never serve as the only indication of a critical game state.

### 39. Camera, lighting, and rendering art direction

- Provide camera templates and validation for third-person follow, first-person, top-down, racing, platformer, dialogue, and cinematic views.
- Detect common presentation issues: camera clipping, player obstruction, poor framing, inaccessible UI safe areas, excessive exposure shifts, flicker, and missing light probes/reflections where relevant.
- Offer engine-aware lighting recipes and environment presets, with performance tiers rather than assuming expensive real-time lighting is always available.
- Support screenshot-based composition reviews for key scenes and compare them to project-approved reference targets.
- Ensure quality profiles can reduce shadows, reflections, post-processing, foliage density, and particles while preserving readability.
- Report engine/rendering features that are unsupported on the selected export target.

Acceptance: sample scenes have stable camera behavior and visual readability at declared quality tiers; unsupported rendering features are never silently assumed.

### 40. Game production vertical-slice gate

- Require a small, representative vertical slice before broad content generation: one polished environment, one complete gameplay loop, one representative character/enemy, core UI, audio, save/restart, and a tested export target.
- Evaluate integration and consistency across art, gameplay, sound, UI, performance, accessibility, and packaging before scaling the same patterns to more content.
- Record quality targets and approved patterns from the slice as reusable templates for subsequent levels and assets.
- Detect when a generated project has breadth without depth: many placeholders, disconnected menus, repeated assets, unimplemented objectives, or no verified end-to-end loop.
- Allow users to waive scope-specific criteria explicitly, but preserve the resulting limitation in the project health report.
- Keep milestone checkpoints so the project can return to the last playable slice after a failed content expansion.

Acceptance: content expansion starts only after a declared vertical-slice checklist is passed or the user explicitly accepts documented exceptions.

### 41. Creative brief, reference analysis, and originality guardrails

- Translate user references into abstract design traits: pacing, camera language, color mood, combat rhythm, UI density, environment scale, and progression patterns.
- Keep a traceable creative brief showing which traits are user-requested and how GENE interprets them into original implementation choices.
- Avoid copying protected characters, logos, maps, dialogue, signature assets, or soundtrack material; offer genre-level alternatives when a reference request is too close to an existing work.
- Compare new work against the project's own art bible and prior assets to avoid accidental inconsistency and unintentional near-duplicates.
- Provide source/license metadata and user approval gates for external assets and generated content.
- Make originality review an aid, not a legal guarantee; disclose that automated checks cannot prove non-infringement.

Acceptance: reference-driven builds have a documented original brief, provenance for imported assets, and clear warnings for unresolved rights or licensing concerns.


## Implementation phases: GENE 1.7 Studio-scale Game Builder

This section converts the approved roadmap into dependency-ordered, testable phases. These are implementation gates, not promises that all features can be completed in a single code-generation pass. Each phase must pass its acceptance checks before later work builds on it. Keep the project playable and retain a known-good checkpoint throughout.

### Phase 0 — Baseline, scope, and release safety
**Goal:** establish a trustworthy baseline before changing the runtime.
- Capture the current branch/head, production baseline, repository structure, existing tests, API contracts, preview architecture, export workflows, and model/provider configuration.
- Build a feature-to-test matrix for existing behavior; identify critical user flows and known failures.
- Ensure every phase has a scoped branch/commit, bounded file edits, diff review, and rollback path.
- Define supported target matrix: web preview/deployment, ZIP source export, and any native engine/EXE/APK target only where an actual build pipeline exists.
- Define redacted diagnostics and prohibit logging secrets, user tokens, or raw environment values.
**Gate:** baseline checks pass or pre-existing failures are documented; production remains unchanged until explicit promotion.

### Phase 1 — Persistent project state, dependency graph, and recovery
**Goal:** prevent the AI from losing decisions or damaging working projects.
- Separate canonical plan, accepted decisions, tasks, project memory, source revision, asset registry, and test evidence from the chat transcript.
- Add revision IDs and content hashes; track dependencies among files, scenes, assets, audio events, controls, UI screens, tests, and exports where parsers support them.
- Implement checkpoints, atomic multi-file apply, conflict detection, per-file diffs, selective acceptance, rollback, and last-known-good preview.
- Bound retrieved context to relevant files and deltas; keep sensitive data out of project memory.
**Gate:** reload preserves approved decisions; failed multi-file edit leaves prior project intact; concurrent/stale edits are detected; rollback restores the last known-good revision.

### Phase 2 — Honest capability registry and production contracts
**Goal:** prevent GENE from claiming unsupported capabilities.
- Create machine-readable capability records per runtime/engine and export target for scene editing, model import, animation, audio, physics, networking, tests, and packaging.
- Define project contracts: target hardware, control scheme, visual direction, gameplay loop, save requirements, audio requirements, accessibility, and acceptance criteria.
- Track each capability as supported, partial, preview-only, unavailable, or unverified.
- Build a shared asset/provenance manifest with stable IDs, source/license metadata, hashes, and import status.
**Gate:** unsupported features are disclosed before generation; every shipped asset reference resolves; release summaries distinguish pass/fail/skipped/unverified.

### Phase 3 — Director orchestration and specialist task graph
**Goal:** coordinate work like a small production team.
- Convert the brief into a canonical design bible, dependency-aware tasks, owners, deliverables, risk levels, and validation steps.
- Define bounded specialists for gameplay, level/world, art, animation, UI, audio, narrative, performance, and QA; share structured contracts, not full transcript dumps.
- Add conflict arbitration, task cancellation/resume, incremental context, and integration gates.
- Ensure new user instructions update plan deltas without duplicating the entire plan or silently invalidating approved work.
**Gate:** representative project tasks have traceable dependencies/owners, resume correctly, and integrate without conflicting edits.

### Phase 4 — Playable core loop and input/UI foundations
**Goal:** make a genuinely playable game before expensive content.
- Improve genre templates for movement, camera, interaction, objectives, enemies, win/loss, restart, pause, settings, checkpoints, and save states where relevant.
- Provide keyboard/gamepad/touch input maps, remapping where supported, input hints, focus handling, and controller reconnect behavior.
- Add a gameplay tuning panel connected to real runtime parameters.
- Add state-transition and control-contract tests; reject a game with missing required controls or unreachable critical menu states.
**Gate:** a sample game completes the core loop, supports declared input types, pauses/restarts safely, and passes controls/menu regression tests.

### Phase 5 — Vertical slice and quality gate
**Goal:** prove the complete pipeline on one small representative level before scaling.
- Build one blockout level with one representative character/enemy, one complete objective loop, core UI, representative audio, animation, VFX, lighting, and save/restart behavior.
- Define objective acceptance checks and target hardware budgets before generating detail.
- Test the full user path from launch through gameplay to win/loss/restart and project export.
- Record approved style, tuning, asset conventions, performance budget, and reusable scene patterns.
**Gate:** vertical-slice checklist passes or the user explicitly approves documented exceptions; do not mass-generate content before this gate.

### Phase 6 — Art bible, model pipeline, and asset intelligence
**Goal:** replace inconsistent primitive-only output with a validated multi-tier asset pipeline.
- Create a visual bible and stable scale/material/style conventions.
- Support authored imports and procedural modeling tiers, clearly distinguishing placeholder, procedural approximation, and detailed/imported assets.
- Add asset IDs, thumbnails, metadata, import validation, material checks, collision checks, scale checks, duplicate detection, target budgets, and license/provenance tracking.
- Add replace-in-place while preserving references; generate LODs/texture variants only when the target pipeline supports them.
- Add a visual consistency review with human approval and honest uncertainty.
**Gate:** representative assets load, match the approved conventions, remain linked after replacement, and fit the target budget or produce actionable warnings.

### Phase 7 — Source-linked visual scene editor
**Goal:** let creators adjust actual project scenes without relying on chat for every change.
- Implement hierarchy, select/move/rotate/scale, snapping, visibility/lock, grouping, duplicate, multi-select, and undo/redo for supported scene formats.
- Add context-aware inspectors for transforms, materials, lights, cameras, collisions, audio emitters, and components where supported.
- Serialize edits into the native project representation using transactional changes and validate before refreshing preview.
- Mark unsupported properties as unavailable instead of faking edits.
**Gate:** an edited object persists after reload and export; undo/rollback works; unsupported fields are clearly reported.

### Phase 8 — Character, rigging, and animation pipeline
**Goal:** make characters behave and animate coherently.
- Validate rig hierarchy, bind pose, animation clips, scale, missing bones, root motion, and retarget compatibility.
- Add preview timeline, animation state machines, locomotion/attack/hit/death/interact transitions, and animation-event contracts.
- Connect footstep, impact, VFX, and gameplay cues to animation events.
- Use imported/generated clips only when the asset and target support them; clearly label placeholders.
**Gate:** fixture characters switch and blend supported clips, required events fire, and missing/incompatible animation is reported without breaking gameplay.

### Phase 9 — Level, world, and encounter generation
**Goal:** generate playable, authored-feeling spaces rather than disconnected scenery.
- Build level graph/critical path first, then blockout, encounters, navigation, landmarks, optional routes, checkpoints, and art dressing.
- Add deterministic seeds, authored anchors/exclusions, local regeneration, difficulty curves, and preservation of manual overrides.
- Validate reachability, spawn safety, collisions, out-of-bounds areas, softlocks, checkpoints, and objective completion.
- Add optional weather/time/NPC/faction/destruction systems only where needed and supported.
**Gate:** representative levels have reachable objectives and recovery paths; local regeneration preserves unrelated authored work.

### Phase 10 — Audio, music, and dialogue
**Goal:** provide a coherent, testable audio system rather than disconnected sound effects.
- Add audio brief, event map, asset import/metadata/provenance, procedural SFX, and provider-backed music/voice only when configured.
- Add centralized runtime service, buses, volume/mute, fades/crossfades, priorities, concurrency caps, cleanup, browser user-gesture handling, and failure fallbacks.
- Add adaptive/layered music and spatial audio only on compatible runtimes; generate accessible settings and captions where appropriate.
- Add audio panel, test scene, asset/manifest validation, and low-end budgets.
**Gate:** critical events map to valid assets or explicit silent states; mixer/settings work; missing/corrupt sound doesn't break gameplay; claims distinguish structural tests from audible QA.

### Phase 11 — Camera, lighting, VFX, physics, and cinematic presentation
**Goal:** coordinate visual and physical feedback.
- Add camera templates, composition checks, supported lighting recipes, performance tiers, and obstruction/clipping warnings.
- Add data-driven VFX event choreography tied to animation, sound, camera, and gameplay.
- Add physics/destruction templates with collider/material validation and safe fallbacks.
- Add cinematic timeline/shot grammar, dialogue/subtitle cues, skip/replay/interruption handling, and native editable sequences where supported.
**Gate:** effects clean up on reload, cinematics safely return control, physics fixtures reset, and declared budgets are met or flagged.

### Phase 12 — Narrative, quests, progression, saves, and backend safety
**Goal:** support complete longer-form game loops and real apps without fragile state.
- Add structured dialogue/quest graphs, prerequisites, world flags, inventory links, objective tracking, and localization-ready strings.
- Validate graph reachability, dead ends, missing responses, contradictory conditions, and persistence of required player choices.
- Add versioned save schemas, migration preview, backup/export/import, corruption recovery, and tests for interrupted writes.
- For backend projects, validate auth/authorization/data ownership, rate limits, secret boundaries, and failure states.
**Gate:** required quest paths are reachable; save/load and migrations pass fixtures; no secrets appear in client bundles; offline status is not misrepresented.

### Phase 13 — Multiplayer and simulation validation
**Goal:** distinguish real multiplayer from local co-op or a mock.
- Interview for network topology and requirements; create network contracts for authority, replication, join/leave, reconnect, timeouts, and version compatibility.
- Add deterministic tests for latency, jitter, packet loss, duplicates, disconnect/reconnect, and concurrent player actions.
- Add server-side validation/rate limits for security-sensitive actions and privacy-safe diagnostics.
- Require two-client end-to-end testing before claiming online multiplayer is verified.
**Gate:** real multi-client evidence or a clearly documented unverified/unsupported state; local split-screen is labeled accurately.

### Phase 14 — AI playtesting, diagnostics, and performance budgets
**Goal:** turn generated output into evidence-driven iterative development.
- Generate test charters from project contracts; exercise controls, objectives, menus, save/load, edge cases, and declared multiplayer paths.
- Capture source revision, seed, action trace, screenshots, DOM/runtime state, logs, and relevant snapshots for reproducible failures.
- Add dependency impact analysis and focused regression tests after each repair.
- Track measured versus estimated frame time, memory, draw calls, asset/audio sizes, startup time, and target-specific constraints where observable.
- Add adaptive quality tiers and low-end mode that change actual runtime settings.
**Gate:** seeded failures reproduce; repairs pass relevant regressions; performance reports label measured versus estimated data.

### Phase 15 — Packaging, portability, and release engineering
**Goal:** produce verifiable deliverables.
- Validate ZIP portability, asset paths, dependency/license reports, environment-variable requirements, and unsupported features.
- Make builds resumable by artifact/task; persist logs and retry only failed stages where practical.
- Generate release manifests with source revision, runtime/engine version, asset hashes, target, build settings, and validation results.
- Verify artifact checksums; test launch/install where an appropriate runner/device exists; distinguish native binaries from wrappers.
- Separate preview, staging, and production promotion with rollback instructions and secret-safe signing practices.
**Gate:** each release maps to an exact revision and artifact integrity record; skipped device/OS tests remain explicitly unverified.

### Phase 16 — Studio usability, collaboration, and learning
**Goal:** make advanced workflows usable without overwhelming beginners.
- Add contextual inspector/help, concise versus learning modes, sandbox experiments, and explanations linked to current files/tests.
- Add review comments, task handoff briefs, conflict warnings, attributable revisions, and role-based controls only where backend support exists.
- Add localization and RTL checks, captions, keyboard navigation, contrast, reduced-motion options, and accessible control hints.
- Provide starter projects and examples with verified run/export instructions.
**Gate:** first-time user can build, run, edit, recover, and export a supported starter; explanations remain linked to current revision.

### Phase 17 — End-to-end regression, pilot, and staged rollout
**Goal:** verify the integrated product before promotion.
- Run contract/unit tests, production build, browser smoke tests, representative project fixtures, asset checks, preview/runtime tests, and target-specific export checks.
- Compare against the vertical-slice golden fixtures and verify no regressions in plan pinning, model routing, file patching, preview handshakes, controls, ZIP export, and error recovery.
- Run a small pilot on representative app, 2D, and 3D projects; document limitations and unresolved issues.
- Merge and deploy only after required gates pass; verify the deployed revision and run production smoke tests.
- Keep a rollback target and release notes. A green CI run alone does not prove every generated game or native artifact is correct.
**Gate:** all required tests pass, skipped/unavailable tests are listed, production revision is verified, and rollback is available.

## Cross-phase rules

1. Keep every milestone buildable and preserve a known-good revision.
2. Prefer small patch-based edits and bounded tasks over replacing large source files.
3. Use actual project/preview evidence; never claim a screenshot, sound, model, or binary was validated if it was not.
4. Mark generated content as placeholder/procedural/imported/verified as appropriate.
5. Keep provider keys server-side; redact diagnostics and track asset provenance.
6. Optimize for coherent, tested quality and target hardware rather than asset count or map size.
7. Features requiring unavailable providers, engine capabilities, signing keys, native runners, or devices remain explicitly unsupported/unverified—not fabricated.
8. The 1.7 roadmap is complete only when each shipped phase has code, tests, documentation, and evidence, not merely when the plan is committed.

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
