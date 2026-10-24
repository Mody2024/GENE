# GENE Infinity — Foundation Upgrade Plan

> **Progress snapshot (2026-10-24):** The first foundation batch is committed on `main` at [`9956ac4`](https://github.com/Mody2024/GENE/commit/9956ac40941e409258b4302c91e7f7d4562cf473). Its commit report records CI, interactive-playground, and browser-regression workflows passing. This does not mean the full Infinity overhaul or production end-to-end acceptance is complete. Percentages below are planning estimates, not runtime telemetry.


- [x] Serialize IndexedDB workspace snapshot writes so delayed earlier saves cannot overwrite later snapshots.
- [x] Reconcile localStorage and IndexedDB during startup by project ID and updated timestamp, recovering durable projects even if localStorage still contains an older non-empty snapshot.
- [x] Handle invalid and equal project timestamps deterministically when reconciling localStorage and IndexedDB, preserving the documented localStorage tie-break behavior.
- [x] Avoid treating ES-module static import/export syntax as invalid when checked by the classic-script `Function` constructor; report those files as requiring module-aware validation instead.

## Wave progress estimate
- **Wave 1 — orchestration, safety contracts, render diagnostics, sprite frames, relevant visual references: 88%** (foundation landed; visual ranking now checks title, alt text, captions, descriptions and exact token matches including Arabic; remaining integration and edge-case verification are tracked below).
- **Wave 2 — 3D scene reliability and playable geometry: 70%** (stricter runtime contracts and OBJ/WebGL groundwork exist; quality gate now fails empty/fully hidden scene manifests, accepts scene object aliases, and has focused scene-diagnostics tests; real prompt-to-playable-scene acceptance remains).
- **Wave 3 — persistent workspace, checkpoints, resumable repair: 30%** (durable snapshots serialize writes; startup reconciles both stores; checkpoint recovery verifies file fingerprints; explicit resume clears stale failure state; end-to-end recovery acceptance remains).
- **Wave 4 — Forge and creative assets/audio/voice-over integration: 40%** (Forge/voice-over foundations exist; end-to-end export and playback acceptance remains).
- **Wave 5 — evidence-based self-improvement and release acceptance: 27%** (the syntax gate avoids false ES-module failures and checkpoint recovery rejects altered snapshots; module-aware parsing and held-out end-to-end acceptance remain).


This document records the next implementation sequence for the existing GENE workspace. It is a living plan; a checkbox should be marked complete only after the corresponding code and verification exist.

## Phase A — Restore reliability
- [x] Validate checkpoint source fingerprints before recovery; refuse to overwrite project files from corrupted, missing, or unmanifested checkpoint content.
- [x] Clear stale task/run failure messages when an explicit resume requeues interrupted or failed work.
- [ ] Reproduce the current 3D-game generation failure from a realistic prompt and inspect the generated project, WebGL output, input bindings, camera, collision, and scene integration.
- [x] Strengthen static scene checks to recognize scene/sceneObjects/objects aliases and fail when a WebGL scene has no declared objects or every object is hidden.
- [x] Add a focused Node test suite and `test:scene` command for empty scenes, hidden/duplicate IDs, and missing/present OBJ assets; the five focused tests passed in a local isolated run.
- [x] Harden scene diagnostics against OBJ path traversal, absolute paths, query fragments, and inherited-property asset lookups; add regression cases for these invalid references.
- [x] Build acceptance rejects unsafe OBJ paths, validates OBJ vertex/face content and safe colocated MTL references, and fails WebGL mesh entries with no assigned model instead of counting empty placeholders as valid geometry.
- [x] Build checks now warn when WebGL 3D source lacks recognizable scene-renderer integration and when primitive scene objects may not be handled by the imported-OBJ mesh bridge; renderer references are not treated as proof of visible output.
- [x] Add bounded WebGL primitive mesh generation for box, sphere, cylinder, cone and plane scene objects, while preserving imported OBJ support; orient plane normals toward positive Y.
- [x] WebGL primitive generation explicitly supports box/cube/rectangular-prism aliases and no longer silently substitutes a cube for unknown scene types.
- [x] Build acceptance checks the supported WebGL scene type set, requires an OBJ for mesh/custom entries, and validates any provided modelPath regardless of object type.
- [x] Add a reusable perspective view-projection helper with look-at camera basis, clamped FOV/near/far/aspect values, and a fallback for near-parallel up vectors; document it in generated-game instructions.
- [x] Expose optional WebGL lighting uniforms (`uLightDirection`, `uLightColor`, `uAmbient`) and preserve clamped per-object light direction/intensity/ambient values, including explicit zero values; generated-game contract documents their use.
- [x] Extend focused scene diagnostics to reject unsupported WebGL types and mesh/custom placeholders without OBJ paths, and accept the supported primitive/light/camera type set; add regression cases (9 scene-diagnostic tests are now defined, but still require execution in the repository environment).
- [x] Scene diagnostics now reject non-finite/malformed position, rotation and scale transforms, warn about zero/huge scales, and validate supplied OBJ contents/size/count bounds (maximum 2 MB and 100,000 vertex/face records); regression cases added, execution still pending.
- [x] Fix OBJ validation's escaped regular expressions so standard whitespace-prefixed `v` and `f` records are actually recognized; regression cases cover valid and malformed OBJ data.
- [x] Align runtime vector normalization with diagnostics: scene transforms can be supplied as either `[x, y, z]` arrays or `{x, y, z}` objects, with finite-value checks and bounded components.
- [x] Bound OBJ parsing work by rejecting oversized source before scanning; validate face arity and vertex indices, including slash notation and negative relative indices against vertices declared before each face; regression suite expanded to 15 cases (execution still pending).
- [x] Preserve explicit zero scale in WebGL model matrices instead of silently replacing it with unit scale; finite nonzero scales remain bounded and malformed values fall back safely.
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
