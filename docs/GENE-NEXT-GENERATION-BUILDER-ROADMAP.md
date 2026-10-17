# GENE Next-Generation Builder — Post-2.0 Master Roadmap

**Status:** Proposed implementation roadmap; this document is a plan, not a claim that these features are already implemented.  
**Baseline:** `main` at `b2b2635a41ba3922eb592ac6f8b8c9cf27fd2aa9` (GENE 2.0).  
**Purpose:** Consolidate and supersede overlapping future-facing plans after the GENE 2.0 update. Existing plans remain historical/reference documents until their status is reconciled.  
**North star:** GENE should build substantial, coherent, polished, editable applications and browser games; research when needed; test what it creates; repair failures using evidence; and deliver a working project without pretending unverified work succeeded.

> No AI builder can guarantee zero defects or parity with every leading product. GENE's target is measurable competitiveness: better end-to-end task completion, game depth, visual quality, edit reliability, verification, research usefulness, and delivery reliability on a transparent benchmark.

---

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
