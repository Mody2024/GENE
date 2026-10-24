# GENE Infinity — Foundation Upgrade Plan

> **Progress snapshot (2026-10-24):** The first foundation batch is committed on `main` at [`9956ac4`](https://github.com/Mody2024/GENE/commit/9956ac40941e409258b4302c91e7f7d4562cf473). Its commit report records CI, interactive-playground, and browser-regression workflows passing. This does not mean the full Infinity overhaul or production end-to-end acceptance is complete. Percentages below are planning estimates, not runtime telemetry.


- [x] Serialize IndexedDB workspace snapshot writes so delayed earlier saves cannot overwrite later snapshots.
- [x] Reconcile localStorage and IndexedDB during startup by project ID and updated timestamp, recovering durable projects even if localStorage still contains an older non-empty snapshot.
- [x] Handle invalid and equal project timestamps deterministically when reconciling localStorage and IndexedDB, preserving the documented localStorage tie-break behavior.
- [x] Avoid treating ES-module static import/export syntax as invalid when checked by the classic-script `Function` constructor; report those files as requiring module-aware validation instead.

## Wave progress estimate
- **Wave 1 — orchestration, safety contracts, render diagnostics, sprite frames, relevant visual references: 90%** (foundation landed; visual ranking now checks title, alt text, captions, descriptions and exact token matches including Arabic; remaining integration and edge-case verification are tracked below).
- **Wave 2 — 3D scene reliability and playable geometry: 93%** (stricter runtime contracts and OBJ/WebGL groundwork exist; quality gate now fails empty/fully hidden scene manifests, accepts scene object aliases, and has focused scene-diagnostics tests; real prompt-to-playable-scene acceptance remains).
- **Wave 3 — persistent workspace, checkpoints, resumable repair: 45%**
- [x] Project deletion now rewrites both localStorage and the durable IndexedDB workspace snapshot, preventing stale snapshots from resurrecting deleted non-active projects. The active project's freshest in-memory state is preserved in the replacement snapshot; durable cleanup failures raise a visible persistence warning. End-to-end browser verification remains pending.
- [x] Hardened workspace hydration against malformed localStorage and IndexedDB data: invalid project records are filtered individually, references/versions are normalized to arrays, and durable snapshot reads enforce project/version caps at the storage boundary. Browser-level recovery verification remains pending.
- [x] Added durable deletion tombstones to the IndexedDB workspace snapshot. Project deletion records the ID in the same serialized read/write transaction as the snapshot update; hydration filters tombstoned IDs from both localStorage and IndexedDB, and ordinary subsequent saves preserve tombstones so stale copies cannot immediately resurrect deleted projects. End-to-end multi-tab/browser verification remains pending. (durable snapshots serialize writes; startup reconciles both stores; checkpoint recovery verifies file fingerprints; explicit resume clears stale failure state; end-to-end recovery acceptance remains).
- **Wave 4 — Forge and creative assets/audio/voice-over integration: 40%** (Forge/voice-over foundations exist; end-to-end export and playback acceptance remains).
- **Wave 5 — evidence-based self-improvement and release acceptance: 53%** (the syntax gate avoids false ES-module failures and checkpoint recovery rejects altered snapshots; module-aware parsing and held-out end-to-end acceptance remain).


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
- [x] OBJ diagnostics now parse model records in a single bounded pass, validate negative relative indices against vertices already declared, and handle repeated identical face lines correctly; fixed an earlier fixture to include valid referenced vertices and added a repeated-face regression (16 focused test cases defined; execution remains pending).
- [x] Scene transform arrays must contain exactly three components; extra values are rejected rather than silently ignored. Added a regression case; 17 focused diagnostics tests are defined but still await execution.
- [x] OBJ diagnostics now ignore comment-only/inline comments on geometry records and reject vertex coordinates that parse to non-finite numbers (e.g. overflow such as `1e999`); 19 focused test cases are defined, execution still pending.
- [x] Wired `inspectSceneManifest` into the real build-quality gate, merging shared diagnostics errors and warnings with existing scene checks while keeping empty Canvas2D editor manifests permitted and requiring scene content for WebGL3D. OBJ validation now rejects malformed vertex records even when other valid vertices exist; regression suite defines 20 cases (execution still pending).
- [x] Build-quality gate now calls shared scene diagnostics and surfaces their warnings/errors. Scene manifests above the runtime's 500-object limit fail validation instead of being silently truncated. OBJ vertex parsing accepts standard XYZ/XYZW and common vertex-color extensions while rejecting non-finite values and trailing nonnumeric garbage; 23 focused diagnostics tests are defined, execution still pending.
- [x] WebGL3D validation now fails when a required OBJ model path is syntactically valid but the referenced asset is absent from the packaged project. Added a regression case for this missing-asset failure; test execution and a full generated-game browser run remain pending.
- [x] Runtime scene bootstrap now creates visible box geometry for generic `mesh` objects with no assigned model path, preventing empty generic mesh entries from silently disappearing. A declared OBJ path still does not get a placeholder: missing packaged assets remain a hard validation error. Browser-renderer verification is still required.
- [x] Runtime OBJ loading now catches parser exceptions and empty geometry, keeps the scene visible with a box placeholder, and records a per-object `runtimeWarnings` entry with the model path and failure reason. This is a resilience fallback, not a substitute for a correct asset; browser-level rendering remains unverified.
- [x] WebGL mesh setup now rolls back GPU buffers allocated by a failing object and records a runtime warning with its ID, model path, and error instead of swallowing exceptions. OBJ groups that produce zero usable vertex buffers get a visible box fallback and a diagnostic. Runtime browser verification remains pending.
- [x] Runtime diagnostics now use a shared deduplicating helper and cap the in-memory warning list at 100 entries, avoiding repeated identical OBJ/WebGL failures growing without bound during retries. Browser-level verification remains pending.
- [x] Gameplay Director no longer classifies every prompt containing “puzzle” as exploration; the puzzle-strategy profile now owns puzzle/logic terms. Added regression cases for puzzle-vs-exploration routing, platformer fairness guidance, mobile controls, and the contract's no-false-testing-claims rule. Test commands are wired in `apps/web/package.json`; execution is pending because no repository test runner was available in this pass.
- [x] Gameplay Director now gives puzzle/logic intent precedence over mixed exploration wording and normalizes common Three.js/WebGL/3D engine labels before selecting engine guidance. Seven regression tests cover genre routing, mixed prompts, platformer fairness, mobile controls, engine aliases, and truthful acceptance wording. GitHub Actions CI now runs `node --test apps/web/app/lib/*.test.mjs` on the main CI path; actual run result is pending.
- [x] OBJ validation now counts texture-coordinate (`vt`) and normal (`vn`) records and validates every face reference, including positive/negative vertex, texture and normal indices. Added regression coverage for missing attribute references and valid slash-notation faces, and corrected an earlier fixture to include its referenced texture coordinates. CI is configured to run all web `*.test.mjs` files; execution results remain pending.
- [x] OBJ parsing now validates texture-coordinate and normal record shape/content, rejects non-finite values and caps each attribute family at 100,000 records. Two more regression cases cover malformed `vt`/`vn` records and zero texture indices; the scene-diagnostics suite now contains 28 test cases. GitHub Actions has been configured to execute the suite, but no completed workflow run is visible yet.
- [x] Shared scene diagnostics now inspect every OBJ `mtllib` declaration, reject empty/unsafe library names and missing sibling `.mtl` files, and permit valid sibling material libraries. Two regression tests cover missing/unsafe references and a valid material file; scene-diagnostics now has 30 test cases. CI execution and actual rendering verification remain pending.
- [x] The WebGL runtime warning helper now forwards deduplicated 3D asset/mesh warnings to the parent preview via `gene-runtime-warning`; the workspace listener checks `event.source` against its own preview iframe before showing the message. This closes the gap between renderer diagnostics and visible user feedback. Browser integration verification remains pending.
- [x] Renderer warnings now persist in the active project's `livingPreview.runtimeErrors` (bounded to the latest 10), update the latest version's test summary, and are written to the durable IndexedDB workspace snapshot. If that durable write fails, the workspace raises an explicit backup warning. Browser-level event-to-recovery verification remains pending.
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
