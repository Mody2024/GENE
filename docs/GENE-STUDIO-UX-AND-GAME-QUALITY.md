# GENE Studio UX and Game Quality Expansion

This document extends the GENE overhaul plan with product and interaction ideas. These are proposals, not claims of implemented behaviour. Build them incrementally after the reliability and workspace foundations.

## Product principles

- Minimal, slim, light-first interface; compact typography and spacing; subtle borders; no oversized decorative AI cards, neon, or gratuitous animation.
- Powerful capabilities should remain discoverable without putting every control on screen.
- The conversation is a control surface, not the whole product. Show relevant previews, diffs, assets, tasks, and test evidence inline.
- Never show fake progress, fake previews, invented files, or unsupported completion claims.
- Support keyboard, mouse, touch where appropriate, accessibility, and reduced motion.
- Autonomous and interactive modes use the same tools and validation pipeline.

## 1. Adaptive design interview

Use a progressive, context-aware interview rather than a long static questionnaire.

1. Parse the user's request into a draft game brief: genre, player fantasy, platform, camera, art direction, core loop, scope, and constraints.
2. Show a compact editable brief with sensible defaults and clearly marked assumptions.
3. Ask only high-impact questions whose answers change architecture, gameplay, art pipeline, or delivery target.
4. Offer visual choice cards for subjective decisions (camera, mood, palette, control style) only when an image/preview helps. Each choice must be actionable and keyboard-accessible.
5. Allow "surprise me", "use defaults", and "start building now" at any time.
6. Ask at most one or two important questions per round; defer low-impact details to sensible defaults.
7. Before major work, present a concise plan, target platforms, expected limitations, milestones, and acceptance criteria.
8. In interactive mode, ask approval at configured checkpoints. In autonomous mode, proceed within user-authorized scope and stop only for safety, missing credentials, destructive actions, or a genuinely blocking decision.
9. Save the brief and decisions as versioned project memory; users can revise them without restarting the project.

Example questions (ask only when relevant):
- Is the main fun about movement, building, combat, exploration, strategy, or story?
- Browser, downloadable PC, or both?
- 2D, 2.5D, or 3D; fixed camera, side view, top-down, first-person, or third-person?
- Stylized, pixel art, low-poly, hand-painted, or realistic?
- Solo first, local co-op, or online multiplayer?
- What is the smallest playable version that would feel fun?

## 2. Visual conversation and proof of work

- Inline cards for plans, file diffs, generated assets, playable previews, screenshots, test evidence, exports, and deployment status.
- Every card opens the relevant project artifact or log; actions such as apply, reject, compare, retry, and revert must work.
- Use before/after image comparisons for visual changes and show the exact changed files beside them.
- Let the user comment on a screenshot or select a scene/object and say "make this darker", "move this door", or "fix this collision". Convert selection context into a scoped edit.
- Show streaming activity as concise stages (planning, editing, building, testing), with a detailed log available on demand.
- Clearly distinguish model output, tool execution, verified results, and assumptions.
- Keep preview state isolated per run; preserve the last-known-good playable preview while a candidate build is tested.
- If preview execution is unavailable, show why and offer logs or an export rather than a fake live preview.

## 3. Slim Studio layout

Suggested default workspace:
- **Top bar:** project switcher, current run state, mode selector, undo/checkpoint, export.
- **Left rail:** projects, files, scenes, assets, search, and tools; collapsible.
- **Center:** game preview or editor, with tabs for preview, scene, code, assets, and tests.
- **Right panel:** Gene chat and contextual inspector; collapsible and resizable.
- **Bottom activity strip:** tasks, console, build/test results, and performance; expands only when needed.
- **Command palette:** one shortcut to find files, switch scenes, run tests, export, change modes, and invoke tools.
- **Focus mode:** hide nonessential panels and show the current task/preview.
- **Responsive mobile mode:** conversation, task monitoring, approvals, and preview review; don't pretend a phone is a full desktop engine editor.

Use restrained motion, consistent spacing, clear focus states, accessible contrast, and user-selectable light/dark themes without neon as the default. Avoid rebuilding the whole UI at once; test the information architecture with existing users and preserve useful flows.

## 4. Game Design Intelligence

- Create a design brief and a one-page game design document before substantial generation.
- Define a core loop and a playable vertical slice before scaling content.
- Maintain a game-specific design bible: movement feel, camera, art rules, color palette, UI language, world rules, character silhouettes, sound direction, and progression.
- Use genre-specific recipes as building blocks, not fixed templates. Combine and adapt them to the brief.
- Track mechanics and scene patterns used in the current project; flag repetitive or irrelevant choices and propose alternatives.
- Use a design comparison stage that explains trade-offs and checks that the chosen direction satisfies the brief.
- Generate original genre-inspired games, not exact copies of proprietary games, maps, characters, or assets.

## 5. Asset and world pipeline

- Asset registry with source, license/provenance, format, dimensions, scale, dependencies, and where each asset is used.
- Separate procedural geometry, imported assets, generated images/textures, and specialist 3D-model outputs.
- Validate mesh scale, normals where available, collision, material references, texture sizes, missing assets, and runtime usage.
- Establish a scene composition pass for lighting, camera framing, visual hierarchy, readable silhouettes, and navigability.
- Support placeholders only as explicit temporary assets, tracked in an unfinished-assets list.
- Keep rigging, animation generation, high-fidelity organic models, and image-to-3D behind capability gates until supported tools and tests exist.

## 6. Gameplay quality loop

1. Generate a small playable slice.
2. Run static checks and engine/browser validation.
3. Exercise real controls and verify observable game-state transitions.
4. Capture screenshots and gameplay recordings where infrastructure supports it.
5. Test objective completion, failure, restart, save/load, and important edge cases.
6. Inspect console, build logs, performance, and asset references.
7. Repair only identified failures; rerun failed checks plus regression tests.
8. Compare output against acceptance criteria and a last-known-good checkpoint.
9. Report evidence and remaining gaps.

A successful compile alone is not proof that a game is fun or complete. Use automated checks for correctness and performance, and human review/playtesting for feel, visual quality, and originality.

## 7. Playtest agent and critique modes

- Add a bounded playtest agent that uses available inputs to attempt objectives and detect obvious blockers, dead ends, broken controls, unreachable areas, and save failures.
- Add distinct review passes: gameplay designer, level designer, visual/art director, performance engineer, accessibility reviewer, and QA tester. These can be sequential prompts with shared context rather than expensive simultaneous agents.
- Require each reviewer to provide evidence, severity, reproduction steps, and a suggested fix.
- Avoid self-scoring as proof. Independent deterministic tests and human playtests remain necessary.

## 8. Project memory and collaboration

- Store approved requirements, design decisions, scene maps, architecture, known bugs, benchmark outcomes, and unfinished work as versioned project memory.
- Track file/scene ownership per active run and use project revision checks to prevent concurrent runs overwriting each other.
- Support task handoff and resume with a concise checkpoint: goal, completed work, changed files, tests run, known failures, and next action.
- Add compare branches or snapshots for risky design experiments.
- Keep secrets, private keys, and unrelated personal context out of project memory and model prompts.

## 9. Quality of life

- "Start now" bypasses optional interview questions and begins with safe defaults.
- "Surprise me" lets GENE choose a coherent original direction within stated constraints.
- "Make it playable first" prioritizes mechanics over polish.
- "Polish this" runs a scoped visual/gameplay critique and proposes changes before applying risky edits.
- "Explain this scene/file" gives a concise explanation tied to actual project artifacts.
- "Undo the last change" restores a verified checkpoint or reverts the exact diff.
- "What is still broken?" lists known failing tests and unverified capabilities.
- "Export my game" shows available targets and explicitly labels unsupported ones.
- Quick feedback on generated screens/assets helps the system learn project-specific preferences without silently changing global settings.

## 10. Rollout order

1. Add the game brief, progressive interview, and concise assumptions to the existing chat flow.
2. Make task states, stop controls, diffs, logs, and truthful evidence visible.
3. Add the slim workspace shell and contextual preview cards.
4. Add project design bible and asset manifest.
5. Add automated playtest scenarios and screenshot comparison where supported.
6. Add specialized review passes and richer scene/object-directed edits.
7. Validate the interface with actual workflows before broad visual refactoring.

## Acceptance criteria

- A user can start immediately without answering a long questionnaire.
- Interview answers materially alter the generated brief and acceptance tests.
- Autonomous and interactive modes share the same project state and quality checks.
- Visual cards open real artifacts and every offered action is functional.
- The last-known-good preview survives a failed candidate build.
- File/asset changes show diffs and can be reverted.
- Test reports separate passed, failed, unsupported, and not-run checks.
- UI remains usable with panels collapsed, keyboard navigation, and narrow screens.
- No claim of fun, originality, 3D modelling, multiplayer, native export, or successful testing is made without appropriate evidence.
