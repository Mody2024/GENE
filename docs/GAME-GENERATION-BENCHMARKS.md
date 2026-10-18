# GENE Game-Generation Benchmarks

## Purpose

Measure whether GENE can reliably create meaningfully different, playable projects—not merely generate plausible source code or repeat a menu/template. This suite is a capability contract and test plan. A benchmark result is evidence only for checks that actually ran; planned tests are not implemented capabilities.

## Supported workflow modes

Every benchmark scenario must run in both supported authoring modes:

- **Autonomous:** GENE plans, builds, tests, repairs within bounded limits, and reports completion without asking for approval at every milestone.
- **Interactive:** GENE presents its plan and meaningful decision points, shows diffs/previews, and waits for user approval before consequential design changes. User feedback must be applied as a targeted edit without discarding unrelated working features.

Both modes must use the same project contract, tool permissions, acceptance tests, and truthful status model. Mode-specific differences should be limited to approval and orchestration behaviour.

## Output targets

1. **Browser project:** self-contained playable browser game, validated in a sandboxed browser. Measure runtime startup, first frame, input, core loop, error-free play path, and export/import round trip.
2. **Downloadable PC package:** a verified Windows package for supported web-based projects, with artifact existence, non-zero size, expected executable/package format, checksum, and launch smoke test where the runner supports it.
3. **Engine project adapters (future gated capability):** Godot, Unity, and Unreal project generation must be reported as unsupported until each adapter can create a valid project, run an engine-specific build, launch/test it in an appropriate runner, and produce evidence. Electron packaging is not a native Godot/Unity/Unreal build.

## Scenario matrix

| ID | Archetype | Required vertical slice | Browser | Downloadable PC | Advanced/future gates |
|---|---|---|---|---|---|
| RUNNER-01 | 3D lane runner | Lane switch, jump/slide, obstacles, collectibles, collision, score, restart | Required when 3D browser renderer is selected | Required for supported wrapper | Mobile input and performance under load |
| VOXEL-02 | Voxel sandbox | Chunked/block world, place/remove blocks, inventory, save/reload, bounded terrain | Required where renderer supports it | Required for supported wrapper | Large-world streaming, crafting, entities |
| METROID-03 | 2D metroidvania | Responsive movement, jump, attacks, enemy, connected rooms, ability gate, checkpoint | Required | Required for supported wrapper | Boss phases, map, progression save |
| STRATEGY-04 | Base-building strategy | Grid placement, resources, building upgrade, unit/path logic, battle objective, save | Required | Required for supported wrapper | Economy balance and asynchronous progression |
| MULTI-05 | Multiplayer survival/building | Two clients, authoritative state, movement, interaction, reconnect handling | Only when a real networking backend exists | Only when supported client package exists | Server authority, latency, disconnect/rejoin, abuse resistance |
| ORIGINAL-06 | Open-ended original concept | User-specified mechanics, original visual direction, explicit success/failure path | Required | Required for supported wrapper | Similarity/repetition review across generated projects |
| EDIT-07 | Targeted change | Change one mechanic/visual while preserving unrelated behaviour | Required | Rebuild package if relevant | Diff and regression proof |
| RECOVERY-08 | Deliberate failure | Inject invalid file/path or runtime fault; stop/cancel and recover safely | Required | Build recovery if package task exists | Cancellation race and abandoned-run cleanup |

A row is not passed just because the model produced files. For each scenario, the report must list which targets were actually run and mark unsupported targets as not run/unsupported rather than passed.

## Repeatability and anti-template checks

- Store each benchmark prompt, scenario version, project seed, model/provider identity, configuration, engine/runtime version, and test environment.
- Run the same scenario against the baseline and candidate using identical acceptance tests. For stochastic model output, perform at least three independent runs when quotas permit; report each run and the aggregate, not only the best.
- Use hidden variations of theme, mechanic, constraints, and layout so hard-coded starter projects cannot pass by memorizing one output.
- Compare project structures, mechanic declarations, level/scene layout summaries, asset manifests, and screenshots across distinct prompts. Reuse of safe libraries is allowed; irrelevant repeated layouts or mechanics should be flagged for review, not rejected solely by textual similarity.
- For an originality test, require the generator to state which requested constraints drove its design choices and to produce a materially different design from a paired prompt. Human review remains necessary for subjective creativity claims.
- Do not use copyrighted game assets, proprietary source code, or copied maps. Test archetypes inspired by broad genres and mechanics, not exact replicas of commercial games.

## Evidence and scoring

Each run emits a machine-readable report with scenario ID, mode, target, commit/source manifest hash, provider attempts and sanitized failures, elapsed time, files changed, validation stages, screenshots, console/build logs, artifact checksum, and per-check status: passed, failed, not_run, or unsupported.

Score each category 0–5 only when evidence exists:

1. **Build integrity:** source/schema/syntax checks, package integrity, reproducible manifest.
2. **Runtime correctness:** startup, first frame, no uncaught errors on tested path.
3. **Mechanics:** real input events and observable state transitions for the core loop.
4. **Completion/recovery:** objective success, failure/restart, save/reload when required.
5. **Asset integration:** models/images/audio are present, licensed/attributed when applicable, and actually referenced by runtime scenes.
6. **Design fit and distinctness:** requirements coverage, coherent art direction, archetype-specific mechanics, and differences from paired prompts.
7. **Performance:** frame timing/object budgets/memory where measurable on a recorded test environment.
8. **PC packaging:** expected artifact exists, is non-empty, checksum matches, package metadata is valid, and launch smoke test passes where available.
9. **Edit safety:** targeted diffs, no unrelated regressions, rollback/checkpoint works.
10. **Task control and reliability:** bounded retries, accurate provider diagnostics, stop/new-chat isolation, no post-cancellation mutation.

Report raw checks and category scores separately. Do not turn missing evidence into a score of 5. A weighted total may be added later, but release gates cannot be bypassed by a high average.

## Release gates

- **Gate A — baseline reliability:** existing smoke tests, typecheck/build, provider-failure tests, path-safety tests, and browser playground pass.
- **Gate B — both modes:** autonomous and interactive mode complete RUNNER-01, METROID-03, and EDIT-07 with evidence; interactive approval and autonomous progress semantics are tested separately.
- **Gate C — both output types:** browser export/import round trip passes; supported Windows package is verified and launched by a test runner. If the PC runner is unavailable, report packaging as unverified.
- **Gate D — broader game families:** VOXEL-02 and STRATEGY-04 pass their core-loop gates; MULTI-05 remains gated on a real server/client test environment.
- **Gate E — original design:** ORIGINAL-06 passes hidden variations and a human review of distinctness; no universal superiority claim is made without a fixed comparative benchmark.
- **Production gate:** no release is promoted until required checks pass on the exact candidate commit and the production deployment health check succeeds.

## Known boundaries

The current repository documents browser Canvas 2D/raw WebGL generation, low-poly primitive-based OBJ Forge assets, and Electron/Capacitor packaging. It does not yet claim native Godot/Unity/Unreal exports, advanced organic modelling/rigging, or multiplayer server generation. Those require separate adapters, execution infrastructure, and tests before being listed as supported.
