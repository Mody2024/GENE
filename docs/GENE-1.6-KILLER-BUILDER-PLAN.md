# GENE 1.6 — Killer Builder Product Plan

**Status:** Product/engineering blueprint, not yet implemented runtime behavior  
**Repository:** Mody2024/GENE  
**Base initiative:** GENE Monster Builder roadmap, PR #18  
**Release identity:** GENE 1.6 Flash · GENE 1.6 Balanced · GENE 1.6 Thinking  
**North star:** a user describes the app or game they want, GENE interviews intelligently, plans deeply, builds in controlled stages, sees the actual preview, models purposeful assets, tests the result, and recovers without losing work.

GENE 1.6 must feel like a genuinely new product, not a reskin and not a chatbot that wraps a code generator. The version is complete only when the user-facing controls correspond to real, tested behavior.

## 1. Product definition and honesty

GENE should be excellent at three connected disciplines:
1. **Understand and design:** professional interview, plan, reference understanding, genre expertise, architecture and visual direction.
2. **Build and edit:** real source/assets, controlled multi-file changes, coherent design systems, substantial gameplay and actual 3D asset workflows.
3. **Prove and deliver:** preview evidence, interaction tests, self-repair, reliable packaging, snapshots, exports and clear failure reporting.

No system can promise literally zero failures across external AI providers and cloud services. The production promise is stronger and more useful: failures are detected, source is preserved, the last known-good result remains available, recovery is bounded and targeted, and GENE never claims untested work is finished.

## 2. The new model selector

Create a persistent model/effort selector in the composer, similar in clarity to leading AI workspaces but with original GENE branding. The selected mode must affect planning depth, model routing, task decomposition, context budgets, review passes, and verification. A cosmetic dropdown is a release-blocking bug.

### GENE 1.6 Flash
- Optimized for quick chat, small visual adjustments, one-file bug fixes, prompt clarification, and bounded repetitive tasks.
- Use the configured fast model with a compact context and small patch budget.
- Run essential syntax, source-integrity and preview checks even in Flash mode.
- Avoid expensive parallel reviewers for low-risk edits unless a failure demands one.

### GENE 1.6 Balanced
- Default for most new projects and normal feature requests.
- Inspect project structure, produce a practical task plan, edit related files coherently, review the diff, and run app/game-specific acceptance checks.
- Use stronger planning and a review pass for multi-file changes or medium-risk tasks.
- Balance speed, quality, context and provider cost.

### GENE 1.6 Thinking
- Explicit deep-work mode for complex games, advanced 3D, broad app redesigns, architectural changes, stubborn bugs and long multi-stage builds.
- Before implementation, analyze the requested genre, target platform, user flow/core loop, architecture, art direction, assets, risks, dependencies and measurable acceptance criteria.
- Use deeper planning, smaller implementation milestones, extra cross-file review, actual preview observation and targeted repair loops.
- Allocate more context/output budget where the configured provider allows it, but still split work into bounded patches. Never respond by generating enormous unstructured source files.
- Keep a persistent task ledger and checkpoints so long work can resume.
- Be transparent about slower operation, model availability, API quota and cost.
- Thinking is the highest-effort mode, not a promise of unlimited compute, perfect results, or a particular provider model unless it is actually configured.

### Real provider/model configuration
- Add a server-owned provider/model registry with capability metadata, context/output limits, availability, latency/cost class and tool support.
- Show actual configured model options when available; distinguish product effort modes from provider model names.
- If GENE 1.6 is the product mode and Gemini is the provider, say so only in GENE diagnostics/settings where useful. Never inject provider names into generated app/game UI.
- Validate the selected model on the server. Do not accept arbitrary client model strings as trusted.
- Fallback only to a configured compatible provider, preserve the chosen effort level where possible, and report when a fallback changes capability.
- Do not label Thinking as “best model” if it merely changes prompt text. Automated tests must prove each mode changes its orchestration policy.

## 3. Professional interview system

### 3.1 Interview before implementation
The interview should feel like a thoughtful product designer, senior game designer, and engineering lead collaborating with the user—not a long questionnaire.

First classify the request:
- New app/website
- New 2D game
- New 3D game
- Edit existing project
- Bug fix
- Visual redesign
- Feature expansion
- Research/plan only
- Build/export/deployment task

Then inspect the existing project and ask only the next question that materially affects the build. Ask one at a time, with a short reason and a sensible recommended default. Permit “choose for me” and “surprise me.” Do not ask what is already known from the request or current project.

### 3.2 Interview tracks
**Apps:** purpose, users, primary flow, pages, key actions, data/persistence, authentication, integrations, responsive targets, visual references, and success criteria.

**2D games:** genre/subgenre, core loop, player actions, win/loss, level progression, art direction, difficulty, controls, enemies/obstacles, audio, platform and performance.

**3D games:** genre, camera, movement, combat/interactions, world scale, environments, player/character design, asset realism/stylization, animation, lighting, collision, objectives, controls and target device.

**Local multiplayer:** number of players, keyboard/controller mapping, shared/split camera, joining, pause, rematch, win conditions and accessibility.

**Existing-project edit:** desired change, scope, invariants to preserve, affected screens/files, visual/behavioral acceptance, and regression risk. Inspect current code before asking questions that source already answers.

### 3.3 Question policy
- Ask at most one blocking question per turn.
- Bundle related options into a concise set only when the user can choose quickly.
- Infer noncritical defaults; do not make the user design every implementation detail.
- For a genre-specific game, the interview must cover game feel and content variety, not just “2D or 3D.”
- When the request is already detailed enough, summarize assumptions and begin without unnecessary interrogation.
- Save decisions as structured project requirements so they do not have to be re-asked after a refresh or model switch.

### 3.4 Acceptance
Tests must verify that questions arrive sequentially, known facts are not re-asked, “surprise me” advances the interview, a project edit does not trigger a new-project interview, and the agent does not start coding while a truly blocking choice is unresolved.

## 4. Pinned, living plan — never resend the entire plan

This is a major architectural requirement, not merely a visual pin icon.

### 4.1 Separate plan state from chat messages
Store a versioned Plan Artifact as structured project state, separate from the message transcript and the build task queue. It includes:
- Goal and constraints
- Requirements and decisions
- Design/art direction
- Architecture and file/asset map
- Milestones, dependencies and acceptance checks
- Current milestone and active task
- Completed work with evidence
- Known issues and next steps
- Plan revision and source revision

The plan is rendered in a persistent panel attached to the workspace. It does not scroll away as new chat messages arrive. It can collapse, expand, and show revision history.

### 4.2 New prompts update the plan by delta
When a new user prompt arrives:
1. Classify the intent.
2. Load the current plan artifact and source revision from authoritative project state.
3. Decide whether the request changes the plan, adds a task, reports a bug, asks a question, or requests implementation.
4. Return a small typed plan delta only when needed: add/update/remove requirement, reorder/insert milestone, update acceptance check, mark a task done/blocked, or add a risk.
5. Merge and validate the delta server-side. Increment plan revision only when actual plan content changes.
6. Send the implementer only the relevant task and scoped context—not the entire plan and full conversation on every edit.
7. Display the updated plan in place. Do not post the whole plan as another chat message.

### 4.3 Building and planning can coexist safely
- The plan panel is read-only during a critical transaction by default; the user may discuss new ideas without mutating the running task.
- A prompt received during a build becomes one of: question, queued edit, urgent stop/cancel, or explicit plan change.
- Do not silently append every new message to the active build prompt.
- For a conflicting request, explain the impact and ask whether to queue it or pause the build only when necessary.
- When safe, record the request in the backlog and let the current checkpoint finish.
- Plan revisions and build revisions are separate. A plan change must not reset progress denominators or make a completed task appear incomplete.
- Never re-send a giant plan to Gemini with every prompt. Use stable plan IDs, revisions, compact task context, and relevant requirement IDs.
- Provide “View plan history,” “What changed?” and “Restore previous plan revision.”

### 4.4 Required regression test
Start a multi-stage build; send a question, a visual edit, and a scope-changing feature request at different stages. Verify the question does not mutate source, the visual edit is queued/scoped, the scope change updates the plan in place, completed tasks remain completed, and no whole-plan duplicate appears in chat or repeated provider context.

## 5. Chat and orchestration architecture

Separate the current monolithic workspace and AI route into testable modules:
- Conversation service
- Intent classifier
- Interview manager
- Plan artifact service
- Task DAG/scheduler
- Provider/model router
- Project context retriever
- Patch engine
- Asset/modeling pipeline
- Preview inspector
- App/game test runners
- Build/export worker
- Checkpoint and recovery service

### Task state machine
Use explicit states: queued, ready, running, waiting-for-user, validating, repairing, passed, failed, cancelled, skipped. Each task has a stable ID, dependencies, scoped files/assets, plan revision, source revision, retry budget, acceptance criteria and evidence.

Parallelize only independent work (e.g., asset research and UI copy). Serialize edits to overlapping files. A shared project coordinator owns the manifest so subagents cannot overwrite each other's changes.

### Context strategy
- Retrieve only relevant files and accepted requirements.
- Keep full source and history in storage, not in every model prompt.
- Summarize completed milestones with file hashes and test evidence.
- Use bounded context windows and explicit token budgets.
- Keep chat answers natural and concise, with optional expandable build activity.
- User-visible activity shows what is being done, what changed, and what was verified—not hidden chain-of-thought.
- Persist tasks server-side for long jobs; browser state is a cache, not the source of truth.

## 6. Genre-specialist game intelligence

GENE must understand the genre as a design discipline before creating the first asset or script. A “platformer,” “soulslike,” “horror game,” and “kart racer” need different systems and quality checks. Deep thinking should produce a coherent game, not merely more code.

### 6.1 Genre analysis
For every requested genre, generate a compact design brief:
- Genre conventions and expected player fantasy
- Core loop and moment-to-moment verbs
- Controls, responsiveness and game feel
- Camera and spatial readability
- Challenge curve, pacing and checkpoints
- Enemy/obstacle behaviors and variation
- Progression, rewards, secrets and replay value
- Audio/visual feedback
- Accessibility and fail/retry behavior
- Technical budget and genre-specific risks

Use a known genre playbook when one exists, then adapt it to the user's distinctive request. Do not blindly paste a generic template or copy a named commercial game's assets, maps, characters or exact level layouts.

### 6.2 Genre-specific implementation examples
- **Platformer:** acceleration, jump buffering, coyote time, varied platform geometry, readable hazards, checkpoints, camera dead zone and responsive restart.
- **Precision runner:** lane/position readability, fair obstacle timing, speed curve, collision forgiveness, distinct obstacle patterns and restart time.
- **Top-down action:** enemy telegraphs, dodge/attack windows, hit feedback, enemy roles, arena flow, drops and difficulty pacing.
- **Horror:** sightline control, tension/release, sound cues, resource pressure, meaningful exploration and intentional lighting—not darkness alone.
- **Racing:** acceleration/braking, traction, camera follow, collision response, track readability, lap state and opponent behavior.
- **Survival/crafting:** resource loops, inventory clarity, escalating threats, persistent progression, crafting recipes and understandable death/recovery.
- **Puzzle:** consistent rules, readable affordances, escalating combinations, undo/retry and solvable level validation.
- **RPG/adventure:** interaction system, dialogue/quest state, progression, inventory, checkpoints and clear narrative objectives.
- **Local multiplayer:** separate input ownership, fairness, screen/camera readability, joining, rematch and simultaneous-input tests.

### 6.3 Gameplay acceptance
- Play the opening loop with automated inputs.
- Verify objective progress, failure, restart and completion.
- Check that controls match the displayed controls.
- Test frame-rate variability, focus loss, pause/resume and resize.
- Capture screenshots at defined checkpoints.
- Evaluate whether the first minute teaches the mechanics and whether the next objective is clear.
- Don't call a game complete merely because it launches or has a player sprite and score counter.

## 7. Real modeling, not piles of cubes

### 7.1 Define modeling tiers honestly
**Tier 1 — Styled composition:** purposeful shapes, coherent scale, material palette, lighting, camera, silhouettes and scene composition. No random cube piles.

**Tier 2 — Modular asset kits:** designed walls, floors, doors, props, environment pieces and reusable materials assembled from authored geometry with clear proportions and snapping.

**Tier 3 — Detailed procedural meshes:** parametric profiles, bevels, rounded surfaces, extruded shapes, lathed objects, controlled topology, UV/material assignments, normal handling and geometry-specific recipes.

**Tier 4 — Imported authored assets:** supported glTF/GLB, OBJ/MTL, textures and audio, with manifest validation, actual runtime loading, licensing/source metadata and fallback behavior.

**Tier 5 — Character/animation pipeline:** rigged meshes, skeletal animation, retargeting, materials, LOD and collision proxies only when the chosen engine/runtime supports the complete workflow.

Do not describe Tier 1 as professional character modeling. Each asset should state what it actually contains and which formats it can export.

### 7.2 GENE Forge evolution
- Replace the single generic primitive mindset with an asset-spec schema: purpose, dimensions, silhouette, material, topology budget, pivot, collision, texture requirements, animation requirements and target runtime.
- Create reusable shape generators for organic-looking and hard-surface forms: profile extrusion, bevelled contours, lofts, lathe/revolve, curve sweeps, terrain meshes and configurable surface subdivision.
- Build coherent modular environment kits with shared scale, pivot conventions, snap increments and materials.
- Use reference images as guidance for proportions, palette, silhouette and composition; do not claim exact 3D reconstruction from one image without a supported reconstruction pipeline.
- Generate UVs/textures only through a validated pipeline; never reference nonexistent texture files.
- Validate mesh bounds, degenerate faces, normals, missing materials, excessive polygon count, invalid UVs where applicable, and actual loadability.
- Add asset thumbnails and an inspectable asset panel so users can see what is being made and reuse/edit it.
- Prefer real mesh geometry over giant groups of cubes; primitives remain appropriate for blockout and stylized low-poly games when that style is requested.

### 7.3 3D runtime and modeling architecture
- Prioritize a maintained web 3D engine adapter such as Three.js for scene composition, cameras, lighting, materials, glTF import, animation and profiling.
- Keep raw WebGL as a specialized low-level path, not the default for every complex 3D project.
- Separate scene generation from asset generation and gameplay code.
- Include lighting presets, environment/sky systems, shadow budgets, tone mapping, camera presets, post-processing tiers and low-end quality settings.
- Provide a quality selector (Performance / Balanced / Quality) that actually adjusts draw distance, shadows, post-processing, particles, mesh detail and texture resolution.
- Measure frame time, draw calls, triangles and memory proxies; use instancing and LOD where appropriate.
- Preserve a low-end mode and don't make all effects maximal by default. “More powerful” means better-looking and deeper games with measured performance, not an uncontrolled GPU/CPU load.

### 7.4 Asset QA
A 3D asset is accepted only when:
1. It loads in the target runtime.
2. Its materials and textures resolve.
3. Its scale, pivot and orientation are correct.
4. It has the expected visual silhouette and dimensions.
5. It stays within the selected quality budget.
6. It is referenced by a real scene/gameplay object.
7. The preview confirms it renders, and an artifact can be exported if export is promised.

## 8. Menus, UI and visual direction for generated projects

A professional builder must generate professional *products*, not just have a polished editor.

### 8.1 GENE workspace design
Study the best qualities of AI Studio, ChatGPT and Claude: low-friction conversation, visible artifacts, useful controls, strong hierarchy, a calm canvas, clear model choice and fast iteration. Do not copy their exact branding or pixels.

Proposed desktop layout:
- **Left rail:** Home, projects, assets, builds, settings; collapsible.
- **Project navigator:** files, routes/scenes, assets and versions, collapsible.
- **Center:** chat and task activity with a composer anchored at the bottom.
- **Pinned plan panel:** a stable artifact that never scrolls away with chat.
- **Preview pane:** resizable and minimizable; minimizing gives chat the reclaimed width, not an empty reserved column.
- **Inspector:** selected UI element, mesh, scene object or component properties.

Mobile layout uses a clear tab switcher for Chat / Preview / Files rather than tiny split panes.

### 8.2 UI system
- Original GENE visual identity: premium graphite/light surfaces, restrained atmospheric color, clean typography, controlled glass surfaces and clear spacing.
- First-class dark/light themes; persistent user choice.
- Clear hierarchy, readable labels, useful empty states and loading skeletons.
- No fake functionality, dead buttons, noisy micro-labels, random gradients or generic dashboard cards everywhere.
- Keyboard navigation, focus states, reduced motion and responsive layouts.
- Keep animation GPU-friendly and avoid constant background effects.
- Keep project title, route identity and plan placement stable during builds and after edits.

### 8.3 Generated game menus
Every game needs a genre-appropriate menu system, not the same generic title screen:
- Title screen with logo/title treatment, background scene and deliberate hierarchy.
- Play/Continue where meaningful, Settings, Controls, Credits when requested, and Quit/Back where the platform supports it.
- Save/load only when real persistence exists.
- Pause overlay with resume, restart, settings and return to menu.
- Game-over/victory screens with working retry/continue/next-level behavior.
- Difficulty, audio, sensitivity, graphics and input settings only when wired to actual runtime settings.
- Controller/touch navigation when that platform is targeted.
- Menu typography, motion, audio and background composition must match the game's genre and art direction.
- Never ship menu buttons that look interactive but do nothing.

### 8.4 Game visual identity
Create an art bible before content generation: palette, materials, shape language, lighting, environment mood, character scale, UI typography, effects and sound identity. Enforce it across menus, gameplay, HUD, assets and effects. Use authored asset kits and coherent composition rather than a scene filled with unrelated cubes.

## 9. Preview as an actual observability tool

The AI must have access to the actual candidate's observable state:
- Source revision and preview run ID
- Boot messages, first-frame event and readiness state
- Screenshot(s) at stable viewport sizes
- DOM/accessible-tree summary for apps
- Console and runtime errors
- Failed requests and missing asset paths where observable
- WebGL context/shader/render diagnostics
- Interaction-test results
- Current route/scene and input scenario

When repairing:
1. Reproduce the failure against the correct source revision.
2. Inspect screenshot plus console/DOM/runtime evidence.
3. Identify the smallest likely owning file/function/asset.
4. Apply a scoped patch.
5. Rebuild the candidate and repeat the failing test.
6. Keep the old preview if repair fails.

A preview is “rendered” only with first-frame evidence; “verified” only after required interactions pass. Never use the word “playable” just because a canvas element exists.

## 10. Clean building and patch engine

- All changes go through a typed patch contract with expected source hashes and stable file IDs.
- Apply a batch atomically to a candidate workspace; reject stale or ambiguous edits instead of guessing.
- Use file ownership and dependency edges to prevent conflicting parallel edits.
- For large features, create tasks per system: mechanics, content, UI, assets, tests, integration.
- After each task, validate changed files; after integration, validate the whole candidate.
- If a model hits an output limit, keep the checkpoint, split the patch and retry a smaller unit. Never save truncated output.
- If a final check fails, identify the failing contract, repair the owning area and rerun all dependent tests.
- Preserve the last-known-good project and allow version comparison, restore and export at any time.
- Avoid rebuilding every file for a small change. Track file hashes and regenerate only affected assets/modules.
- Add regression fixtures for the exact failure classes already seen in GENE.

## 11. Chat quality and collaboration

- Respond like a helpful technical partner: understand the goal, explain important choices, and avoid generic filler.
- Support discussion without triggering a build; explicit build/implement intent triggers changes.
- Maintain separate Plan, Build and Chat behavior. Plan mode proposes/revises a plan; Build mode executes accepted tasks; ordinary chat explains and answers.
- Keep the plan pinned in its own panel, never repeated after every message.
- Make “Continue” resume the current task; “Stop” cancel safely; “Change plan” update the artifact; “Fix preview” inspect evidence; “Undo” restore the prior checkpoint.
- Show progress as completed tasks over a stable plan revision, with blockers and test evidence. Never restart progress at 1/N without a visible new revision.
- Offer an expandable activity log; the chat itself should stay readable.
- Provide concise milestone summaries and detailed diagnostics on demand.
- Respect the user's chosen scope and preserve unrelated systems.

## 12. Performance and cost
- Lazy-load the preview editor, heavy 3D tools and source diff views.
- Debounce autosave and preview reloads; cancel obsolete work where safe.
- Use worker/background processing for expensive mesh generation and asset analysis.
- Cache successful asset builds and dependency resolution by source hash.
- Use compact context retrieval and bounded output budgets.
- Provide a project performance profile with runtime frame-time, bundle size, mesh/texture budgets and memory proxies.
- Make quality settings adaptive but user-controlled.
- Track per-mode latency, model calls, token-limit rate, repair success and cost.
- Do not claim unlimited five-hour autonomous work unless durable workers, quotas, storage and cancellation are genuinely implemented.

## 13. Cloud builds and release delivery
- Build records persist independently of browser tabs.
- Use idempotent target jobs, heartbeats, cancellation and bounded retry policy.
- Verify EXE/APK integrity, checksums, sizes, expected package identity and uploaded artifact availability.
- Report Windows and Android independently; preserve a successful artifact when another target fails.
- Label unsigned/debug builds accurately; production signing requires secure provisioned credentials.
- CI includes unit/contract tests, type checks, production build, browser smoke, generated app/game fixtures, preview telemetry, patch/length-limit tests, model-mode policy tests, and packaging verification.
- Promote only the tested commit; keep a known-good production rollback.

## 14. Implementation roadmap and release gates

### 1.6-A — Trust and stable state
- Atomic patching and output-length recovery.
- Final integration repair with last-known-good preservation.
- Version-specific preview handshake and first-frame proof.
- Watermark sanitizer and regression tests.
- Stable plan artifact, delta updates and pinned panel state.
- Correct build progress and task IDs.

**Gate:** no plan duplication; no false playable state; no truncated patch can damage saved source; provider watermark fixtures pass.

### 1.6-B — New workspace and selector
- New GENE design system and responsive layout.
- Plan/Build/Chat mode separation.
- Flash/Balanced/Thinking selector connected to real orchestration policies.
- Pinned plan, expandable activity and preview-minimize behavior.
- Dark/light parity and visual Playwright tests.

**Gate:** each selector mode has distinguishable tested policies; plan remains pinned; responsive UI and key flows pass.

### 1.6-C — Professional interview and planning
- Sequential interview tracks for apps, 2D, 3D and multiplayer.
- Structured requirements and acceptance criteria.
- Genre-specific design brief and dependency-aware task DAG.
- Plan revisions/history, prompt classification and safe build-time queueing.

**Gate:** the agent asks only useful next questions, remembers decisions and safely handles prompts during builds.

### 1.6-D — Genre-aware game creation
- Core-loop-first playable vertical slice.
- Genre playbooks and interaction tests.
- Real pause/menu/win/loss/restart behavior.
- Art bible and coherent environment/character/prop composition.
- 2D and 3D gameplay regression fixtures.

**Gate:** supported game genres pass launch, core controls, objective, failure/restart and completion tests.

### 1.6-E — Real modeling and 3D quality
- Better mesh generators, modular kits, material pipeline and asset browser.
- Three.js/high-level 3D adapter with glTF/GLB import where implemented.
- Lighting/camera presets, LOD and quality tiers.
- Mesh/runtime/export validation and profiler.

**Gate:** detailed assets load and render correctly, are used by the game, and remain within defined performance budgets. Unsupported rigging/export is clearly labeled.

### 1.6-F — Durable workers and production
- Persistent task/build records and resumability.
- EXE/APK validation and partial-success recovery.
- Complete evaluation suite and release scorecard.
- Production smoke, rollback and release manifest.

**Gate:** all required CI suites pass, preview/build status is evidence-based, and each advertised export target has a verified end-to-end path.

## 15. Evaluation suite
Maintain repeatable benchmark projects:
- Small utility app, multi-page dashboard, form-heavy app, settings page, auth/database demo with real configured backend, and targeted visual edit.
- 2D platformer, precision runner, top-down action, puzzle, survival loop, horror prototype and local multiplayer.
- 3D environment, vehicle/runner scene, modular building kit, imported glTF asset and detailed procedural prop.
- One-file fix, large-file patch, cross-file refactor, stale patch, truncated model output, final-step failure, blank preview, runtime exception, reload during build, quota failure, and partial EXE/APK failure.

Record source revision, prompt, selected GENE mode, actual provider/model, plan revision, changed files, test evidence, elapsed time, recovery attempts and final outcome. Track:
- First-pass and final-after-repair success.
- False-positive verified/playable claims (release target: zero in test suite).
- Primary-flow and core-loop pass rates.
- Preview first-frame success and time-to-first-frame.
- Unrelated-file churn and patch conflict rate.
- Output-limit recovery rate.
- Asset load/render success and mesh budget compliance.
- Visual design consistency and genre-specific quality scores.
- Verified EXE/APK success and partial-failure accuracy.
- Latency, token use and cost per accepted project.

Do not publish benchmark scores without the repeatable test setup and actual results.

## 16. Definition of GENE 1.6 “killer” release
GENE 1.6 is ready only when:
1. The model selector truly changes the orchestration and verification strategy.
2. Professional sequential interviews produce useful requirements without interrogation fatigue.
3. The plan is a pinned, versioned artifact updated by deltas, never resent wholesale with every prompt.
4. Complex game requests receive genre-specific design, mechanics, content, art direction and acceptance checks before implementation.
5. Modeling can create and validate more than primitive blockouts, and the UI accurately describes each modeling tier.
6. Generated menus and visible controls work.
7. The AI sees version-matched preview evidence and repairs against it.
8. Length-limit and final-stage failures preserve work and recover safely.
9. The workspace feels polished, calm, responsive and distinctly GENE.
10. Production and binary claims are supported by real test evidence.

**The defining promise:** GENE does not merely generate code. It designs the right thing, builds it in controlled pieces, observes the actual result, improves what is weak, and protects the project while doing so.
