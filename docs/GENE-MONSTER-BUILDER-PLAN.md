# GENE Monster Builder — Product, Reliability, Intelligence & Design Plan

Status: implementation blueprint for the next major GENE release after GENE 1.5 Flash  
Branch: `feat/gene-monster-builder`  
Primary principle: **GENE must prove what it built, preserve what already works, and recover without losing work.**

This plan is intentionally more ambitious than a UI refresh. It describes how GENE should evolve into a serious AI builder for web apps, websites, and browser games while keeping every claim tied to evidence. Absolute zero failures cannot be guaranteed by any model or build service; the product goal is to prevent known failure classes, catch regressions before promotion, recover automatically when safe, preserve last-known-good files, and explain the remaining limitation when a check cannot run.

## 0. Repository baseline and truthful boundaries

The inspected production branch is `main` in the private repository `Mody2024/GENE`. Its latest recorded production-release CI run on 2026-10-12 passed the contract tests, production build, and Playwright browser suite. That is a useful baseline, not proof that all generated projects or EXE/APK builds succeed in every environment.

Current implementation already includes:
- Next.js 14 / React 18 / TypeScript, a chat-centric workspace, dark/light theme variables, project list, source editor, live iframe preview, plan/build modes, sequential interview contract, and a compact model/thinking selector.
- A Gemini-first server route with optional Groq/OpenRouter fallback keys, bounded request time, output-token/truncation handling, structured response parsing, source validation, a best-effort independent reviewer, and generated-source contracts.
- One-file-at-a-time initial build stages, retry/repair loops, checkpoints, a source patch helper, a current project specification, and a final assembly validation request.
- Browser-local project storage, version snapshots, source ZIP export/import, preview/play route, preview telemetry, and a local agent that can sync a project to disk.
- Raw Canvas 2D and raw WebGL project output plus GENE Forge primitive-composed OBJ/MTL output.
- GitHub Actions CI and cloud Windows Electron installer / Android Capacitor debug APK packaging.

The repository also documents important limits:
- Project/chat storage is currently browser-local rather than durable cloud storage.
- The browser builder is not yet a persistent remote worker that can reliably work for hours after a tab closes.
- A successful static contract check or visible canvas does not prove every objective, enemy, form, route, or save flow works.
- Canvas 2D/raw WebGL are the currently validated runtime targets. Phaser/Three.js, Godot/Unity/Unreal project export, rigged high-fidelity assets, online multiplayer infrastructure, signed production binaries, and native engine builds must not be advertised until their adapters exist and are tested.

### Concrete findings that motivate this plan

1. `apps/web/app/page.tsx` contains roughly 2,000 lines of workspace state, model orchestration, preview, export, packaging, and UI logic. This makes changes hard to isolate and can let preview/chat/build state become inconsistent.
2. `apps/web/app/api/agent/route.ts` contains almost 900 lines covering providers, retries, response contracts, patching, and runtime/source validation. It should be split into testable server modules.
3. The initial builder can set the project preview state to `playable` when the core files have been generated and the preview key is changed. File presence is not first-frame evidence. The preview needs an explicit boot/first-render handshake before it may display a verified-playable state.
4. The model primarily receives prompt, history, project files and telemetry; it does not consistently receive an authoritative screenshot/DOM summary from the actual live preview. It therefore may be asked to repair a preview it has not actually observed.
5. Prompt instructions already prohibit unrequested provider watermarks. A prompt alone is not an enforcement mechanism, so exact common attribution/watermark phrases need a deterministic output scrubber and a regression test, with an opt-out only when the user explicitly requests branded attribution.
6. Initial builds are staged, but some edits still ask a model to return complete replacement files. Large source files and multi-file edits can therefore hit output limits, return truncated JSON, or waste tokens recreating unchanged code.
7. The cloud build workflow makes real EXE/APK artifacts, but output reliability depends on secrets, runner provisioning, package registries, SDK licensing, uploads, and result publication. Each of those boundaries needs explicit evidence and recoverable status.

## 1. Product principles

### 1.1 What “monster builder” means

GENE should be exceptional at six things:
- **Intent understanding:** understand the goal, infer reasonable defaults, ask one important question at a time, and remember decisions.
- **Planning:** break ambitious work into dependency-aware milestones with file ownership, assets, risks, and measurable acceptance checks.
- **Creation:** generate coherent UI, architecture, mechanics, content, and art direction—not merely long source files.
- **Editing:** make small, reviewable changes to the existing project without resetting the title, design, controls, or features.
- **Verification:** run the generated project, inspect the real preview, exercise user flows, and distinguish static checks from executed tests.
- **Recovery:** keep known-good state, diagnose the actual failure, retry only the smallest affected unit, and provide useful failure reports.

### 1.2 Non-negotiable rules

- Never claim source changed, a test passed, a preview works, a build finished, or a deployment succeeded without tool/action evidence.
- Never replace a known-good preview with an unverified candidate.
- Never treat “the model returned JSON,” “the JavaScript parses,” or “a canvas exists” as proof that the project works.
- Never fake login, payments, multiplayer, database persistence, assets, or successful packaging.
- No provider attribution, watermarks, “made with Gemini,” fake AI footers, or generated-by badges in the user's product unless that attribution was explicitly requested.
- Do not generate binaries, engine project formats, or features that the configured pipeline cannot actually produce.
- Keep the app lightweight and responsive on midrange and weak devices. Load expensive previews and tools only when needed.
- Make the result editable, exportable, and recoverable from a browser refresh.
- Make every retry bounded. If a deterministic compiler/source issue persists, change the diagnosis or ask for a decision instead of retrying the same prompt endlessly.

## 2. Lessons from the current Claude and Google AI Studio experience

These are capability and workflow patterns to learn from—not branding, layouts, wording, or code to copy.

### Claude: intelligence and long-horizon execution

Anthropic's current 5.5 family, announced through October 7, 2026, illustrates a tiered approach:
- **Opus 5.5** is positioned for complex coding, large-codebase audits/migrations, long-running agent work, careful judgment, coordination and self-verification.
- **Sonnet 5.5** targets everyday coding, bug fixing, design-sensitive implementation, and a more cost-efficient balance. Anthropic reports it runs 30%+ faster than Sonnet 5 and can cost up to 30% less for most work; it reports a 70.6% result on Terminal-Bench 4.0 versus 10.3% for Sonnet 5 in its evaluation.
- **Haiku 5.5** targets high-volume, cost-sensitive, speed-sensitive work and subagent tasks.
- Claude Artifacts provide an adjacent editable preview, reusable saved outputs, design templates/design systems, and conversational iteration. Claude Code adds a proven pattern of checkpoints, subagents, hooks, and background tasks for longer engineering jobs.

GENE should learn the underlying behaviors:
1. Gather repository/project context once and maintain an explicit compact project memory.
2. Find the root cause before editing.
3. Assign work to specialized roles that share a task ledger, rather than letting separate “agents” overwrite competing versions of the project.
4. Make fewer, more complete edits, then verify them independently.
5. Use a cheap/fast model for classification and bounded chores, a stronger model for difficult planning and architecture, and a reviewer for high-risk changes when quota allows.
6. Save checkpoints before changes and restore code and plan independently.
7. Communicate milestones, evidence, risks, and plain-language reasons rather than flooding chat with hidden tool chatter.

Sources: [Claude Opus 5.5](https://www.anthropic.com/claude-opus-5-5), [Claude Sonnet 5.5](https://www.anthropic.com/claude-sonnet-5-5), [Claude Haiku 5.5](https://www.anthropic.com/claude-haiku-5-5), [Claude Artifacts](https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them), [Autonomous Claude Code workflows](https://www.anthropic.com/news/enabling-claude-code-to-work-more-autonomously).

### Google AI Studio: visual building workflow

AI Studio's current Build experience demonstrates:
- A prompt-led start with visible code and a live preview side by side.
- Multi-file project awareness and changes propagated across files.
- Natural-language edits and annotation/selection of a particular UI element in the preview.
- Server-side Node runtime for secrets, packages, secure API calls, and real full-stack features.
- Firebase/auth/database integrations, GitHub sync, ZIP export and a path to managed deployment.
- Its May 2026 announcement adds native Android generation using Kotlin and Jetpack Compose, plus in-preview editing and generated visual assets.

GENE should translate these patterns into a distinct GENE experience: fast preview iteration; select-an-element edits; clear source and activity views; secure provider secrets; a real server/runtime layer when backend features are requested; GitHub and export flows; and one plan/chat that stays synchronized with code.

Sources: [Google AI Studio Build mode](https://ai.google.dev/gemini-api/docs/aistudio-build-mode), [Full-stack AI Studio apps](https://ai.google.dev/gemini-api/docs/aistudio-fullstack), [Google I/O 2026 AI Studio update](https://blog.google/innovation-and-ai/technology/developers-tools/google-ai-studio-io-2026/).

## 3. Priority order

This sequence matters. Do not start with more game features or decoration before reliability.

### P0 — Trust and failure prevention (release blockers)

#### P0.1 Make preview status evidence-based
- Define states: `idle`, `booting`, `rendered`, `interacting`, `stale`, `error`, `testing`, `verified`.
- When source changes, preserve the last-known-good preview and boot the candidate separately.
- The sandbox sends a versioned `BOOT_STARTED`, `FIRST_FRAME`, `RUNTIME_ERROR`, `CONSOLE_ERROR`, and user-flow evidence message through a strictly validated message channel.
- For Canvas 2D, capture canvas pixel variance at a stable viewport and reject a fully blank canvas. For WebGL, confirm context/shader/program/buffer/draw evidence and a non-blank rendered frame. For apps, confirm DOM ready, a non-empty root/main surface and route readiness.
- Use request IDs and source hashes so telemetry from an old iframe cannot mark a newer build successful.
- Set `verified` only after required interaction checks pass. A visible render alone earns `rendered`, not `verified`.
- On boot timeout, show the exact stage, retain the previous preview, capture sanitized diagnostics and offer “Diagnose & repair.”
- Add a “preview unavailable” mode that still lets the user inspect code and restore a version.

**Acceptance:** intentionally blank HTML/canvas, syntax errors, WebGL shader errors, delayed boots, stale iframe telemetry and successful renders all produce the correct distinct status in browser tests.

#### P0.2 Prevent the “last step failed” trap
- Build into a candidate file manifest; never mutate the saved project until final acceptance passes.
- Run cheap validation after each file, then integration validation on the entire assembled manifest.
- Final acceptance includes required files, safe paths, JSON contracts, syntax, runtime boot, visible output, controls/primary interaction, objective/user-flow, error/restart path, and performance budgets.
- A final validation failure identifies the precise rule and owning file. Run a targeted repair pass for that file only, re-run the failed gate, and limit repair attempts.
- Re-check the entire candidate after every repair because a locally valid patch may break imports/contracts elsewhere.
- If final integration remains broken, retain the last-known-good version and mark the candidate “needs repair”; do not call it a successful build and do not discard its task ledger.
- The user-facing report must show passed checks, failed checks, checks not run, candidate revision, and recovery action.

**Acceptance:** inject a missing control handler, missing spec field, broken import, bad CSS reference, wrong route and runtime exception; each ends in a recoverable diagnostic rather than silently losing work or claiming completion.

#### P0.3 Make long edits patch-first
- Add a typed patch response contract: `replace_exact`, `replace_range`, `apply_diff`, `add_file`, `delete_file`, `rename_file`.
- For edits, return minimal operations by default, not complete replacements of large files. Require expected source hashes or exact context for stale-edit detection.
- Apply the entire patch batch to a copy; reject atomically on stale/ambiguous context, invalid range, unsafe path, collision, file-count limit or size limit.
- Run syntax/contracts on changed files and integration checks on the merged project before commit.
- For large requests, ask the planner to split into file-scoped subtasks. Never ask one model response to rewrite an entire app/game when several targeted patches would suffice.
- If an output-length limit is reported, preserve the current patch/checkpoint, identify the active subtask, reduce scope and retry as one smaller patch. Never append a truncated JSON suffix to the project.
- Maintain a bounded response budget by operation (chat/research/plan/edit/per-file generation) and track actual finish reason and provider error separately.
- Add test fixtures for truncated JSON, empty response, invalid patch, stale file hash, multi-file edit and a repair that changes the same file twice.

**Acceptance:** a small one-function edit to a 300 KB source file succeeds without generating the entire file; multi-file edits either pass all checks or apply none; length-limit failures preserve the original version.

#### P0.4 Enforce zero unrequested AI/provider marks
- Add a deterministic server-side source sanitizer for well-known unrequested UI attribution strings (e.g. “Made with Gemini,” “Powered by Gemini,” “Generated by OpenAI”) in visible HTML/CSS/JS content.
- Only preserve such attribution when the user's request explicitly asks for provider branding/credits/watermarks; merely asking to use an API does not count.
- Limit cleanup to known attribution patterns. Do not strip legitimate user-facing features, copyright notices belonging to licensed assets, API integration code, product names explicitly requested by the user, or general use of words such as “AI.”
- Add a diagnostics result showing if generated attribution was removed; do not add a new GENE badge in the project itself.
- Update the system prompt, alternate-provider prompt, reviewer prompt and tests so all generation routes share the same policy.
- Add fixtures for every common watermark pattern and negative fixtures for a project that legitimately explains its Gemini API integration.

**Acceptance:** generated projects have no unrequested provider branding in visible UI after initial generation, final repair, multi-file edit, source import validation, or retry; user-requested branding is preserved.

#### P0.5 Make builds transactional and resumable
- Give every build a stable ID, plan revision, source revision, task IDs, idempotency key, attempt count and checkpoint.
- Keep the last-known-good snapshot separately from the unverified candidate.
- Never restart the progress denominator mid-run. Progress equals completed tasks for the current plan revision; changing the plan creates a visible new revision.
- Record phase start/end, input/output budget, model/provider, changed files, gate evidence, retries and sanitized error code.
- On reload, restore known state and poll the same build ID. Do not restart generation unless the user explicitly chooses a fresh build.
- Store large snapshots server-side before offering long-running/cloud work. Browser localStorage is a cache, not the source of truth.
- Queue edits during a critical build phase; allow read-only questions where safe, and apply edits in order after the candidate checkpoints.

**Acceptance:** reload during each build stage, force a timeout, change the plan mid-run, and submit two edits rapidly; the run resumes without losing work, skipping a dependency or overwriting a newer revision.

### P1 — One smarter shared brain

#### P1.1 Planner / architect / designer / implementer / QA roles
One supervisor owns the user's goal and the task ledger. Specialized roles return constrained structured outputs and never save code directly:
- **Planner:** intent, requirements, interview questions, milestone graph and acceptance checklist.
- **Architect:** framework/engine, file map, dependency graph, data contracts and performance budget.
- **Designer:** visual direction, component design system, layout, art bible, UI state inventory and reference matching.
- **Game designer:** core loop, game feel, levels, combat/encounters, progression, checkpoints, end states, controls and replay loop.
- **Implementer:** one bounded file/patch task at a time.
- **QA reviewer:** checks changed files, dependency/integration risks and failure paths.
- **Runtime tester:** runs the actual preview and returns evidence, screenshots, errors and user-flow results.

These are logical roles, not a promise that every request uses seven paid model calls. The supervisor should use the lightest safe route, with parallel independent analysis only where it saves time and doesn't create conflicting edits.

#### P1.2 Memory and planning
- Keep project facts separate from conversation prose: title, project kind, chosen framework, constraints, design tokens, active routes/levels, input map, user decisions, file map, known bugs and accepted scope.
- Keep the full plan as a pinned, revisioned artifact in the chat. New requests update a plan delta; do not resend the full plan after every message.
- Ask only the next blocking question, one at a time. Default low-risk choices intelligently.
- If the user asks “continue,” resume the existing incomplete task rather than generating a fresh project or resetting progress.
- For updates, classify intent into discussion, plan change, bug report, visual edit, mechanic edit, feature addition, runtime repair, research or export.
- Change impact is explicit: touched files, preserved systems, changed acceptance criteria, risks and tests to rerun.
- Keep title, project identity, route names, current art direction and working controls stable unless requested otherwise.

#### P1.3 Model selection and thinking budget
Use understandable user-facing modes:
- **GENE Fast:** fast provider/model, smaller patch, common fixes, prompt expansion and routine changes.
- **GENE Thinking:** deeper planning, architecture, new mechanics, multi-file coordination and complex debugging.
- **GENE Black Hole:** maximum available effort, cross-file audits and difficult game design. Label it as slower/costlier and subject to actual provider/context/time limits—not infinite.
- Optional “Auto” chooses mode based on risk, project size and context; it never silently spends an unlimited budget.

The provider router needs:
- Configured model IDs validated against provider capabilities rather than one hard-coded prefix.
- Per-provider timeout, retry policy, output token limit and error taxonomy.
- Quota failover only when a configured alternative is actually available.
- Context compaction that preserves requirements, contracts, changed-file summaries and open tasks.
- No promise that a quota reset, extra API key, free model or provider fallback always exists.
- Record provider/model internally; show a model label only in GENE's own diagnostics if useful, never in the generated app/game unless requested.

#### P1.4 Better reasoning protocol
For a complex task, the supervisor should create an internal checklist—not dump hidden reasoning to the user—and return only:
1. Understanding and assumptions.
2. Plan or minimal plan delta.
3. Files/tasks selected and why they are affected.
4. Changes and actual evidence.
5. Remaining risks and next milestone.

Before writing, inspect current source and relevant project state. After writing, compare the diff to the user's request, run the appropriate check, and reject unrelated destructive changes. This prevents “confident but random” rewrites.

### P2 — Professional game generation

#### P2.1 Playable vertical slice first
First produce a small playable version with boot, input, core mechanic, visible objective, success/failure, and restart. Only then expand content and polish. The prototype stays playable while later tasks run.

Every game plan includes:
- Target platform/device and frame-rate budget.
- Camera model, movement model, collision and scene strategy.
- Input map with keyboard/touch/controller ownership.
- Art bible: palette, materials, silhouettes, scale, lighting, composition, typography and effects.
- Core loop, player choices, failure/retry, progression and completion.
- Content graph: levels/arenas, goals, encounter variants, difficulty curve, rewards and ending.
- Runtime and asset manifest, load order, asset references and fallback behavior.
- Automated acceptance tests with stable seeds and reproducible inputs.

#### P2.2 Make games feel designed, not generated
- Build a distinctive opening screen, clear hierarchy and immediate goal.
- Use silhouettes, layered depth, purposeful animation, responsive movement, hit feedback, camera easing, deliberate color grading and controlled effects.
- Avoid random piles of primitives, placeholder HUDs, repeated filler objects, decorative dead buttons and generic “score box on a black background.”
- Ensure the player can understand the first 10 seconds without reading a long manual.
- Create meaningful content variations rather than padding playtime with timers or repeated enemy waves.
- Support pause, restart, settings, controls, sound state and win/loss transitions consistently.
- Detect focus loss, resize, mobile orientation, visibility changes and canvas context loss.

#### P2.3 Real 3D pipeline
Phase the engine adapter approach:
1. Improve raw WebGL path for robust context startup, cameras, meshes, materials, depth, lighting, scene composition, collision and profiling.
2. Add a maintained high-level web 3D adapter (e.g. Three.js) once npm/package bundling and browser preview allow the dependency.
3. Build importers/loaders for actual OBJ/MTL assets and supported image/audio files; confirm a manifest item is really referenced by the runtime.
4. Expand Forge from primitive recipes toward image/reference-guided asset creation, material palettes, UV/texture capability, reusable modular kits, LOD and measurable polygon budgets.
5. Add rigged/animated character support only with a real export/runtime pipeline.
6. Treat Godot/Unity/Unreal as separate exporter adapters, each with engine-version targets, native file layout, sample project, build test and export acceptance suite.

Never imply that an OBJ mesh is a professional rigged character, a raw WebGL scene is a Unity project, or a debug APK is store-ready.

#### P2.4 Local multiplayer
- Model players as separate state owners.
- Input router assigns key sets and controller IDs to player slots.
- Test simultaneous mixed keyboard/gamepad input, reconnects, join/leave, ready/pause/rematch and camera framing.
- Do not declare online multiplayer without a real networking/auth/authority layer.
- Keep local multiplayer self-contained where possible, and provide explicit controller assignment UI.

### P3 — Professional app and website generation

#### P3.1 User-flow-first generation
For every app:
- Map routes/views and navigation before implementing controls.
- Identify primary and secondary user flows.
- Define state, form schemas, validation, empty/loading/success/error states and persistence boundaries.
- Use coherent reusable components, design tokens and semantic HTML.
- Implement all visible buttons, filters, navigation, tabs and forms or label unavailable actions honestly.
- Add keyboard/focus behavior, responsive layouts, accessible contrast and reduced-motion support.
- Route-aware preview/testing must cover inner pages, not just the home screen.
- Broken links, console exceptions and dead controls are build failures for the flows promised by the plan.

#### P3.2 Real backend vs static UI
- Default to a self-contained frontend for small static apps.
- When the user asks for auth, database, payments, real multiplayer or an external API, pause to design a true backend contract and secrets model.
- Keep secrets server-side. Never emit API keys into browser code or source exports.
- Use explicit adapters for auth/database/payment providers and mock data only when clearly labeled as demo data.
- Confirm persistence after refresh when persistence is promised.
- No fake accounts, imaginary products, fake purchases, hard-coded “success” screens or pretend cloud sync.

#### P3.3 Working edit experience
- Select UI elements in preview and use the element's stable selector, accessible name, parent context and screenshot region to drive a targeted edit.
- Preview a diff or visual candidate, then let the user apply/undo.
- Explain when an edit could affect multiple routes/components.
- Add “restore checkpoint,” “compare versions,” “fix this error,” “improve design,” and “explain plan” actions.
- Keep source editor and preview selection in sync.

### P4 — UI redesign: premium, calm, useful

Use a distinct GENE identity rather than cloning Claude or AI Studio:
- Space-inspired but restrained: deep graphite surfaces, soft atmospheric gradients, cool sage/teal accent, glass only on high-level chrome, no neon overload.
- First-class dark and light themes using one token set.
- Use a clean type scale and fewer competing borders, icons and mini labels.
- Left rail for primary destinations, project/navigation sidebar, central chat/plan, right preview pane. The layout should adapt: minimize preview to give chat real width; on mobile, use a preview/chat switcher rather than crushing both panes.
- A pinned plan/progress surface stays anchored and updates in place.
- Composer has clear mode, model effort, reference attachment, prompt-enhance, stop/cancel and send states.
- Activity panel is expandable and evidence-oriented: stage, file, elapsed time, provider status, retries and validation result.
- Distinct states for ready, dirty, saving, building, stale preview, tested, partial success and failed.
- Use icons consistently; remove emoji-as-primary-icons where a crisp inline icon is clearer.
- Add skeletons for genuine loading and intentional empty states for new projects.
- Use purposeful micro-interactions, visible focus states and reduced-motion support. Avoid animation that burns weak-PC CPU/GPU.
- Do not add external font/CDN dependencies to generated projects; GENE workspace may bundle its own assets if needed.
- Keep project/game titles stable after edits, on exports, and in the play route.

Visual acceptance suite:
- Dark/light theme screenshots at desktop, tablet and mobile.
- New project, conversation with a pinned plan, active build, validation repair, preview minimized, selected-element edit, source editor open, cloud binary build, API offline and long project name.
- No horizontal overflow, clipped critical controls, overlapping composer, illegible contrast or forced tiny text.

### P5 — Cloud runtime, export and production safety

#### P5.1 Durable build worker
- Move long-running build state out of a single browser request into a durable run record and worker queue.
- Use a server-controlled lease/heartbeat, cancellation flag, time budgets, worker attempt number and idempotent task handler.
- Store snapshots and artifacts in durable object storage/database with per-project authorization before exposing cloud persistence.
- Keep server-side secrets in the deployment platform's secret store; never commit tokens, source encryption keys or Android signing keys.
- When the worker cannot run because of platform limits, say what continues only while the tab stays open.

#### P5.2 EXE/APK reliability
- Validate the exact source manifest and standalone entry point before dispatch.
- Verify Windows installer existence, non-trivial size, MZ executable header, SHA-256, upload response, returned object size and content type.
- Verify Android APK file, ZIP integrity, package identity, signing mode, checksum, size and upload response.
- Separate Windows and Android results. Support partial success and do not mark a missing artifact successful.
- Track build ID, workflow URL, source revision, target, step, exit code and sanitized failure excerpt.
- Retry only transient HTTP/registry/network failures with bounded backoff, not repeatable compiler errors.
- Recover by build ID after reload. Do not cancel the remote workflow merely because browser polling stopped.
- Cleanup encrypted build-source branches only after the result is saved; scheduled cleanup recovers abandoned runs.
- Clearly label unsigned Windows and debug-signed Android outputs. Add production signing only after a secure release-keystore/signing setup exists.

#### P5.3 Release path
- Every feature branch runs contract/unit, TypeScript, production build, browser smoke, generated game, generated app, patch, preview telemetry, and cloud-helper tests as applicable.
- A candidate release gets a preview deployment and known-good smoke results.
- Promote only the tested commit to production; check production health, AI configured state, and critical flows.
- Keep a rollback path to the last green release. CI passing alone does not equal project quality, but CI failing must block promotion.
- Add a release manifest with commit SHA, tests, known limitations and change summary.

## 4. Implementation phases

### Phase A — Safety patch (first)
1. Add deterministic no-watermark cleanup and regression tests.
2. Fix preview state so “playable” is not inferred from four source files.
3. Add version-bound first-frame/runtime handshake and stale-preview protection.
4. Convert edit path to typed patches and atomic validation.
5. Add tests for length-limit, stale patch, final validation repair and source-preservation.
6. Add a compact validation/evidence report to the chat activity panel.

Exit gate: a deliberately broken candidate never replaces a good version; a long edit stays file-scoped; a common provider watermark is removed without affecting requested branding; preview state agrees with iframe evidence.

### Phase B — Workspace design system
1. Define tokens, spacing, typography, controls, cards, status variants and responsive breakpoints.
2. Refactor the 2,000-line page into focused components/hooks without changing behavior in the same commit.
3. Make plan/activity surfaces pinned and minimize preview responsively.
4. Add a design acceptance Playwright suite and update snapshots only after inspection.

Exit gate: desktop and mobile flows pass; no feature disappears during component extraction; light theme has parity with dark theme.

### Phase C — Agent orchestration and durable state
1. Extract provider adapters, task planner, patch service, validator, runtime inspector and build status into separate modules.
2. Define versioned JSON schemas for every model task and validate at the boundary.
3. Add persistent run/task/checkpoint storage and worker heartbeats.
4. Add cancellation, resume, task-level retries, idempotency and concurrency protection.
5. Add project state migration for existing localStorage projects.

Exit gate: a multi-minute build survives page refresh and a transient provider error without repeating finished stages or losing user edits.

### Phase D — Quality-focused generation
1. Add route-aware app generation and tests.
2. Add an app interaction harness for buttons, forms, validation and persistence.
3. Add deterministic game input scenarios and screenshots.
4. Add a real screenshot/DOM context package for preview repair.
5. Improve the 3D adapter and Forge asset integration.
6. Add targeted reference-image and art-direction evaluation without inventing assets.

Exit gate: one test project per supported app/game genre builds and passes the checks its UI claims.

### Phase E — Model/router quality
1. Add model capability metadata and per-provider context/output budgets.
2. Select mode by task risk, context size and user effort setting.
3. Keep model/router labels separate from generated application UI.
4. Add reviewer and repair calls only when beneficial and within quota/time limits.
5. Record evaluation results for quality, fix success, patch locality, token use and elapsed time.

Exit gate: the model selector has real, documented behavioral differences and users are never told that “Black Hole” uses a stronger model unless the configured model actually supports it.

### Phase F — Cloud export and production
1. Harden binary preflight, independent target results, checksums, size checks and artifact verification.
2. Make status polling resumable from a durable build record.
3. Add a complete release test matrix and deployment rollback.
4. Add signing only after secure secrets and certificate/keystore handling are provisioned.
5. Mark unsupported exports explicitly; add engine adapters only when real end-to-end tests pass.

Exit gate: each requested target either provides a verified binary with metadata or a precise actionable failure. Partial success is reported honestly.

## 5. Build and QA gates

Every project must keep a machine-readable evidence ledger with check state `passed | failed | not-run | blocked`, timestamp, target source revision, test command, output summary and artifact/screenshot reference where applicable.

### For every generated project
- All paths are safe and unique.
- Source files fit per-file and overall size budgets.
- Specs match project kind, routes/mechanics, input capabilities and declared assets.
- Every declared dependency/module exists and has an actual load/reference path.
- JavaScript syntax, JSON parsing and supported runtime constraints pass.
- Candidate runtime boots within timeout and produces real visible output.
- Console/runtime errors are collected.
- Key user flow or core loop is exercised.
- Candidate hasn't silently dropped unrelated existing features.
- Last-known-good project remains restorable.

### For games
- Keyboard/touch/controller input tests follow declared controls.
- Input ownership is correct for local multiplayer.
- Movement/collision/state remain valid under variable frame times.
- Objective, progress, win, loss, pause, restart and exit transitions work.
- End states are reachable in deterministic tests where feasible.
- Render/object/effect budgets remain within limits.
- 3D WebGL contexts/shaders/buffers/draw calls succeed before a scene is labelled rendered.

### For apps
- Every declared route renders and navigation works.
- Every visible button/input/form is actionable.
- Validation, loading, empty, success and error states are covered.
- Data is either genuinely persistent or clearly documented as demo/local.
- Broken links, missing images and uncaught console errors are detected.
- Keyboard navigation, focus visibility and mobile viewport are covered.

### For binary packaging
- Source archive decrypts/validates, build config exists, platform toolchain starts.
- EXE/APK is real, non-empty, integrity checked, hashed and uploaded.
- Status JSON names the requested targets exactly and never mislabels a missing artifact.
- Binary links are withheld until upload verification completes.

## 6. Failure taxonomy and response strategy

| Failure | Required response |
| --- | --- |
| Output-token/length limit | Keep files unchanged, split into a smaller patch or one requested file, retry with compact contract and save a reason code. |
| Invalid JSON/schema | Reject the response, retry within budget, preserve source and show a structured failure. |
| Stale/ambiguous patch | Do not force-apply. Re-read current context and regenerate against the latest source hash. |
| Missing controls/spec field | Diagnose whether source behavior or only the spec is missing. Repair the actual source if handlers do not exist; never infer a working control from a comment. |
| Blank preview | Capture screenshot/DOM/console/boot data, keep last-known-good visible and repair the boot path first. |
| Preview code runs but flow fails | Run the interaction test; repair the owning function/state transition and rerun the failed test. |
| Gemini quota/key error | Distinguish quota, bad key, overloaded model and timeout; use only configured eligible fallbacks and preserve the build. |
| GitHub Actions failure | Show workflow/job/step and sanitized error; retry only transient errors. |
| EXE succeeds, APK fails (or inverse) | Report partial success, keep the successful verified artifact, and retry only the failed target. |
| Vercel/API timeout | Continue polling an existing remote build if safe; do not create a duplicate job automatically. |
| Context gets too large | Compact to a structured project summary and changed-file contracts; retain the full source snapshot separately. |
| Candidate integration fails last | Keep candidate as repairable draft, roll back preview to known-good and execute targeted integration repair. |

## 7. Evaluation suite and release scorecard

Track these metrics on a fixed suite of app/game prompts, rather than relying on a few impressive demos:
- First-pass build success and final-after-repair success.
- Percentage of candidates that render a non-blank frame on first preview.
- Percentage of declared primary flows actually passed.
- False-positive “verified” rate (target: zero in release tests).
- Targeted edit success, unrelated-file churn, and patch-context conflict rate.
- Token-limit failures and recovery success.
- Runtime exceptions per successful project.
- Cloud EXE/APK verified-artifact success and partial-failure accuracy.
- Median and p95 time to playable prototype; provider cost/model calls per accepted task.
- Visual quality review score for hierarchy, consistency, responsiveness, distinction and polish.
- Accessibility checks, page weight and preview frame-time budget.

Minimum release categories: small utility app, multipage dashboard, form-heavy app, 2D platformer, precision runner, top-down/action game, local multiplayer game, simple 3D lane runner, raw WebGL scene, targeted bug fix, major feature edit, import/export round-trip, EXE package, APK package.

Each result must store the prompt/spec, starting commit/version, resulting version, test evidence and failure recovery details. Never publish a benchmark number without a repeatable test definition and test result.

## 8. Explicit scope honesty

GENE can become more capable by building a strong verified pipeline, not by claiming everything immediately. Until tested end-to-end, the UI must identify the following as future/unsupported rather than completed:
- Unlimited-time autonomous work or unlimited model/provider quota.
- Guaranteed zero failure across external providers and build services.
- Cloud-synced collaboration if only localStorage is in use.
- Online multiplayer without a real server/state synchronization.
- Native Godot/Unity/Unreal output if only browser files are emitted.
- Production-signed EXE/APK when current outputs are unsigned/debug-signed.
- Professional rigged/textured models where only primitive-composed OBJ output exists.
- Features whose code exists but has not passed runtime acceptance checks.

## 9. Definition of “production ready”

GENE is ready for production only when:
1. P0 gates pass for the full regression suite.
2. User edits are patch-first, atomic, recoverable and tested.
3. Preview verification comes from real browser evidence and the correct source revision.
4. Generated games and apps are evaluated by meaningful input/interaction tests—not source-only checks.
5. Provider branding cleanup is deterministic and tested.
6. The visual workspace works on desktop/mobile in dark/light themes.
7. Cloud binary jobs are recoverable and each artifact is integrity checked.
8. Production promotion occurs only from a green tested commit with rollback available.
9. The release UI clearly distinguishes implemented, tested, partially tested, and unsupported capabilities.

**The target is not “the model never makes a mistake.” The target is that GENE catches mistakes early, never hides uncertainty, preserves working state, and has a reliable path to a verified result.**
