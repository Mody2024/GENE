# GENE Overhaul — Repository-Grounded Implementation Plan

## Goal

Evolve GENE from its current AI-assisted browser-game/web-app builder into a reliable, engine-aware game-development workspace that supports both autonomous and interactive creation modes and both playable browser games and downloadable PC projects. Preserve working features and ship in verified, reversible phases.

## Repository baseline (checked 2026-10-18)

Repository: Mody2024/GENE, default branch main. Deployment project: Vercel gene-flash. The README documents Next.js 14, React 18, TypeScript, Gemini primary plus optional Groq/OpenRouter fallback, browser-sandboxed Canvas 2D/raw WebGL output, low-poly primitive-based OBJ Forge assets, source ZIP import/export, a local agent, and Electron/Capacitor wrapper builds via GitHub Actions. Cloud build setup requires explicit Vercel/GitHub secrets and runner configuration.

Known boundaries from the current README and architecture docs:
- Projects are currently stored in browser localStorage; durable shared cloud persistence is not complete.
- Current preview executes self-contained browser projects; it is not a dedicated long-running engine runner.
- Windows EXE packaging wraps web projects with Electron; Android APK wraps web projects with Capacitor.
- Native Godot/Unity/Unreal project generation/build adapters, multiplayer server generation, high-fidelity image-to-3D/organic modelling/rigging, and fully automated gameplay coverage are not established as supported.
- A task ledger/checkpoint and patch-engine direction is documented, but documentation itself is not proof all paths are wired to a durable worker.
- Open PR #35 adds an automated browser playground and must be checked against current main/CI before relying on it; it is not evidence of broad game-generation quality by itself.

## Non-negotiable design rules

1. The model is replaceable. GENE owns orchestration, typed tools, project memory, permission checks, task state, testing and reporting.
2. Autonomous and interactive modes share the same project format, tool registry, validation and build pipeline.
3. Browser output and downloadable PC output are separate targets with separate acceptance tests.
4. Every claimed action (file edit, build, test, artifact upload, deployment) must have tool-produced evidence.
5. Existing projects are modified through targeted patches; do not rebuild from scratch or overwrite working features unless requested.
6. File operations are path-safe, validated, diffable and recoverable. Destructive operations require confirmation or an explicitly authorized autonomous policy.
7. All loops, retries, model calls, and background jobs are bounded and cancellable.
8. Unknown/unavailable capabilities are shown as unsupported or not verified—not silently treated as success.
9. No exact commercial game clones or proprietary assets; implement original games inspired by broad genre mechanics.

## Phase 0 — Audit and baseline

- Read current source for provider routing, cancellation, workspace state, local agent, patch engine, generation stages, preview runtime, package workflows, environment variable contracts and deployment config.
- Inspect open PR #35, its latest commit, checks and Vercel preview; reconcile its playground tests with current main before merging or reusing.
- Run repository tests, typecheck, production build and browser suite against an identified commit. Record actual baseline failures and successes.
- Verify current Vercel project/production target and deployment protection. Never promote a preview commit blindly.
- Publish a truthful capability matrix: implemented, experimental, planned, unsupported.

Exit gate: reproducible baseline report and prioritized defects with file/route/test references.

## Phase 1 — Reliable processing and task isolation

- Introduce one typed run state machine: queued, planning, waiting_for_approval, executing, validating, repairing, completed, failed, cancelling, cancelled.
- Give each run a unique ID tied to project and chat/session; reject stale writes using run ID and project revision.
- Propagate AbortSignal through all model providers, streams, tool execution, subprocesses and worker jobs. Stop must block future tool scheduling and writes; surface when a subprocess cannot be terminated.
- New chat must not attach to or continue an old chat's foreground run. Explicit background jobs may continue only if user-visible and separately tracked.
- Use bounded provider timeouts, exponential backoff for transient failures, error classification, quota awareness and actionable diagnostics. Never retry deterministic validation failures blindly.
- Persist long-running job state outside the browser session where configured; implement resume/recovery without duplicate side effects.
- Add checkpoints before risky operations, idempotency keys for external effects, stale-run protection and last-known-good preview preservation.
- Add provider and task observability without logging secrets or full sensitive source by default.

Tests: stop during planning, model stream, tool call, browser build, and packaging; start new chat while old run is active; reload/resume; provider timeouts; repeated 429/5xx; stale response race; no post-cancel file mutation.

## Phase 2 — Gene Workspace and file intelligence

- Wire a single workspace tool registry: list/read/search/create/edit/delete/move/rename, patch/diff, checkpoint/restore, and project manifest updates.
- Validate normalized relative paths, traversal, symlinks where applicable, reserved names, case/Unicode collisions, size limits and file/directory conflicts.
- Perform edits transactionally on a working copy. Validate all operations before applying; reject the whole patch batch on ambiguous or stale context.
- Maintain a manifest with file kind, path, hash, source/asset metadata, dependencies, engine/runtime target, generated/imported status and validation evidence.
- Index imports, script references, scene links, asset references, routes and configuration dependencies. Update references on move/rename or report blockers.
- Show a navigable file hierarchy, global search, editor, selected-file actions, diffs, activity log, checkpoints and undo/restore.
- Keep Local Agent filesystem operations confined to the approved workspace; require confirmation for destructive external or broad operations.
- Add Git status/diff/branch/commit integration where available; don't silently push or deploy code without an authorized workflow.

Tests: safe and rejected paths, atomic patch rollback, rename collision, import/reference updates, delete dependency warning, restore checkpoint, round-trip import/export, concurrent edits and stale revision rejection.

## Phase 3 — Shared Gene Core and two creation modes

- Use a shared task ledger and project memory across interview, plan, build, edit, research, testing and export.
- Planner creates milestones, dependencies, affected files, risks and measurable acceptance criteria before execution.
- Architect/designer/coder/tester roles can be logical specialist passes using the model router; don't require expensive multi-agent calls when one pass suffices.
- Autonomous mode executes approved scope through bounded stages and repairs, with progress visible and checkpoints retained.
- Interactive mode asks only consequential questions, shows plan/diff/preview, requests approval at configured checkpoints and incorporates feedback as targeted patches.
- Mode switch is explicit per project/run; changing mode must not duplicate jobs or discard state.
- Store project decisions, architecture notes, known failures and user-approved constraints as versioned project memory. Summarize/retrieve relevant context instead of sending the entire project repeatedly.
- Model routing chooses an eligible provider based on availability, task requirements, latency/quota and configured cost policy; preserve a no-surprise-cost rule unless the user explicitly changes it.
- Typed tools return structured outputs and evidence. The model may propose actions but cannot claim success without tool results.

Tests: identical scenario in both modes; interactive approval/decline/edit; autonomous bounded completion; mode switch during pause; memory survives reload; targeted change preserves unrelated features; all providers fail gracefully.

## Phase 4 — Browser game production pipeline

- Keep self-contained browser games as the fastest target; formalize adapters for Canvas 2D and raw WebGL, then add a supported Three.js or Phaser adapter only with dependency, sandbox and test contracts.
- Generate a small playable vertical slice first, then expand content from the approved plan.
- Use genre-specific implementation contracts for runner, platformer/metroidvania, voxel sandbox, base-building strategy, exploration/survival and original concepts.
- Require real controls, state transitions, objective/failure/restart paths, persistence when requested, asset references and responsive behaviour.
- Run syntax/schema checks, sandbox startup, first-frame check, real keyboard/touch events, core-loop checks, console capture, screenshots and performance budgets.
- Keep last-known-good preview available during candidate builds. Only accept repairs when the previously failing test passes and regression tests remain green.
- Add hidden prompt variations and paired-prompt checks to identify repetitive templates. Use similarity flags for review, not as sole automatic judgments of originality.

## Phase 5 — Downloadable PC build pipeline

- Distinguish browser preview, source ZIP, Electron installer, and native engine build in UI and reports.
- For supported web projects, use the existing Electron packaging workflow, verify the exact artifact, non-zero size, checksum, expected format, metadata and launch smoke test where a Windows runner is available.
- Track build ID, source manifest hash, commit, runner URL, failed step/exit code, artifact size and verified download URL. A poll timeout must not cancel the actual build.
- Ensure encrypted temporary source, secrets and artifact URLs follow the repository's documented security constraints. Don't expose private source in logs; explain when Blob URLs are public/shareable.
- Preserve separate per-target outcomes when Windows packaging succeeds and another target fails.
- Add build-status recovery after tab reload and cleanup for abandoned branches/artifacts.

## Phase 6 — 3D and engine adapter roadmap

- Improve current Forge through geometry validation, mesh budgets, collision generation, materials, scene integration, scale checks and viewport evidence.
- Add a procedural asset adapter first; advanced organic modelling, UVs, rigging, texture baking and image-to-3D require specialist integrations/models and should be separately gated.
- Implement engine adapters as isolated packages with engine-specific project schemas, templates, import checks, build runners, runtime tests and export metadata.
- Godot adapter gate: generate a valid project, run headless/editor import and build/export on a supported runner, launch a test scene, and verify input/core mechanic.
- Unity adapter gate: valid project/package setup, editor batch-mode validation/build on a supported runner, launch smoke test and artifact verification.
- Unreal adapter gate: valid project/configuration, compatible build environment and asset/import validation, packaged build and launch test. Document heavy compute/runner requirements.
- Do not label Electron output as a native engine project or promise 3D capabilities that have not passed the adapter gate.

## Phase 7 — Multiplayer and larger game architecture

- First create small local deterministic simulations and two-client prototypes; only then support real multiplayer.
- Require a real backend/server, authoritative state, protocol/schema, client/server versioning, persistence, matchmaking or room discovery, disconnect/reconnect handling and rate limits.
- Test at least two independent clients with latency/disconnect injection. A mock lobby or local-only scene does not pass multiplayer.
- Keep large open-world streaming, dedicated servers, anti-cheat and production scaling as advanced projects with explicit infrastructure requirements.

## Phase 8 — Shared QA Playground and benchmark suite

Use docs/GAME-GENERATION-BENCHMARKS.md as the canonical benchmark contract.

- Run scenarios in autonomous and interactive modes and for browser and downloadable PC targets wherever supported.
- Scenarios: lane runner, voxel sandbox, metroidvania, base-building strategy, original game, targeted edit, cancellation/recovery and (only when infrastructure exists) multiplayer.
- Repeat identical prompts with recorded seeds/configuration/provider/version; run at least three independent generations where quota permits.
- Use hidden variations so fixed templates cannot pass all cases.
- Capture machine-readable reports, screenshots, console logs, input events, gameplay state transitions, performance samples, file/asset manifest, build artifacts/checksums and provider failure details.
- Report per-check statuses passed/failed/not_run/unsupported. Never convert missing evidence to a pass or rely only on an averaged score.
- Compare baseline and candidate using the same tests and environment. Human review is required for subjective visual quality/originality.

## Phase 9 — UI, persistence and production rollout

- UI: project/file hierarchy, plan/activity panel, mode switch, approvals, preview, code/asset editor, diffs, task stop/resume, test evidence and export/build status.
- Persistence: browser-local projects remain supported; introduce server persistence only with explicit authentication, ownership, migration, privacy and conflict handling. Never assume Supabase tables or auth are already configured without inspecting the project and environment.
- Vercel hosts the web/API control plane; use a durable worker/sandbox for long builds or engine execution that exceeds request limits. Keep the game runtime separate from the orchestration API.
- Add release health checks and rollback guidance. Deploy to preview first, run the acceptance suite against the exact commit, then promote production only after checks and required secret configuration are verified.

## Benchmark and release acceptance

Canonical detailed scenario matrix and scoring live in docs/GAME-GENERATION-BENCHMARKS.md. Minimum release gates:
1. Existing tests, typecheck, production build and browser playground pass.
2. Cancellation/new-chat isolation and provider failure recovery tests pass.
3. File operation safety, atomic patches, diff/rollback and project integrity tests pass.
4. Both modes pass the runner, metroidvania and targeted-edit scenarios with evidence.
5. Browser export/import round trip passes.
6. Downloadable PC output is verified and launched by a supported test runner; otherwise it remains explicitly unverified.
7. Voxel and strategy core loops pass before these genres are described as reliable.
8. Native engine or multiplayer claims require their own real build/runtime test environments.
9. Production promotion requires exact-commit CI, Vercel deployment health and verified configuration; no production deployment is implied by this plan.

## First implementation tasks

1. Inspect the current main commit and open PR #35; run/read CI results and compare its branch with main.
2. Build a source-level map of model routing, cancellation, workspace operations, patch engine, build orchestrator, preview runner, cloud packaging and existing tests.
3. Write a baseline report with reproducible failures.
4. Implement Phase 1 cancellation/task isolation and tests first, then Phase 2 transactional workspace operations.
5. Continue sequentially through the phases, updating this roadmap with actual commits and test evidence. Avoid one giant untestable patch.
