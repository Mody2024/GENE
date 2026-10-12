# GENE 1.5 Flash — Next Preview Roadmap

## Release promise

GENE 1.5 Flash should be the next preview people can actually build with, not just a visual refresh. One continuous project chat and one shared brain must cover games, websites, web apps, research, editing, testing, repair, and export. The release is not production-ready until the web app, generated projects, and real cloud binary builds pass their respective checks.

## P0 — Release blockers

### 1. Cloud binary build reliability (EXE/APK)
- Fix Electron Builder artifact-name interpolation and verify the generated installer exists, is non-empty, and has a valid executable signature/header before upload.
- Add Android SDK license acceptance and explicit checks for Java, SDK platform/build-tools, Gradle output, APK size, and APK ZIP integrity.
- Keep Windows and Android results independent: one target may succeed while the other fails; never label a missing artifact successful.
- Preserve the exact failing workflow URL, target, failed step, exit code, and a concise sanitized error summary in the build result shown in GENE.
- Retry only transient download/network/registry failures with bounded exponential backoff. Do not blindly retry deterministic compiler or source errors.
- Make build jobs idempotent by build ID. Validate the source manifest and standalone entry point before dispatch, and keep encrypted source out of logs.
- Verify uploads by checking URL, object size, and content type; never return a download link before upload confirmation.
- Add a status recovery button so a closed/reloaded tab can resume polling by build ID. Polling timeout must not cancel a still-running build.
- Add cleanup for encrypted source and temporary branches after the result has been safely recorded, plus a scheduled cleanup fallback for abandoned runs.
- Label outputs honestly: Windows installer is unsigned unless code signing is configured; Android APK is debug-signed until a release keystore is configured.

### 2. Build pipeline and the repeated game-controls validation error
- Make the project manifest the single source of truth for planned files, completed tasks, dependencies, and test gates.
- Start with a small bootable vertical slice, then expand only when dependencies require it. GENE chooses file count based on actual needs.
- Validate real keyboard/touch/controller listeners in runtime code. A declaration in game-spec.json alone is not proof that controls work.
- Repair the responsible runtime file first, re-run the same test, and preserve the last-known-good build on failure.
- Use stable task IDs and monotonic progress: completed/total tasks from the current plan revision. Never reset to 1/4 when continuing a 2/10 build.
- Every stage must have an acceptance test, bounded retries, a checkpoint, and a readable error. Avoid endless spec-only repair loops.

### 3. CI and production safety
- Require smoke tests, TypeScript/production build, browser UI tests, generated-project runtime tests, and cloud-build helper tests.
- Test one 2D game, one small 3D scene, one multi-page app, one targeted edit, and one binary build for each supported platform.
- Keep preview deployment separate from production; promote only a verified commit. Roll back if a production health check fails.
- Add a release health panel for current commit, build status, model provider, and known limitations.

## P1 — Core intelligence upgrade

### 4. One shared autonomous brain
- Shared project memory across interview, plan, build, edit, research, and QA.
- Planner, architect, designer, coder, and tester coordinate through one task ledger instead of separate chats or competing project state.
- Before coding, GENE silently identifies missing decisions, technical constraints, core loop/user flows, content scope, dependencies, and risks.
- Ask one important interview question at a time. Explain why it matters and remember the answer; use sensible defaults for non-blocking details.
- Extended Planning mode produces phases, detailed screens/levels, file ownership, data/state model, dependencies, risks, milestones, and acceptance criteria.
- Plan updates create a delta plan and apply targeted patches to the existing project, never an automatic rebuild from scratch.
- Keep the title, project identity, existing features, and working files stable across updates unless the user explicitly changes them.

### 5. Higher-quality generated games
- Require a playable vertical slice before adding breadth.
- Build a meaningful loop, onboarding, responsive controls, feedback, progression, checkpoints, pause/restart, win/loss, and replayability.
- Increase story and game length through a content plan: scenes, objectives, level variants, encounters, difficulty pacing, rewards, and narrative beats.
- Use a performance budget per target device and adapt object counts, effects, textures, and draw calls.
- Add deterministic smoke inputs, simulated keyboard/touch events, screenshots, console-error checks, and regression tests.
- For local multiplayer, assign independent input ownership and verify simultaneous/mixed keyboard/controller input.
- Maintain asset manifests and ensure every generated model/texture/audio file is actually referenced by the scene or app.

### 6. Higher-quality apps and websites
- Generate real routes/pages, navigation, functional buttons, forms, validation, persistence boundaries, loading/empty/error states, responsive layouts, and accessible focus states.
- Test every visible control. Remove dead buttons or label unavailable features clearly.
- Add data contracts and mock data only when clearly identified; never invent accounts, products, API credentials, or successful payments.
- Support previewing a specific route, not just the landing page. Add route-aware screenshots and broken-link checks.

## P2 — Workspace and workflow

### 7. One chat for everything
- Apps, games, websites, research, and exports share one conversation, one history, one project memory, and one build/edit engine.
- Plans appear as a pinned, revisioned artifact inside chat; new messages update the existing plan instead of resending it.
- Minimized preview gives the conversation and composer more width.
- Add Custom Edit selection with element context, targeted diffs, a before/after preview, and explicit apply/undo.
- Add Enhance Prompt, explain-plan, compare versions, restore checkpoint, stop build, resume build, and report-a-bug actions.
- Keep model/build status and stage logs in a compact expandable activity panel rather than flooding chat.

### 8. Preview and self-repair
- Distinguish loading, running, stale, crashed, and successfully tested states.
- On blank preview or runtime error, collect sanitized console/boot telemetry, offer an AI repair, refresh when appropriate, and re-run the failed check.
- Keep the last-known-good preview visible while a candidate version is being built.
- Compare screenshots at stable viewport sizes and test important user flows before accepting a patch.

### 9. Research and model reliability
- Ground web research with source links and separate sourced facts from model suggestions.
- Add per-provider timeouts, quota/error classification, truncation recovery, cancellation, and bounded fallbacks.
- Stream progress and preserve work if the provider returns a length-limit error; split work by task/file, not arbitrary output chunks.
- Never claim a model searched, tested, built, or deployed unless that operation actually succeeded.

## P3 — Export and ecosystem
- Source ZIP export/import with a validated manifest and round-trip test.
- Cloud EXE/APK builds with reproducible metadata, checksums, artifact-size display, and build logs.
- Optional release signing and versioning after secure secret setup; never store signing keys in project source.
- Godot/Unity/Unreal project export should use explicit engine-specific adapters and validation; do not advertise a target until tested.
- Cloud project persistence and account sync only after authorization, ownership, privacy, and storage rules are implemented.
- Plugin/asset integrations must show license, source, and attribution where applicable.

## Preview acceptance gate

A GENE 1.5 Preview is acceptable only when:
1. The web workspace builds and browser tests pass.
2. Interview and extended planning work in one chat for both games and apps.
3. A targeted edit preserves unrelated working features.
4. A generated game passes real input-handler and runtime checks.
5. A generated app has multiple working routes and tested controls.
6. EXE and APK jobs each produce a verified, downloadable binary when requested; partial failures are reported accurately.
7. Reloading the workspace can recover build status and the last-known-good version.
8. Production is not promoted until the preview is verified.

## Explicit non-goals for this preview

- Do not promise unlimited compute, unlimited model quota, or guaranteed five-hour autonomous execution.
- Do not claim professional native engine exports, app-store-ready signing, multiplayer servers, or advanced 3D rigging until those adapters exist and are tested.
- Do not use visual polish as a substitute for functional acceptance tests.
