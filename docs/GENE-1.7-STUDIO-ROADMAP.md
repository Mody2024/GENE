# GENE 1.7 — Studio, Memory, and Asset Intelligence Roadmap

Status: proposal for after GENE 1.6 reliability gates. This document is a plan, not a claim that these capabilities already exist.

## Product direction

GENE 1.6 focuses on dependable project creation, persistent plans, differentiated reasoning modes, bounded context, preview-aware repair, and truthful release validation. GENE 1.7 should make projects easier to grow over weeks, improve 3D asset quality, and support more real workflows without sacrificing reliability or weak-device performance.

## Guiding rule

Only ship a 1.7 feature when its acceptance test is defined and the existing 1.6 reliability suite still passes. Do not use new model names, fancy progress UI, fake build artifacts, or generated screenshots as substitutes for functionality.

## Proposed workstreams

### 1. Durable project memory and plan revisions
- Introduce a versioned plan artifact with stable task IDs, explicit decisions, requirements, acceptance criteria, and dependency edges.
- Show a concise plan diff after a request: added, changed, deferred, and removed tasks.
- Track plan revision separately from source revision and build-run revision.
- Preserve confirmed decisions, user corrections, asset choices, and known limitations across sessions.
- Add import/export for the project manifest and plan, with migration for existing localStorage projects.
- If cloud persistence is introduced, make it opt-in and authenticated; do not send project source to a cloud database without clear user action and privacy boundaries.

Acceptance: reload and resume a project; update one requirement; only dependent tasks change; prior successful source and plan revisions remain recoverable.

### 2. Project graph and dependency-aware edits
- Build a file/module manifest with import/export relationships, entry points, runtime assets, routes, and tests.
- Use that graph to select context and decide which files need changes.
- Apply multi-file changes as a transaction: preflight, patch, validate, commit, or roll back.
- Detect stale edit proposals by file hash and ask for a fresh diff instead of overwriting newer changes.
- Add explicit migration steps when a project changes engine, framework, or data shape.

Acceptance: a targeted edit updates all and only the necessary files, catches stale proposals, and restores the previous version after a failed validation.

### 3. 3D asset pipeline v2
- Add reusable style profiles (stylized low-poly, industrial, cozy, sci-fi, fantasy, realistic-inspired) with coherent scale, palette, silhouette, and material rules.
- Expand procedural mesh primitives into shape-aware asset generators: extrusions, bevels, lathed forms, curve/tube forms, layered surfaces, and controlled vertex variation.
- Add material and texture atlas generation where the renderer supports it, with deterministic fallbacks for weak GPUs.
- Create reusable modular kits and asset variants instead of regenerating every object independently.
- Improve GLTF/GLB and OBJ/MTL import validation, texture path repair, triangle budgets, and missing-material diagnostics.
- Add asset thumbnails and a provenance manifest recording whether each asset is procedural, imported, or user-provided.
- Keep rigging and animation as a separate verified capability; do not imply static mesh geometry is animated.

Acceptance: asset fixtures pass geometry/format checks; materials and paths load; style profiles produce visibly distinct coherent results; model complexity stays within chosen budgets.

### 4. Genre specialist packs and game design intelligence
- Create structured, testable specialist packs for platformer, runner, top-down action, horror, survival, racing, puzzle, RPG, and local co-op.
- Each pack defines the core loop, expected controls, progression, level pacing, camera, AI behaviors, failure cases, and acceptance tests.
- Require a playable vertical slice before expanding content.
- Add level/content variation through data-driven definitions instead of giant monolithic game.js files.
- For local multiplayer, test input independence, player ownership, pause/restart, and split/shared camera behavior.
- Add optional save slots and deterministic seeds where supported.

Acceptance: representative genre fixtures start, respond to controls, reach a win/loss/restart state, and pass project-specific checks.

### 5. Preview telemetry and visual regression
- Tie every screenshot, runtime error, and test report to an exact source revision.
- Record boot time, first frame, console exceptions, failed network/asset loads, and supported interaction traces.
- Add optional screenshot comparison for stable fixtures with tolerant thresholds.
- Separate static analysis, browser smoke tests, interaction tests, and human playtest recommendations in the UI.
- Automatically repair only when the error evidence is sufficiently specific; cap attempts and retain the last known-good preview.

Acceptance: an intentionally broken fixture produces a revision-matched failure report; a repaired revision gets a new report; stale screenshots cannot mark newer code as playable.

### 6. Reliable long-running jobs
- Use server-side durable jobs for long builds, with idempotency keys, progress events, cancellation, checkpoints, retry budgets, and per-stage timeouts.
- Make refresh/reconnect safe: reconnect to the same job rather than starting duplicate generation.
- Separate request acceptance from actual completion and provide a job timeline with stage logs.
- Add resource budgets for provider tokens, file count/size, build duration, asset complexity, and cloud artifacts.
- Keep user edits queued with clear conflict behavior; never silently drop a request.

Acceptance: refresh during a job, retry a transient failure, cancel, and resume without duplicate commits or lost completed work.

### 7. App-builder capabilities
- Add explicit app templates for dashboards, CRUD tools, landing pages, portfolios, internal tools, and data viewers.
- Model each route, form, state transition, validation rule, empty/loading/error state, and persistence boundary.
- Generate API integrations only when credentials and endpoints are configured; otherwise create an honest mock adapter that is visibly marked as mock.
- Add accessible keyboard navigation and responsive layout tests.
- Provide a data adapter boundary so users can later connect a real backend without rewriting UI components.

Acceptance: app fixtures test navigation, form validation, duplicate submissions, persistence behavior, error handling, and responsive layouts.

### 8. Collaboration and portability
- Add portable project manifests and lockfile-aware exports.
- Support safe import of ZIP projects with path traversal protection, file size limits, type allowlists, and dependency review.
- Provide patch/diff export for review and manual application.
- Consider collaboration only after project persistence, identity, access control, conflict resolution, and audit trails are implemented.
- Never expose API keys in ZIP exports, logs, client bundles, or generated source.

Acceptance: exported project can be reopened in its supported target; unsafe ZIP fixtures are rejected; secrets tests find no configured keys in outputs.

### 9. Provider and model routing
- Use a server-side provider registry with capabilities, context limits, output limits, reasoning controls, timeout budgets, and health state.
- Select a model based on the task, user-selected mode, actual configured provider, and available budget.
- Show the actual provider/model and fallback transitions; never silently downgrade Thinking to a weak model while claiming maximum reasoning.
- Test malformed JSON, output truncation, rate limits, network timeout, provider outages, and model-specific unsupported parameters.
- Keep provider branding out of generated products unless the user explicitly requests it, while keeping provider attribution transparent in GENE's own diagnostics.

Acceptance: simulated provider failures result in a clear status and preserve project files; every fallback is recorded and the user-facing status is truthful.

### 10. Release engineering and quality gates
- Add a golden-project suite covering a web app, a 2D game, a 3D game, a local co-op game, a multi-file edit, a truncated model response, and a failing cloud build.
- Require CI to run contract tests, type checks, production build, browser smoke tests, and project fixtures.
- Add a release manifest with commit SHA, deployment URL, test summary, artifact hashes, and target/signing status.
- Treat Vercel deployment, playable preview, source ZIP, Windows installer, and Android APK as separate release targets.
- Do not promote a release if core AI integration, project edits, or preview checks fail.

Acceptance: every release can be traced to a commit and test run; each offered download has a verified checksum and accurate target/signing label.

## Ideas to keep in the backlog until 1.6 is stable

- Visual node editor for scene and gameplay systems.
- Optional plugin/extension API with capability permissions and a sandbox.
- Collaborative editing and shared project spaces.
- Asset marketplace and user-managed style libraries.
- Scene/level editor with direct manipulation and undo/redo.
- Voice input and spoken walkthroughs.
- One-click publishing to additional hosting providers.
- Automatic project documentation and architecture diagrams.

These are not 1.6 blockers. Build them only when there is evidence that the foundation, security, cost controls, and test suite can support them.

## 1.7 release gate

GENE 1.7 is ready only when the 1.6 golden-project suite still passes, project revisions are recoverable, context selection is traceable, imported/generated assets are validated, long jobs survive refreshes and transient failures, and release artifacts are tied to a tested commit.
