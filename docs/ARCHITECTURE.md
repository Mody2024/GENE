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
