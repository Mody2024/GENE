# GENE Infinity — Foundation Upgrade Plan

> **Progress snapshot (2026-10-24):** The first foundation batch is committed on `main` at [`9956ac4`](https://github.com/Mody2024/GENE/commit/9956ac40941e409258b4302c91e7f7d4562cf473). Its commit report records CI, interactive-playground, and browser-regression workflows passing. This does not mean the full Infinity overhaul or production end-to-end acceptance is complete. Percentages below are planning estimates, not runtime telemetry.

## Wave progress estimate
- **Wave 1 — orchestration, safety contracts, render diagnostics, sprite frames, relevant visual references: 88%** (foundation landed; visual ranking now checks title, alt text, captions, descriptions and exact token matches including Arabic; remaining integration and edge-case verification are tracked below).
- **Wave 2 — 3D scene reliability and playable geometry: 35%** (stricter runtime contracts and OBJ/WebGL groundwork exist; real prompt-to-playable-scene acceptance remains).
- **Wave 3 — persistent workspace, checkpoints, resumable repair: 20%** (local project/version foundations exist; durable task/project storage and resume semantics remain).
- **Wave 4 — Forge and creative assets/audio/voice-over integration: 40%** (Forge/voice-over foundations exist; end-to-end export and playback acceptance remains).
- **Wave 5 — evidence-based self-improvement and release acceptance: 10%** (roadmap and regression foundations exist; held-out evaluation and full release gate remain).


This document records the next implementation sequence for the existing GENE workspace. It is a living plan; a checkbox should be marked complete only after the corresponding code and verification exist.

## Phase A — Restore reliability
- [ ] Reproduce the current 3D-game generation failure from a realistic prompt and inspect the generated project, WebGL output, input bindings, camera, collision, and scene integration.
- [ ] Preserve a last-known-good revision before any automated repair.
- [ ] Run the complete CI suite and record the exact failing tests before changing generation logic.
- [ ] Keep 2D, text-based, and web-app generation as independent regression targets.

## Phase B — Visual research on every project
- [x] Plan separate visual searches for UI/menus, gameplay/camera, characters/animation, and environments/props for games.
- [x] Plan separate UI/layout, interaction, visual-style, and illustration/icon searches for apps and websites.
- [x] Send licensed image references as real image pixels where supported, and retain source, license, and credit metadata.
- [ ] Add visual reference comparison after the generated scene or UI is running.
- [ ] Extend source diversification beyond Wikimedia when free and configured image-search providers are available.
- [ ] Allow users to intentionally disable visual research for a project.

## Phase C — AI-first orchestration and tool autonomy
- [x] Use available configured AI for planning and adaptive interviewing; surface provider failure rather than silently substituting deterministic output.
- [ ] Auto-run in-workspace research, illustration, Forge, scene inspection, tests, and other configured capabilities without asking permission per call.
- [x] Require explicit, call-scoped approval for research and Forge tool calls; approvals are bound to exact inputs and expire.
- [ ] Persist task IDs, dependency edges, current tool, stage logs, cancellation, and checkpoints outside ephemeral UI state.
- [ ] Resume from verified checkpoints after provider/runtime failure, with bounded retry budgets per strategy.
- [ ] Stream truthful progress; do not invent percentages or describe queued tasks as active.

## Phase D — Project covers and library
- [x] Create no-credit local SVG cover art from project type, engine, title, and prompt.
- [x] Add a dedicated Projects page with cover image, name, type, file count, status, and open action.
- [ ] Save the latest generated cover as a project-owned assets/project-cover.svg file after the first successful build.
- [ ] Use available original character sprites or a captured render when safe and possible; otherwise retain a deterministic vector cover.
- [ ] Replace browser-only persistence with durable project storage once ownership, authorization, and migrations are tested.

## Phase E — Forge quality and additional creative tools
- [ ] Fix the exact 3D runtime regression before increasing model complexity.
- [ ] Add scene-derived spatial bounds, playable-route checks, camera obstruction checks, and engine-specific collision validation.
- [ ] Expand modular 2D art, tilesets, sprites, and animations with integration tests.
- [ ] Improve 3D geometry, materials, UV/texture workflows, rigging, and animation only through capabilities that actually exist.
- [ ] Add imported rigged-model animation playback/retargeting with explicit format support, skeleton compatibility checks, state transitions, and real browser acceptance tests.
- [ ] Complete Audio Studio voice-over workflow: provider-backed TTS, voice/language/emotion selection, line-by-line recording and retakes, captions, per-dialogue mapping, asset licensing metadata, and exported-game end-to-end tests.
- [ ] Verify saved/imported voice-over assets through project persistence, preview, standalone export, and playback; browser SpeechSynthesis remains preview/fallback rather than a claimed professional rendered voice.
- [ ] Expand contextual SFX/music generation and sound asset research, with source/license metadata and tests proving events trigger only at actual gameplay transitions.
- [ ] Develop Gene Imagine with vector editing, sprite tools, UI composition, texture tools, and export.
- [ ] Develop Gene Music Studio with procedural composition, sound design, editing, and direct game integration.

## Phase F — Self-improvement
- [ ] Record reproducible defects and their test evidence in a project-scoped knowledge base.
- [ ] Generate candidate skills/workflow improvements in isolation.
- [ ] Evaluate candidates against fixed held-out tests and promote only improvements that pass.
- [ ] Retain rollback, user cancellation, cost budgets, and truthful capability metadata.
- [ ] Distinguish memory/prompt/skill improvement from actual model-weight training.

## Release acceptance
A release is not complete merely because source generation succeeded. Require the web workspace build, regression suite, generated 2D game, generated 3D scene, text-based project, app user flow, local cover rendering, and configured cloud-packaging path to pass their applicable tests. State clearly which end-to-end tests were actually executed.


## Wave completion rule
A wave is complete only when its implementation is merged and its relevant tests pass. Production deployment alone does not prove generated games are playable. Keep these estimates updated after each substantive implementation batch, and lower them if regressions are discovered.
