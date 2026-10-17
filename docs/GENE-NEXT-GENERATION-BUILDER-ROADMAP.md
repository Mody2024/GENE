# GENE Next-Generation Builder — Post-2.0 Master Roadmap

**Status:** Proposed implementation roadmap; this document is a plan, not a claim that these features are already implemented.  
**Baseline:** `main` at `b2b2635a41ba3922eb592ac6f8b8c9cf27fd2aa9` (GENE 2.0).  
**Purpose:** Consolidate and supersede overlapping future-facing plans after the GENE 2.0 update. Existing plans remain historical/reference documents until their status is reconciled.  
**North star:** GENE should build substantial, coherent, polished, editable applications and browser games; research when needed; test what it creates; repair failures using evidence; and deliver a working project without pretending unverified work succeeded.

> No AI builder can guarantee zero defects or parity with every leading product. GENE's target is measurable competitiveness: better end-to-end task completion, game depth, visual quality, edit reliability, verification, research usefulness, and delivery reliability on a transparent benchmark.

---

## Implementation ledger — 2026-10-17

This ledger distinguishes merged/production work from changes that are still under review. A completed CI run is evidence for the tested commit, not a claim that every roadmap phase is finished.

- **Release A — Trust & Measurement foundation:** partially shipped on `main` via PR #33. It introduced the post-2.0 master roadmap, initial cloud-build result validation, workspace quality checks, and the first GENE identity/design pass.
- **Release B — QA Engine and recovery hardening:** implemented in the draft PR #34 branch `feat/gene-cross-platform-file-integrity`. The current tested slice unifies portable file-path validation across AI output, workspace QA, the cloud build API and decrypted-source worker; validates every supported JavaScript module extension; preserves declared module load order; installs runtime error monitors before generated code; and repairs invalid/idle build recovery states. The tested head is `d73b3e30a373832722e7731c1bb2c997e5838bb9`, with passing GitHub Actions and a READY Vercel Preview. It is **not merged and not in Production**.
- **Release C — Agent/project understanding:** still planned. It must improve durable task context, incremental edits, repair evidence and resume behavior beyond the current coordinator safeguards.
- **Release D — Studio-grade games and app flows:** still planned. Real gameplay-depth, interaction, win/loss/restart/pause, and app-flow checks need automated evidence; static hooks and visible-render signals are not substitutes for full playtesting.
- **Release E — Research, durable worker and delivery:** still planned beyond the current cloud-worker path-safety checks. Research must fetch/ground/cite sources; long jobs must resume safely; and artifacts must be verified before being called deliverable.
- **Release F — Broader engines and workspace polish:** still planned. Do not advertise Phaser/Three.js/Godot/Unity/Unreal support until each adapter and its test/export pipeline actually exists.

**Production promotion policy:** keep intermediate work on Preview while phases are implemented and tested. Promote only after the intended release batch is complete, required CI checks are green, Production configuration is confirmed, and post-deploy health/API/browser smoke checks pass. Never describe the whole master roadmap as complete while Releases C–F remain planned.

## 0. Baseline truth and release discipline

The inspected repository is a Next.js 14 / React 18 / TypeScript application. GENE 2.0 documents free-tier provider routing, generated-source checks, procedural audio, SVG art generation, research references, adaptive game interviews/design documents, browser previews, project export, a local agent, primitive OBJ/MTL Forge output, and cloud packaging workflows.

Important boundaries that must remain explicit:
- The current browser builder is primarily a self-contained HTML/CSS/JavaScript builder for Canvas 2D and raw WebGL. A project manifest or prompt mentioning an engine does not mean a real Phaser, Three.js, Godot, Unity, or Unreal adapter exists.
- Static source checks, JSON validity, or a visible canvas do not prove that gameplay or app flows work.
- Browser-local project state is not equivalent to durable, cross-device cloud persistence.
- The staged build coordinator is not yet a fully durable remote worker that continues a long task after a tab closes.
- Research links and catalog lookups are not the same as a grounded research agent that fetches, verifies, synthesizes, and cites relevant source content.
- Electron/Capacitor wrapper workflows do not mean every project will produce a working installer/APK in every environment.
- Free model availability, quality, rate limits, and quotas change. Never promise unlimited free high-capability inference.

Before implementation, reconcile the existing roadmap names: main is called GENE 2.0 while the open Studio Forge draft PR describes a 1.6/1.7 sequence. Adopt one version policy and clearly label every capability as **implemented**, **experimental**, **planned**, or **unsupported**.

## 1. Product pillars

1. **A real project engineer:** understand intent, inspect the repository/project, plan dependencies, edit the smallest safe scope, execute tools, and recover from failure.
2. **A game studio workflow:** design a distinctive game, produce a playable vertical slice early, expand it with purposeful content, audio, UI, progression, saves, and an ending, then test the real loop.
3. **A professional app builder:** coherent responsive UI, meaningful interactions, routing, forms, validation, error/loading/empty states, accessible controls, and persistent data only when a real backend exists.
4. **Research that improves the build:** gather current, relevant facts and licensed assets; track source, license, attribution requirements, and freshness; incorporate findings into a concise project brief.
5. **Evidence-based quality:** run tests against acceptance criteria and keep the last known-good version when a candidate fails.
6. **A clean, trustworthy workspace:** fast, readable, responsive, keyboard-friendly UI with clear build progress, preview, source, assets, plan, logs, and export.
7. **Honest delivery:** export complete editable sources; distinguish tested artifacts from unverified or unavailable packaging targets.

## 2. P0 — Stabilize the foundation before expanding scope

### 2.1 Repository and architecture audit
- Compare `main` and open PR #18; identify useful changes, conflicts, regressions, duplicated implementations, and work that is only documented.
- Run the existing test suite and record a baseline with exact commands/results.
- Map every user action from UI to API, provider, generated file, preview, test, storage, and export.
- Reconcile README, ARCHITECTURE, capability API, UI labels, and roadmap claims against real code.
- Split oversized workspace and API modules incrementally into testable units. Do not rewrite working paths wholesale.

**Acceptance:** a checked-in capability matrix; a reproducible baseline; no documentation that describes planned behavior as implemented; all existing tests either pass or have explicitly tracked known failures.

### 2.2 Build contract and project state
Create a single typed project/build state model shared by UI and server:
- project kind, runtime/engine adapter, requirements, design brief, milestones, files/assets, dependencies, task ledger, checkpoints, test evidence, build artifacts, and failure diagnostics.
- Explicit states: `planning`, `building`, `previewing`, `testing`, `repairing`, `ready`, `partial`, `failed`, `blocked`.
- Every state transition has a validated owner and evidence. Never infer `ready` from file count or model prose.
- Separate immutable candidate builds from the last known-good build. Promote a candidate only after its required gates pass.
- Use project revisions and file hashes to reject stale responses and conflicting writes.

**Acceptance:** race-condition tests for concurrent chat/build/edit, cancellation, stale responses, refresh, import/export, and rollback.

### 2.3 Security and resilience
- Keep provider secrets server-side; redact secrets from logs and model context.
- Treat imported files, web research, package scripts, and generated code as untrusted.
- Restrict filesystem paths, file sizes, network access, tool permissions, execution duration, and artifact size.
- Require confirmation for destructive operations, publishing, installing dependencies with scripts, or other external side effects.
- Bound all retries and detect repeated identical failures; no infinite repair loops.
- Preserve recoverable checkpoints on timeouts and provider outages.

**Acceptance:** security regression tests, path traversal tests, timeout/retry tests, and no success state after a tool error.

## 3. P0 — GENE QA Engine: the highest-leverage capability

Build a shared verification pipeline, not a pile of heuristic checks.

### Pipeline
1. Validate project manifest, paths, required files, dependency declarations, and output schema.
2. Run language-aware parsing/type checks where available.
3. Start the actual preview/runtime in a controlled environment.
4. Collect startup errors, console errors, failed resource loads, unhandled exceptions, and runtime telemetry.
5. Capture screenshots and a DOM/accessibility summary for apps; capture screenshots and runtime/frame telemetry for games.
6. Execute acceptance tests specific to the project: routes, forms, keyboard/touch controls, main gameplay loop, objectives, win/loss, restart, save/load, and pause/resume where applicable.
7. Check performance budgets and obvious accessibility issues.
8. Produce an evidence report with each check marked **passed**, **failed**, **blocked**, or **not run**.
9. Send the minimal relevant evidence and source context to a repair step.
10. Re-run failed checks; promote only after required acceptance criteria pass.

### App QA
- Test primary routes and navigation.
- Exercise form validation, success/error states, loading and empty states.
- Check responsive layouts at representative viewport sizes.
- Verify keyboard navigation, labels, focus visibility, and accessible names for important controls.
- Do not mark backend/auth/payment features as real unless backed by a configured, tested service.

### Game QA
- Verify the game renders, controls respond, the core loop advances, and the objective can be completed.
- Test failure/restart paths and prevent soft locks where detectable.
- Verify sound controls, mute/volume settings, pause/restart cleanup, and audio event wiring.
- Test level/mission progression and full-game ending when the project claims a full game.
- Check frame-time/performance budgets on representative scenes; do not equate a visible canvas with a playable game.

**Acceptance:** each `ready` build has a machine-readable evidence report; the UI explains exactly what was tested and what remains unverified. Create intentionally broken fixtures to prove the QA engine detects them.

## 4. P1 — The reliable agent loop

Implement one dependable orchestrator before adding many agents.

### 4.1 Project understanding
- Build a lightweight project index: entry points, dependencies, routes/scenes, shared modules, assets, tests, configuration, and conventions.
- Retrieve only relevant files and summaries; update or invalidate index entries after edits.
- Distinguish user requirements, inferred defaults, decisions, constraints, current task state, and verified project facts.
- Preserve important decisions across model/provider changes and interrupted sessions.

### 4.2 Planning and execution
- Convert a request into milestones, dependency-aware tasks, changed-file scope, risks, and acceptance tests.
- Ask at most one blocking question at a time; infer low-risk defaults and support “choose for me.”
- Build a small playable/usable vertical slice first; keep it available while later milestones are built.
- Apply focused patches. Do not regenerate every file for a one-button change.
- Run tasks through typed tools that return actual outputs, exit codes, durations, and errors.
- Persist task state outside browser memory before promising resumability.
- Allow conversation and preview use during builds without stale state overwriting new changes.

### 4.3 Model and provider routing
- Separate product effort modes (Fast / Balanced / Deep) from provider model names.
- Maintain a server-owned registry of model capabilities, context/output limits, structured-output support, tool suitability, availability, and cost/quota class.
- Rank models using measured benchmark results, not model names or context size alone.
- Keep free-only policy if it remains a product requirement, but disclose quota/capability trade-offs and never promise unlimited availability.
- Fallback only to compatible providers. Record which provider actually handled the request.
- Test that effort modes genuinely change orchestration, planning, review, and verification policies.
- Use a second reviewer only where it improves measured outcomes enough to justify latency/quota.

**Acceptance:** provider outage, rate limit, malformed output, truncated output, unavailable model, and fallback tests; quality measured by task success rather than response fluency.

## 5. P1 — Professional game creation

### 5.1 Game design contract
Every game brief should define:
- genre/subgenre and target device;
- player fantasy and distinctive signature mechanic;
- controls and camera;
- core loop and objective;
- enemies/obstacles and purposeful behavior variation;
- levels/missions and progression;
- art direction, asset list, animation needs, lighting and VFX;
- audio direction and named gameplay/UI events;
- menus, settings, pause, failure, restart, save and ending;
- accessibility and performance budget;
- prototype acceptance tests and full-game acceptance tests.

### 5.2 Vertical slice then full game
- First build a genuinely playable vertical slice proving the hardest mechanic.
- Then expand using data-driven levels, missions, enemy patterns, encounters, dialogue, and progression—not just larger timers or duplicated filler.
- Keep systems modular: input, state, scene/level management, entities, combat/interactions, UI, audio, save data, content configuration, and telemetry.
- Use seedable deterministic fixtures where practical so gameplay bugs can be reproduced.
- For long projects, let users play the last good slice while later milestones continue.
- Let users approve major scope changes; avoid silently reducing requested scope to a tiny demo.

### 5.3 Runtime adapters
- Stabilize the existing Canvas 2D/raw WebGL route and its honest capability boundaries.
- Add Phaser for richer 2D games only after a complete adapter, preview loader, asset pipeline, tests, and export contract exist.
- Add Three.js for structured 3D scenes, cameras, lighting, materials, collision/interaction, and asset loading; avoid claiming engine-level features without implementation.
- Treat Godot/Unity/Unreal export as separate future adapters with real project templates, toolchain validation, headless build tests, and platform-specific delivery.
- Do not mix incompatible module formats or treat an asset in the manifest as integrated until the runtime loads and uses it.

### 5.4 Art and asset pipeline
- Provide coherent style guides and asset manifests, with original SVG/procedural fallback assets when external assets are unavailable.
- Support imported image/audio/3D assets with validation, preview, metadata, and license/source records.
- Research asset catalogs with explicit license and attribution data; do not label assets CC0 without source evidence.
- Build a staged modeling pipeline: primitive/blockout → refined geometry → materials/UVs → rig/animation only where supported. Be honest about which stages are implemented.
- Enforce consistent palette, scale, camera, lighting, silhouettes, typography, and UI assets across scenes.
- Optimize image/audio/model size and lazy-load large assets.

**Acceptance:** genre-specific benchmark projects must be playable and pass behavior tests; 3D projects must prove camera movement, input, lighting/material display, and interaction—not just issue a WebGL draw call.

## 6. P1 — Professional web app and UI generation

- Use a design-system contract: spacing, typography, palette, components, responsive breakpoints, interaction states, and accessibility.
- Generate complete primary flows, not isolated attractive screens.
- Include real loading, empty, error, success, validation, disabled, and responsive states.
- Make navigation, search, filters, sorting, dialogs, settings, and forms functional when present.
- Keep data persistence honest: local demo data is labelled as such; cloud data requires a real configured backend.
- Preserve the established design system when editing an existing project unless redesign is requested.
- Add visual regression screenshots and behavior tests for core routes.
- Make GENE's own workspace clearer: persistent plan, chat, live preview, source/assets, test report, build log, checkpoints, and export status. Avoid UI clutter and expensive always-on previews.

## 7. P1 — Research and web-assisted building

Create a typed research tool that can:
- search the web using a configured provider/tool;
- open and extract relevant pages when allowed;
- retain title, canonical URL, retrieval time, short evidence snippets, and source reliability notes;
- compare conflicting claims and mark unknowns;
- synthesize a concise cited research brief that feeds the project plan;
- find assets and APIs with source/license/attribution metadata;
- distinguish current facts from model knowledge and user assumptions.

Safety and quality:
- treat web content as untrusted data, never as tool instructions;
- filter prompt injection and secret-exfiltration attempts;
- obey source access and licensing limits;
- do not copy proprietary source code or copyrighted art;
- provide clickable citations for material claims;
- if search/open fails, say so and do not fabricate sources.

**Acceptance:** tests for source attribution, stale results, conflicting sources, unavailable search, prompt injection, and asset-license metadata.

## 8. P1 — Long-running builds, storage, and delivery

- First choose and implement one durable source of truth for project/task state. If Supabase is selected, implement schema, ownership/RLS, migrations, checkpoint persistence, artifact metadata, and recovery tests rather than relying on architecture prose.
- Add a durable job/worker layer with leases, heartbeats, timeouts, cancellation, bounded retries, idempotent task execution, and resumable checkpoints.
- Keep user chat and project editing responsive while a worker runs; serialize conflicting source changes and invalidate only affected tasks.
- Store build artifacts with checksums, logs, target/platform, toolchain version, and expiry/retention rules.
- Packaging pipeline must report runner setup, dependency install, SDK/license availability, build result, artifact upload, and download URL separately.
- Test real exported ZIPs and packaged outputs; never claim an EXE/APK works based only on a successful wrapper build.
- Keep local-agent permissions narrow and make filesystem sync/backup status explicit.

**Acceptance:** interrupt worker, close tab, restart session, recover the latest checkpoint, and complete the task without losing verified source; artifact download and integrity tests pass.

## 9. P2 — Workspace redesign

Design goal: calm, clean, light-first workspace; powerful but not futuristic/neon or cluttered.

Required areas:
- Left rail: projects, recent work, templates, settings.
- Main: chat and persistent plan/task timeline.
- Preview: responsive app/game viewport with device size controls.
- Inspector: source, assets, runtime console, test report, build artifacts.
- Clear states for planning/building/testing/repairing/ready/partial/failed.
- One-click restore to last known-good version; visible diff before accepting broad changes.
- Mobile-friendly navigation without sacrificing desktop productivity.
- Keyboard shortcuts, accessible labels/focus, useful empty states, and graceful network/loading behavior.

Do not prioritize cosmetic redesign above build reliability. UI elements must correspond to real behavior; remove or label unsupported controls.

## 10. Evaluation and competitive scorecard

Create a fixed, versioned benchmark suite with representative tasks:
- 5 web apps (dashboard, landing/product flow, searchable catalog, form workflow, multi-route responsive app).
- 5 games (platformer, arena action, puzzle, tower defense, 3D runner/arena where supported).
- 5 edits/repairs (broken handler, regression-safe UI change, multi-file feature, asset load failure, runtime bug).
- 3 research tasks (current factual research, asset discovery/licensing, conflicting sources).
- 2 delivery/recovery tasks (interrupted build recovery, ZIP/package integrity).

For each task record:
- task success against explicit acceptance criteria;
- first-pass success and total repair attempts;
- runtime/browser test results;
- visual review rubric and screenshot artifacts;
- regressions introduced;
- elapsed time, model/provider calls, token usage/cost where available;
- tool failures and unsupported capability handling.

Compare the same tasks on each release and, when feasible, on competing builders. Do not publish invented scores or compare unlike tasks. Optimize for successful outcomes per unit time/cost, not output length.

### Release gates
A release cannot be called competitive-ready unless:
- no known critical regression is left unexplained;
- all P0 security/state/build gates pass;
- at least 90% of mandatory deterministic tests pass, with zero critical security or data-loss failures;
- the benchmark score does not regress materially from the prior release;
- failed/blocked checks are visible and truthful;
- representative app and game builds pass real end-to-end acceptance tests;
- README and capability matrix match implementation.

The 90% figure is a minimum release gate for the deterministic suite, not a claim of 90% success on arbitrary user requests. The benchmark should be expanded as failures are found.

## 11. Implementation sequence

### Release A — Trust and measurement
1. Reconcile branch/PR/version status and establish baseline.
2. Add capability matrix and truthful build-state transitions.
3. Fix playable/ready claims to require runtime handshake and evidence.
4. Add end-to-end regression fixtures for app and game behavior.
5. Ensure candidate builds never overwrite the last known-good build on failure.

### Release B — QA Engine
1. Unified test evidence schema and run report.
2. Browser instrumentation and console/network error capture.
3. Playwright app interaction tests and game-control/objective fixtures.
4. Screenshot/DOM summaries and targeted repair input.
5. Performance budgets and regression gates.

### Release C — Agent and project understanding
1. Modularize agent API and workspace orchestration.
2. Project index and relevant-context retrieval.
3. Typed task ledger, incremental patch application, and diff review.
4. Real effort-mode/model routing evaluation.
5. Interrupted-task recovery and concurrency tests.

### Release D — Studio-grade games
1. Genre-specific design contracts and vertical slice gate.
2. Content-driven level/mission expansion.
3. Consistent art/audio/assets pipeline.
4. QA for controls, objectives, progression, saves, and endings.
5. Improve existing runtime, then introduce Phaser/Three.js adapters only with test coverage.

### Release E — Research, cloud worker, and delivery
1. Grounded web research with citations and source tracking.
2. Durable storage and task worker.
3. Resumable cloud packaging with real artifact verification.
4. Asset licensing/provenance and import pipeline.

### Release F — Workspace polish and broader engine targets
1. Refine the workspace around real capabilities.
2. Add visual regression and accessibility checks.
3. Add native engine adapters only after the browser-builder benchmark is stable.
4. Re-run full competitive scorecard before promoting the release.

Phases may overlap only when shared contracts and regression tests are already stable. Do not start every phase simultaneously.

## 12. Definition of done

GENE is ready for a major competitive release when a user can:
1. Describe a substantial app or game in natural language.
2. Get a concise, intelligent interview only where necessary.
3. Review a concrete plan with scope and acceptance criteria.
4. Receive a playable/usable early version quickly.
5. Continue building substantial content without losing earlier working features.
6. Ask for targeted changes while preserving project identity and state.
7. See actual test evidence, meaningful errors, and a clear repair process.
8. Research current facts and assets with traceable sources.
9. Export an editable, self-contained project and obtain only those binaries that the actual pipeline successfully built.
10. Refresh or resume work without losing verified progress.

The release is not done because a prompt was added, a file was generated, a new panel was designed, or a CI job passed once. It is done when representative end-to-end projects demonstrate the promised behavior.

---

# 13. Expanded GENE / Genie Master Plan — Reliability, Intelligence, Product Identity

This addendum expands the roadmap into a cross-cutting engineering programme. It is broader than a feature list: every major capability needs an implementation owner, observable behavior, failure handling, tests, and a truthful capability label. The sections below are proposed work, not claims of current implementation.

## 13.1 Product identity: the wish-to-working-product promise

**Brand idea:** GENE is inspired by a genie that helps turn a wish into something real. The product should feel like a capable, friendly creative workshop—not fantasy role-play, a generic chatbot, or a neon sci-fi dashboard.

### Product promise
A user describes what they wish to make, clarifies only the details that materially change the result, watches GENE turn that intent into a plan, gets a working first version, refines it safely, sees what was actually tested, and exports the result.

### Experience principles
- Translate a wish into a concrete brief, acceptance criteria, milestones, and a visible preview.
- Show progress as real work: understood → planned → building → running checks → repairing → ready / partial / blocked.
- Make the first successful result arrive early, then expand it without discarding what already works.
- Let users guide the direction without needing to become prompt engineers.
- Celebrate real milestones only; never fabricate success, game quality, test results, user counts, or achievements.
- Keep language warm, clear, concise, and respectful. Explain technical failures in plain language with a direct next action.
- Preserve creative intent: genre, art direction, tone, audience, controls, platform, accessibility needs, and approved constraints.
- Use a restrained genie-inspired motif: a small signature mark, a subtle swirl/flow motif, and a sense of transformation from wish to artifact. Avoid stereotypical caricatures, overused magic-lamp imagery, excessive sparkles, glowing gradients, or an unrelated futuristic aesthetic.
- Keep the default interface light, clean, readable, and fast. Use motion sparingly and support reduced motion.
- Design a coherent logo system, favicon, app icon, empty/loading/error states, documentation screenshots, and export branding. The logo must remain legible in monochrome and at small sizes.
- Store brand colors, typography, radii, shadows, spacing, icon style, and motion timings as design tokens, not arbitrary values duplicated across components.

### Product language
- **Ready:** required checks for the declared scope passed.
- **Partially ready:** some requirements passed, others are explicitly listed as incomplete.
- **Blocked:** an external dependency, permission, unavailable provider, or required user decision prevents progress.
- **Failed:** an attempted operation failed and has a diagnostic.
- **Not verified:** the feature or artifact has not been tested sufficiently.
Never use “done”, “perfect”, “production-ready”, “AAA”, “secure”, or “fully working” as decorative copy.

## 13.2 Full codebase health and defect-prevention programme

GENE needs a maintained defect ledger, not one-off debugging. Audit defects that exist today and plausible failure classes before large feature work.

### Required audit passes
1. **Repository map:** enumerate app routes, API routes, components, libraries, provider integrations, local-agent paths, storage layers, test suites, CI workflows, build/export paths, and environment variables.
2. **Call-chain tracing:** trace each important user action from UI → state → API → provider/tool → validation → preview → persistence → export.
3. **Contract consistency:** compare TypeScript types, runtime validation, API request/response schemas, prompts, UI states, capability matrix, docs, and tests. Identify duplicate or contradictory sources of truth.
4. **Complexity and ownership:** flag giant components, circular dependencies, duplicated logic, hidden global state, unsafe casts, swallowed exceptions, broad catch blocks, stale comments, dead code, and implicit cross-module contracts.
5. **Dependency audit:** inspect supported Node/package versions, lockfile consistency, abandoned or vulnerable dependencies, unnecessary bundle weight, transitive dependency risk, and license obligations. Upgrade incrementally with rollback points.
6. **Error-path audit:** test empty inputs, malformed JSON, missing files, wrong file types, oversized inputs, timeouts, provider 429/5xx, offline mode, partial provider output, invalid model output, corrupted storage, quota exhaustion, cancellation, refresh, tab close, and retry.
7. **Race and state audit:** concurrent generation and chat, rapid repeated clicks, stale responses, switching projects mid-build, editing files during generation, cancel/retry overlap, import during a task, and old preview versus new source.
8. **Boundary audit:** browser/server separation, secrets, filesystem access, network access, URL handling, HTML/JS execution, uploaded files, generated code, ZIP paths, archive expansion, and artifact downloads.
9. **UX failure audit:** inaccessible controls, misleading disabled states, lost unsaved work, focus loss, mobile overflow, blank screens, infinite loading, unclear provider errors, and controls that appear functional but do nothing.
10. **Release audit:** clean install, lockfile reproducibility, lint/typecheck/build/unit/integration/browser tests, artifact inspection, deployment smoke tests, rollback readiness, and documentation accuracy.

### Defect taxonomy
Track every issue with ID, severity, reproducibility, affected version/route, root cause, evidence, user impact, regression test, fix commit, and verification status.

- **S0 critical:** secret exposure, unauthorized data access, destructive data loss, arbitrary privileged execution, or release-blocking integrity failure. Stop rollout.
- **S1 high:** core build/export unavailable, projects corrupted, authentication/ownership bypass, persistent crashes, or false-ready status on important flows. Fix before release.
- **S2 medium:** major workflow broken with workaround, repeated state loss, severe accessibility/performance defect, or substantial visual regression.
- **S3 low:** cosmetic issue, minor friction, or non-critical copy/layout defect.

Do not downgrade severity to make a release look healthier. Security and data-loss findings need explicit closure evidence.

### Preventing regressions
- Every fixed bug should add the smallest stable regression test that reproduces it.
- Prefer targeted patches and small pull requests over sweeping rewrites.
- Require a before/after diff and impact summary for high-risk changes.
- Preserve a known-good candidate; make rollback a normal workflow.
- Run relevant tests after each logical change, then the full required suite before release.
- When the environment cannot run a test, label it **not run** and explain why; never report it as passed.
- Add static checks only where they provide a real guarantee; do not confuse source heuristics with runtime proof.
- Keep known limitations and accepted technical debt visible, with owners and review dates.

## 13.3 Upgrade GENE's brain: from prompt chain to engineering system

The brain is the whole system around the model—not just a stronger model or a longer system prompt. Improve it in layers so reasoning, context, execution, memory, and verification reinforce each other.

### A. Intent understanding and adaptive interview
- Parse requests into project type, target platform, audience, core outcome, constraints, must-have features, visual direction, content scope, and delivery expectations.
- Detect ambiguity that changes architecture or cost. Ask only high-impact questions; infer low-risk defaults and show them for correction.
- Offer a compact editable brief and acceptance checklist before expensive generation.
- Distinguish requirements from suggestions, assumptions, and future ideas.
- Detect contradictions early, such as online multiplayer without a backend or native export without a toolchain.
- Keep a project vocabulary/decision record so names, mechanics, routes, data models, and visual conventions stay consistent.
- Do not ask users to repeat information already available in the current project context.

### B. Planning and dependency reasoning
- Decompose work into ordered tasks with explicit dependencies, acceptance checks, expected outputs, and risk.
- Build a playable/usable vertical slice before broad content generation.
- Separate prototype scope from full-product scope and label both honestly.
- Estimate uncertainty as a range; never present model-generated time estimates as guarantees.
- Resolve expensive-to-reverse architectural choices before generation.
- Re-plan only affected tasks when requirements change; preserve completed verified work.
- Use a dependency graph with cycle detection, blocked-task propagation, bounded retries, and cancellation semantics.

### C. Repository/project understanding
- Index files, exports, component relationships, routes, data models, tests, asset references, and runtime entry points.
- Retrieve relevant code and conventions for each task; prioritize exact call sites and tests over dumping the entire repository into context.
- Track source hashes/revisions so a model cannot unknowingly overwrite a newer edit.
- Keep a concise living project summary, decisions, constraints, architecture map, known bugs, and current test status.
- Use symbol-aware or AST-aware navigation when available; use bounded text search transparently otherwise.
- Before editing, identify what must remain unchanged and which tests protect it.

### D. Execution and patch discipline
- Prefer minimal, typed, reviewable patches over rewriting whole files.
- Validate paths and patch preconditions; reject stale or ambiguous patch application.
- Apply changes transactionally to a candidate workspace, not directly to the last-known-good project.
- Run formatting, parsing, type checks, relevant tests, and preview checks appropriate to the language and task.
- Detect no-op edits, accidental duplicate code, unintended file deletion, broad formatting churn, and unrelated diffs.
- Make generated files, dependencies, and external side effects explicit.
- Use tool schemas and permission boundaries; never invent tool results or claim a command ran when it did not.

### E. Evidence-based self-repair
Implement a bounded diagnose → reproduce → hypothesize → patch → rerun loop:
1. Capture the actual failure and its environment.
2. Minimize the reproduction when practical.
3. Classify the failure: syntax/type, dependency, runtime, UI flow, gameplay logic, asset loading, persistence, packaging, permissions, provider, or environment.
4. Form a small number of testable hypotheses.
5. Apply the smallest targeted change.
6. Run the exact failing test plus related regression tests.
7. Compare logs, screenshots, and behavior before and after.
8. Accept the patch only if it resolves the issue without a new material regression.
9. If repeated attempts fail, preserve the candidate, report what was tried, and ask for the one decision or dependency that unblocks progress.

Safeguards:
- Limit repair attempts per failure and per task.
- Detect repeated identical stack traces and repeated ineffective patches.
- Do not weaken, delete, or mock out tests merely to get green.
- Do not silently remove a requested feature to pass a test.
- Check suspicious tests for vacuous assertions or tests that always pass.
- Separate test failure from environment/tool failure.
- Use independent acceptance checks where possible so the same model does not solely author and approve its own success criteria.

### F. Memory that helps without contaminating projects
Use scoped memory layers:
- **Conversation/task memory:** current request, decisions, open questions, and next actions.
- **Project memory:** architecture, design system, APIs, file map, naming, requirements, test status, and known limitations.
- **User preferences:** only explicitly useful preferences, editable and inspectable.
- **Build evidence:** immutable test logs, artifact checksums, screenshots, runtime errors, and commit/revision IDs.
- **Long-term knowledge:** general patterns and validated solutions with provenance.

Every memory entry needs scope, timestamp/version, source, confidence, and invalidation rules. Newer project facts supersede stale summaries. Never mix secrets or one project's private source into another project. Let users inspect, correct, clear, and export project memory.

### G. Model/provider routing
- Route tasks by measured ability, latency, context needs, tool support, cost, privacy, and availability—not brand names alone.
- Use deterministic fallback behavior for provider outages and malformed output.
- Validate model output against typed schemas before applying it.
- Track model/provider version, prompt/template revision, tool calls, retries, latency, and cost where available.
- Avoid endless fallback chains, hidden quota exhaustion, or silent downgrade presented as equivalent quality.
- Provide clear controls for speed/depth and explain when a selected mode cannot be honored.
- Keep API keys server-side and support user-owned keys only through a safe, explicit configuration flow.

## 13.4 QA Engine v2: test the product, not the appearance of success

### Test layers
- **Static:** path/schema checks, parser, formatter, lint, type checking, dependency checks, secret scanning, license/provenance checks.
- **Unit:** isolated functions, state transitions, parsers, project memory, patch application, build coordinator, storage migrations.
- **Integration:** provider adapters, API contracts, storage, asset pipelines, import/export, worker coordination.
- **Browser E2E:** real user flows in supported browsers and viewport sizes; console/network capture; screenshots; keyboard navigation.
- **Game E2E:** start/restart/pause, input, collision, objective progression, enemy/object behavior, death/failure, win/end state, saves/checkpoints, audio unlock/mute, scene transitions.
- **Visual regression:** stable reference screenshots, layout bounds, text clipping, theme tokens, major component geometry, and responsive breakpoints. Use tolerances for legitimate rendering variation.
- **Performance:** startup time, frame-time distribution, memory growth, long tasks, asset size, network requests, input latency, and cleanup after restart.
- **Security:** authorization boundaries, untrusted content, path traversal, unsafe URL handling, secret leakage, generated-code isolation, dependency and archive safety.
- **Recovery:** tab close, worker restart, cancellation, network drop, expired credentials, rate limit, corrupted checkpoint, partial artifact upload, and duplicate job delivery.

### Test report contract
Every report includes build/revision identifier and environment; acceptance criterion; status (passed / failed / blocked / not-run / inconclusive); exact command or interaction; relevant logs, screenshot, trace, or artifact checksum; concise diagnosis and linked repair attempt; timestamp and toolchain/provider version where available.

### Quality gates
- A file being present is not proof it loads.
- A canvas being visible is not proof a game is playable.
- A button being visible is not proof its action works.
- A green unit-test suite is not proof of security, usability, or production readiness.
- Promotion requires all mandatory gates for the declared target, or a clearly labelled partial result with missing gates listed.
- Keep deterministic checks stable and fast; quarantine flaky tests with a tracked reason and owner rather than silently ignoring them.

## 13.5 Game creation: raise depth, coherence, and playability

### Genre-aware production contracts
Create genre templates for platformer, action/adventure, puzzle, arena, strategy/tower defense, simulation, narrative, runner, racing, and supported 3D genres. Each template defines its core loop, input scheme, progression, failure/retry behavior, content units, enemy/obstacle patterns, accessibility options, performance budget, and required tests.

### Required game production ladder
1. **Design brief:** genre, audience, fantasy, mechanics, controls, art/audio direction, content scope, platform, and quality budget.
2. **Greybox:** movement, camera, collision, input, one objective, one failure path, and one success path.
3. **Playable vertical slice:** one polished representative section with functional UI, feedback, sound behavior, and restart.
4. **Systems:** reusable entity/state model, input abstraction, collision/physics boundaries, justified event system, scene/state transitions, configuration, save/versioning, and pause/resume.
5. **Content:** distinct levels/missions, meaningful progression, tuned difficulty, checkpoints, tutorialization, and an actual ending—not repeated copies presented as new content.
6. **Presentation:** consistent art direction, legible typography, responsive HUD, animation timing, layered audio, particles/VFX, transitions, feedback, and accessible options.
7. **QA and optimization:** playtest each level path, inspect collisions/spawns, test input edge cases, verify reset/save state, measure performance, and fix regressions.
8. **Delivery:** complete source/assets/licenses, run instructions, supported target notes, and verified export artifacts.

### Game systems that need explicit tests
- Fixed/variable timestep behavior and pause-safe timers.
- Input held/released state and focus loss.
- Collision boundaries, tunneling, spawn safety, and stuck states.
- Enemy state transitions, target selection, cooldowns, and cleanup.
- Objective completion, failure, retry, checkpoints, and ending.
- Seeded procedural generation when replay/debugging benefits from it.
- Inventory/economy/progression consistency when those systems exist.
- Save schema migration and corrupt-save recovery.
- Audio unlock, mute, overlapping sound limits, and cleanup.
- Scene transitions, resize, orientation, and low-performance fallbacks.

### 3D honesty and engine strategy
- Stabilize the existing Canvas 2D/WebGL browser pipeline first.
- Treat each future engine as a real adapter with project scaffolding, dependency management, preview/run, asset import, input, packaging, error capture, tests, and docs—not a prompt that merely mentions the engine.
- Add Phaser or Three.js only when the adapter passes a standard sample-project suite.
- Godot/Unity/Unreal native projects are separate targets requiring the correct runtime/toolchain and platform-specific build infrastructure.
- Distinguish greybox, procedural primitive, stylized generated asset, imported asset, and authored production asset.
- Keep materials, scale, lighting, animation, camera, and art direction coherent across the whole game.
- Do not promise large open worlds, AAA production, sophisticated physics, online multiplayer, or cinematic animation without supporting infrastructure and test evidence.

## 13.6 App creation: complete user journeys, not static dashboards

For every generated app:
- Define the primary user journey, user roles, data model, routes, validation, permissions, empty/loading/error/success states, and responsive breakpoints.
- Make every visible control functional or label it as a planned/non-functional mock.
- Add form validation, useful inline errors, loading/retry behavior, optimistic-update rollback where used, and safe duplicate-submit prevention.
- Model real authentication and authorization on the server; a client-side role flag or login screen is not security.
- Define whether data is local, session-only, synced, or server-persistent. Never imply cross-device sync without a real backend.
- Include accessible semantics, keyboard navigation, visible focus, contrast checks, reduced motion, and screen-reader labels.
- Test browser back/forward, deep links, refresh, empty data, malformed input, expired session, denied access, and narrow screens.
- Include seed/demo data only when labelled; do not invent real integrations or real customer records.
- Provide setup instructions, environment-variable documentation, migrations, and safe deployment notes when relevant.

## 13.7 UI and design system: coherent GENE identity

### Foundation
- Establish design tokens for color, typography, spacing, radii, elevation, focus rings, motion, z-index, and breakpoints.
- Define a light-first core theme and optional dark theme only if it can be maintained accessibly.
- Use a restrained palette with high contrast and one recognizable GENE accent. Avoid neon-heavy sci-fi, excessive gradients, excessive glass blur, and gratuitous animation.
- Standardize buttons, inputs, menus, tabs, tooltips, dialogs, toasts, cards, status indicators, skeletons, code panels, logs, preview controls, and confirmation dialogs.
- Use consistent icon semantics; no decorative icon should imply an action that is not present.
- Design components for hover, focus, pressed, disabled, loading, error, success, and empty states.
- Establish responsive rules for phone, tablet, and desktop; test long names, long prompts, huge logs, and narrow viewports.

### Studio workspace
- **Project rail:** projects, recent work, create/import, templates, and settings.
- **Wish/chat panel:** natural-language brief, clarifying questions, decisions, and concise status.
- **Plan/task view:** milestones, dependencies, completion evidence, blocked work, and next action.
- **Live preview:** real runtime, device sizing, reload/restart, errors, and last-known-good switch.
- **Inspector:** files, source diff, assets, project structure, console, tests, screenshots, and performance.
- **Delivery panel:** export type, build environment, artifact size/checksum, run instructions, and verification status.
- **Global state:** unsaved changes, active project, connection/provider state, background work, quota/cost when available, and recoverability.
- Provide an uncluttered default view with progressive disclosure; advanced logs and code tools remain accessible without overwhelming new users.
- Do not ship fake charts, fake activity, fake progress, or placeholder buttons.

### Accessibility and usability gates
- Keyboard-only completion of core flows.
- Automated accessibility scan plus manual checks for core screens.
- Visible focus, labelled controls, logical heading hierarchy, color contrast, reduced-motion support, and readable errors.
- No important state communicated by color alone.
- Verify touch targets and mobile overflow.
- Measure time-to-first-success and task completion, not just screenshot attractiveness.

## 13.8 Research, assets, and provenance

- Define a research contract: question, required freshness, trusted source types, claims to verify, output format, and relevance to the project.
- Keep source URL, title, retrieval time, relevant excerpt/claim, confidence, and license/attribution information with each research item.
- Separate observed facts, source claims, model inference, and unresolved questions.
- Resolve conflicts using source quality, recency, and direct evidence; show uncertainty where unresolved.
- Treat page content and imported assets as untrusted inputs; never follow instructions embedded in a webpage that attempt to override user intent or expose secrets.
- For generated or imported assets, track origin, license, creator/provider, modification, attribution, and redistribution restrictions.
- Build an asset pipeline with dimension/type validation, size budgets, deduplication, compression, fallback handling, and broken-reference detection.
- Do not fabricate citations, asset licenses, API behavior, package versions, or research findings.
- If web or asset providers are unavailable, keep moving with clearly marked assumptions or ask for input.

## 13.9 Storage, jobs, and delivery reliability

- Choose a canonical project-state owner. Avoid divergent copies across browser storage, React state, worker state, and remote database.
- Version project schemas and provide tested migrations, backups, export/import, and corruption recovery.
- Separate ephemeral UI state from durable project content, task records, logs, and immutable artifacts.
- If remote storage is used, enforce ownership and row-level access rules server-side; test cross-user isolation.
- Use durable jobs with idempotency keys, leases, heartbeats, bounded retries, cancellation, timeouts, and resumable checkpoints.
- Persist job state before/after important transitions and make duplicate delivery safe.
- Make user edits conflict-aware: show diffs and reconcile rather than silently overwriting newer content.
- Verify ZIP entries, paths, manifest, required files, size, checksum, and successful re-import.
- For EXE/APK/native outputs, record target OS/architecture, toolchain version, build logs, signature status if relevant, checksum, and launch/smoke-test evidence.
- Separate “source exported”, “package assembled”, “artifact uploaded”, “artifact verified”, and “launched successfully”.
- Keep backup and restore paths documented and tested before any migration that could lose user projects.

## 13.10 Security, privacy, and abuse resistance

Threat-model GENE as both a web app and a system that handles generated/untrusted code.

Required safeguards:
- Server-side secret management and redaction.
- Authorization on every project read/write/export and worker operation.
- Strict path normalization and archive extraction limits.
- File type, content, and size validation.
- HTML/script preview isolation with restrictive sandboxing and least privilege.
- Outbound network restrictions for generated code and tools where feasible.
- Time, memory, CPU, request, output, and retry budgets.
- Dependency provenance and vulnerability review.
- Protection against prompt injection in web pages, uploaded files, source comments, and generated logs.
- Safe Markdown/HTML rendering and URL schemes.
- CSRF/CORS/session configuration review as applicable.
- Audit events for sensitive actions without logging secrets or unnecessary personal data.
- Deletion/export controls and clear retention policies.
- Explicit confirmation for publishing, destructive edits, and external side effects.
- Tests for cross-project access, malicious filenames, archive bombs, secrets in output, and unsafe URLs.

Never run arbitrary generated code with the privileges of the application server. Use a disposable, permission-limited execution boundary when code execution is necessary. Document residual risks where complete isolation is unavailable.

## 13.11 Performance, reliability, and low-resource operation

- Set budgets for first render, time-to-first-preview, preview reload, memory growth, source bundle, asset payload, and background worker resource use.
- Avoid rendering the entire project tree or huge logs on every keystroke; virtualize large lists and debounce expensive searches.
- Keep the main UI responsive while generation, tests, asset processing, or exports run.
- Lazy-load heavy editors and preview-only tools; avoid multiple always-running previews.
- Add cancellation and cleanup for timers, event listeners, audio nodes, WebGL resources, workers, object URLs, and temporary files.
- Test slow networks, small screens, low memory, browser refresh, provider latency, and degraded services.
- Cache only with explicit invalidation rules; never serve stale project state as current.
- Use bounded logs and checkpoint retention with a visible cleanup policy.
- Prefer cloud execution for heavyweight native builds when configured, while keeping local authoring and preview lightweight.
- Offer a clear fallback when browser APIs or hardware acceleration are unavailable.

## 13.12 Observability and operations

- Use structured, correlated events for project ID, build ID, task ID, revision, provider, and tool operation—without logging secrets or raw private content unnecessarily.
- Measure first-preview time, end-to-end success, repair success, retries per task, regression rate, build cancellation, crash rate, export verification, and provider failure rate.
- Separate user-visible diagnostics from internal debug traces.
- Add error boundaries and meaningful recovery actions to the UI.
- Alert on spikes in failed builds, data loss, authorization errors, queue delays, and provider outage.
- Define incident response: stop rollout, preserve evidence, disable risky feature, restore last-known-good, communicate impact, fix, and add regression coverage.
- Track latency and cost per successful verified task rather than optimizing raw generated-token volume.

## 13.13 CI, release engineering, and repository hygiene

For every meaningful PR, run applicable checks in increasing cost order:
1. Formatting/lint and schema checks.
2. Unit tests for touched modules.
3. Typecheck.
4. Integration tests.
5. Production build.
6. Browser smoke and representative end-to-end tests.
7. Security/dependency and artifact checks where applicable.

Additional rules:
- Keep PRs focused and reviewable; avoid bundling brand redesign, storage migration, and runtime rewrite into one change.
- Require an implementation note for capability-affecting changes.
- Pin dependencies and keep lockfiles consistent.
- Use preview deployments and test real flows, not just the homepage.
- Never merge based only on green CI if checks do not exercise changed behavior.
- Maintain release tags, migration notes, rollback instructions, and compatibility notes.
- Compare main and draft PR #18 before cherry-picking or merging its work; resolve version/capability contradictions first.
- Keep secrets out of source, issue comments, screenshots, logs, and generated fixtures.
- Label each capability as implemented, experimental, planned, pipeline-dependent, or unsupported.

## 13.14 Benchmarking and competitive improvement loop

Maintain a versioned suite that tests the complete engineering loop, not just single-turn generation:
- New app/game from a brief.
- Continuing a multi-step project over multiple turns.
- Targeted edit that must preserve unrelated features.
- Reproduction and repair of a known bug.
- Ambiguous request that needs a small interview.
- Malformed model response/provider outage.
- Stale concurrent response and cancellation.
- Malicious imported content/prompt injection.
- Broken asset or dependency.
- Responsive UI/accessibility task.
- Project export and re-import.
- Interrupted task recovery.
- Research with conflicting sources and provenance.
- Unsupported engine/platform request that must be honestly scoped.

Score each task with a fixed rubric: acceptance criteria, runtime evidence, visual quality, regression count, recovery success, time, cost, and contract compliance. Record exact GENE version, model/provider, prompt revision, test environment, and dataset version. Re-run after changing prompts, models, tools, schemas, or orchestration. Avoid tuning to a tiny benchmark; add unseen holdout tasks and human review of visual/gameplay quality.

## 13.15 Expanded delivery phases and exit criteria

### Phase 0 — Truth and inventory
- Reconcile main, roadmap docs, draft PR #18, version labels, and capability claims.
- Run or document baseline checks with exact outputs.
- Publish the capability matrix, defect ledger, dependency map, and top-risk register.
- **Exit:** the team knows what exists, what fails, and what is merely planned.

### Phase 1 — Stop regressions and false success
- Define typed build/test report contracts.
- Enforce valid state transitions and distinguish partial/blocked/not-run.
- Protect last-known-good builds and reject stale writes.
- Add focused tests for cancellation, stale responses, storage failures, and success claims.
- **Exit:** no critical path reports ready without required evidence.

### Phase 2 — Runtime QA and self-repair
- Instrument browser preview, console, network, screenshots, and interaction traces.
- Add representative app/game end-to-end suites.
- Feed structured diagnostics into bounded repair attempts.
- **Exit:** seeded failures are detected, repaired when in scope, and regression-tested.

### Phase 3 — Brain and repository understanding
- Add project index, task ledger, requirement traceability, scoped memory, and minimal patches.
- Add provider-routing telemetry and output schema validation.
- **Exit:** multi-turn edits preserve approved requirements and avoid unrelated regressions on benchmark tasks.

### Phase 4 — Game/app production depth
- Stabilize genre templates, vertical-slice gates, reusable systems, content expansion, app flows, asset provenance, and performance budgets.
- **Exit:** each supported template has a representative end-to-end sample with repeatable tests.

### Phase 5 — Secure durable execution and export
- Implement durable storage/worker only after the state contract is stable.
- Add recovery, authorization, artifact integrity, export/import, and native packaging checks.
- **Exit:** interrupted tasks recover and exported artifacts pass integrity and launch checks for declared targets.

### Phase 6 — GENE visual identity and workspace redesign
- Apply the tokenized light-first design system and genie-inspired identity to real working screens.
- Replace misleading/unused controls and improve responsive/accessibility behavior.
- **Exit:** core user tasks pass keyboard, mobile, and visual regression review.

### Phase 7 — Broader engines and advanced capabilities
- Add an engine/runtime only with a complete adapter, tests, docs, and sample project.
- Evaluate multiplayer, cloud collaboration, advanced 3D assets, native packaging, and other major scope only when infrastructure and demand justify them.
- **Exit:** new capability passes the same benchmark and reliability gates as existing capabilities.

### Phase 8 — Ongoing quality operations
- Run regression benchmarks continuously, track known issues, dependency updates, performance budgets, provider drift, and production incidents.
- **Exit:** quality remains stable across releases, not merely on launch day.

## 13.16 Release checklist — mandatory, not aspirational

- [ ] Scope and capability labels match actual implementation.
- [ ] All known S0 issues are closed and S1 issues are closed or release-blocked.
- [ ] Project data is backed up and migration/rollback has been tested where applicable.
- [ ] No false-ready status can occur on tested critical paths.
- [ ] Required unit/integration/type/build/E2E checks have recorded outcomes.
- [ ] Test reports distinguish failed, blocked, inconclusive, and not-run.
- [ ] A representative app and game have been built, interacted with, and regression-tested.
- [ ] Generated patches preserve unrelated working behavior on the benchmark.
- [ ] Preview and generated-code boundaries have passed security checks.
- [ ] Asset and research provenance are traceable.
- [ ] Export artifacts pass integrity checks and are labelled according to actual verification.
- [ ] Responsive UI, keyboard access, and core accessibility checks have been reviewed.
- [ ] Performance budgets are measured on declared target environments.
- [ ] Changelog, known limitations, and recovery instructions are accurate.
- [ ] No test was weakened or removed solely to make the release pass.

## 13.17 How to work the plan without creating a giant risky rewrite

The roadmap is deliberately broad; implementation must remain incremental.
- Begin with Phase 0, not a cosmetic rewrite or another giant prompt.
- Select one measurable vertical slice at a time.
- Read affected source and its callers before changing contracts.
- Add a regression test before or alongside a bug fix.
- Keep changes small enough to review and revert.
- Run checks and report exact results honestly.
- Do not implement every proposed system in parallel.
- Promote only verified code; keep unfinished work in focused draft PRs.
- Update the defect ledger, capability matrix, benchmark, and docs whenever behavior changes.
- Revisit priorities using measured failures, user impact, reliability, cost, and implementation effort—not feature count.

**Ultimate definition of success:** GENE behaves like a reliable creative engineer inspired by a genie: it understands the wish, plans the work, builds a real result, tests it in its actual environment, fixes evidenced failures safely, preserves the user's progress, explains limitations clearly, and delivers only what it can substantiate.
