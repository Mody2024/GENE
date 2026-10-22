# GENE Infinity — Foundation Upgrade Plan

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
- [ ] Use available configured AI for planning and adaptive interviewing before any deterministic fallback.
- [ ] Auto-run in-workspace research, illustration, Forge, scene inspection, tests, and other configured capabilities without asking permission per call.
- [ ] Keep explicit confirmation for public deployment, destructive changes, payments, and new external data-sharing scopes.
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
