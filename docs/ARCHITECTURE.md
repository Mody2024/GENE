# GENE Architecture

## Control plane
Vercel hosts the web workspace and API routes. Supabase stores auth, projects, chat history, task state, checkpoints, usage and published builds.

## Agent plane
The agent receives user intent plus project state and chooses typed tools. Tools are the only mechanism allowed to claim that a file changed, a build ran, or a test passed.

## Game plane
2D projects target Phaser. Small 3D projects target Three.js/WebGL. Godot, Unity and Unreal adapters remain separate packages so the core project model stays engine-neutral.

## Verification
A project can only enter Ready state after source validation, runtime startup, first-frame validation, primary-mechanic validation, win/lose validation and performance-budget checks succeed.


## GENE 1.4 Flash: resumable build coordination

The typed build ledger and `apps/web/app/lib/build-orchestrator.ts` define the first coordination layer:
- tasks have stable IDs, explicit dependencies, acceptance criteria, attempt counts, and bounded status values;
- dependency cycles and missing dependencies are rejected before a run begins;
- only tasks whose dependencies passed are eligible to run;
- checkpoints retain a snapshot of the known-good project files, a deterministic per-file change fingerprint, completed tasks, validation evidence, plan revision, and a recovery note;
- interruptions can queue user changes and pause the run; recovery restores the selected checkpoint and re-queues unfinished work.

This is a pure orchestration module, not yet a durable remote worker. A production integration must persist run state outside browser memory, invoke it from the workspace and API, and have a worker execute each task with provider/runtime time budgets. A type or task status by itself is never proof that a game works.

## Prototype and full-game contract

GENE must model the playable prototype and the full game as separate content plans:
- Prototype target defaults to about 20 minutes and proves the core loop, controls, one representative progression path, and a meaningful prototype conclusion.
- Full-game target defaults to about 120 minutes and requires additional missions/levels, progression, challenge variation, and its own complete ending. It is not allowed to satisfy the full-game target merely by increasing a timer or reusing the prototype content unchanged.
- The targets are estimates to guide scope, not promises of exact play duration. Actual content and completion paths must be tested where the runtime allows it.
- The prototype should become playable early and remain available while later tasks continue. A user change should checkpoint the current known-good version, update the plan revision, invalidate only affected tasks, and resume from the checkpoint.
- The AI chat and prototype runtime should be independent workspace activities: playing must not disable chat, and edits must not silently reset a running game. If a change requires a reload, preserve the last known-good preview and explain the reload.

## Honest completion gates

A build is not complete just because source generation succeeded. The intended gates are source/schema checks, dependency validation, runtime startup, visible first frame, controls and primary loop, objective completion, fail/restart path, full-game completion path, and performance diagnostics. Where automated play is unavailable, the UI must identify which checks are static, which were executed, and which remain unverified.


## Context-aware patch engine

`apps/web/app/lib/patch-engine.ts` applies a batch to a copied source manifest and returns a result only if every operation succeeds. It supports add/delete/rename, exact-context replacements, line-range replacements, and standard unified diff hunks. Stale or ambiguous context, unsafe paths, missing files, rename collisions, invalid ranges, and oversized files reject the whole batch. The caller still needs to connect this utility to model-generated patch plans and run project-level validation before saving.


## Dynamic file manifests and bounded build stages

The browser build coordinator begins with the four required runtime files, then reads optional `game-spec.json.additionalFiles` and adds each safe, non-core path as its own dependency-aware stage. The assembly validator depends on the final planned stage. The agent API accepts safe relative paths for additional files and edits, validates manifest uniqueness, limits a project to 100 files, limits individual files to 500 KB, and caps combined generated text at 8 MB. The preview runtime still directly executes only the core HTML/CSS/JavaScript contract; a listed asset is not considered integrated until the generated runtime references or loads it correctly.


## GENE 1.4 scope and verification boundary

The implementation branch now has the first manifest-driven build expansion and safe relative-path checks, as well as the checkpoint ledger and atomic patch utility. The four core browser files remain the only files directly assembled into the iframe; additional files can be represented in the project and exported, but need a real loader/reference before they are considered runtime-integrated. The current coordinator still runs as a client-side staged sequence and uses browser project state; it is not yet a server-side autonomous worker and does not yet continue the project's full-game scope after the prototype as a background task. Playtime targets must be estimated per project from its genre, content and progression; example durations are not universal defaults. Concurrent chat during a long build is therefore a release requirement still open, not a capability to claim as complete. Run the full CI workflow before merging.


## GENE 1.4 live runtime and build completion rules

- A playable core may be shown while the remaining build stages continue. Conversational questions can be answered during that phase; source-changing requests are queued and applied in order after the build reaches a stable result.
- Build and chat responses that overlap must merge messages and preserve the newest source/checkpoint state instead of replacing it with a stale project snapshot.
- After staged files are generated, a separate final content pass must expand the game beyond its prototype, or polish the web app's interactions and error states. If that pass fails, keep the playable checkpoint and report a partial/failed build instead of claiming full completion.
- Additional JavaScript files are loaded as classic scripts in the sandboxed live preview before the core runtime. They must not use ESM import/export syntax; expose shared APIs through a documented global namespace and ensure the core runtime calls those APIs. A file existing in the manifest alone is not proof it is integrated.
- Web app validation rejects a declared interactive interface when it has no detectable event handlers, and checks that its main script is not effectively empty. These are structural checks, not proof every user flow works.
- Playtime is a project-specific estimate from the game's scope and structure. No fixed duration is assigned when the specification does not provide one.
