# GENE Infinity Overhaul

Status: active implementation plan. This document is the shared contract for the overhaul; it is not a claim that every listed capability has already shipped.

## Product goal

Make GENE a coherent AI-first game creation studio in which chat/brain, planning, research, Forge, Imagine, animation, audio, scene editing, runtime testing, and export share one project state and one versioned asset pipeline. Build on the existing repository and preserve working features. Deliver in dependency-aware batches rather than rigid, artificial milestone gates.

## Non-negotiable correctness rules

1. **A game must be visibly playable.** Music, sound effects, generated files, or a successful API response are not evidence of a working game. Verify scene/entrypoint loading, renderer initialization, visible world geometry, camera framing, player or intended interaction target, input, game loop, and a reachable objective appropriate to the genre.
2. **A sprite sheet is not a character animation.** Parse or ask for frame layout, slice frames, create named clips and timing, and attach the animation controller to a character entity with movement, collision, hitboxes and camera behavior where appropriate. Never silently import the whole sheet as a static sprite.
3. **Preview and runtime must use the same asset.** The canonical asset files and manifest are the source of truth for Forge viewport, asset browser, scene assembly, game runtime and export. No hidden low-detail replacement.
4. **Real AI must be labelled honestly.** Interview and planning are AI operations. If no configured AI provider succeeds, return a clear provider-unavailable error and preserve user work; do not silently present a native decision tree as AI.
5. **Every tool invocation is permission-gated.** Show the exact proposed action, purpose, relevant inputs/data and likely effects before execution. Each call needs an explicit, call-scoped approval. A batch approval must enumerate every call. Denial, cancellation, or expired approval means no call. Enforce at the server boundary; do not rely on UI-only controls or a global "allow all" switch. Ordinary chat that needs no tool can answer directly.
6. **Research is evidence, not decoration.** Keep factual/technical research, visual inspiration, downloadable assets, and implementation compatibility separate. Never claim a reference image is an imported asset, or claim a download/license is verified when it is not.
7. **Preserve the project.** Stable asset IDs and versions, explicit dependency references, safe edits, rollback to last-known-good, cancellation, and stale-job protection are part of the build system.

## Shared architecture

- **Gene Brain / AI router:** intent understanding, interview, plan, dependency graph, project memory, reasoning, quality review and provider selection. Distinguish AI-generated, deterministic, imported, and unavailable results in response metadata.
- **Tool registry and permission gateway:** typed schemas, input validation, risk/cost explanation, explicit approval records, call-scoped authorization, audit trail, cancellation, timeouts, output references and clear failures. Every server-side tool call uses this gateway, including nested tool calls from builds.
- **Authoritative project state:** one project snapshot consumed by chat, planning, research, Forge, Imagine, audio, animation, scene editing, runtime, and export. Version project changes and reject stale writes.
- **Asset registry / manifest:** stable ID, version, kind, source, file paths, source URL and license/attribution state, intended scene, bounds/origin/scale/orientation, geometry/material/texture references, UVs, LODs, rigs/clips, collision metadata, compatibility and validation status.
- **Dependency-aware work graph:** tasks and artifacts are linked by inputs/outputs. Plan only the dependencies needed for the selected game, and permit independent work to run in parallel after explicit approval.
- **Runtime adapters:** support only engines with real working adapters. The current browser runtime is centered on Canvas 2D and raw WebGL; do not claim native engine/export support by name alone.

## Current implementation checkpoint (2026-10-23)

- Added a movement-aware sprite controller to the runtime bridge. It resolves named clips from manifests, selects idle/walk and directional clips from velocity, and keeps facing state; gameplay physics and automatic scene binding remain separate work.
- Added focused contract coverage for clip selection and facing state.
- Latest GitHub Actions results from the earlier checkpoint do not cover all subsequent commits; current-head CI/Playground verification is intentionally deferred until the user asks to check the completed implementation.
- Build/source checkpoints can no longer set the gameplay-verified status; the live preview remains "rendered" until gameplay is separately verified.
- Expanded the browser smoke fixture to exercise all four reachable objectives, confirm the win state, and verify restart resets the score and spawn. This is an end-to-end test fixture, not proof that every generated game is verified.
- Research now suppresses low-relevance web results and labels encyclopedic context, image references and model catalog entries as reference-only until actual import occurs.
- App research now uses interface, interaction-pattern and accessibility queries rather than game-mechanics searches.
- Wikimedia candidates expose source byte size, dimensions and checksum when available. Thumbnail downloads are streamed with a strict byte cap rather than buffering an unbounded response. Automatic external-asset import is not yet implemented; candidates explicitly require license, MIME, signature and size review.

## Wave 1 — Trustworthy AI, permissions and playable runtime

### 1. AI interview and planning
- Route interview and plan to a configured real AI provider.
- Return explicit structured results, provider/model metadata and actionable errors.
- On provider failure, keep the user's answers and project untouched; offer retry or an explicitly chosen alternative.
- Do not call deterministic interview logic a real AI interview.

### 2. Permission gateway
- Propose → explain → request permission → execute exactly the approved call → report result.
- Bind approval to a specific action, canonical inputs, project version, and expiry; invalidate it if inputs change.
- No hidden research, Forge, asset generation, network call, or nested tool invocation.
- Support explicit multi-call batches with a visible inventory; a rejected call cannot be rerouted around the denial.
- Log action, decision, result, cost/provider where known, and artifact references without logging secrets.

### 3. Runtime truth and visible-game diagnostics
- Verify the entrypoint and scene graph actually load.
- Check canvas/WebGL context and shader/program/buffer errors, active camera, viewport and framing, visible geometry, player/interaction spawn, input handlers, update/render loop, collisions and objective state.
- Detect the "audio-only ghost game": audio can work while rendering or gameplay is broken. Audio never satisfies visibility/playability checks.
- Use genre-aware contracts: a visual novel or text game may intentionally lack a player avatar; it still needs visible, interactive content and valid progression.
- Report concrete diagnostics and repair from actual errors or runtime observations.

### 4. 2D sprite pipeline
- Accept individual sprites, sheets, sprite atlases, tile sets, skeletal 2D rigs, parallax layers, particles and VFX.
- Detect alpha bounds, frame dimensions, rows/columns, direction rows, idle/walk/run/jump/attack/hurt/death clips and frame rate. If layout is ambiguous, request approval to analyze or ask a targeted question rather than guessing silently.
- Slice source sheets into frames or atlas regions and write a stable manifest plus animation clips.
- Attach a real animation controller to the character/game entity. Connect input/state changes, movement, collision, hitboxes, camera tracking, events and restart/death states as appropriate.
- Verify the animation plays in motion in the actual runtime, not just as a still preview.
- Tilemaps should have appropriate collision and navigation metadata.

### 5. Integration safety
- Validate file paths, asset references, module load order, renderer startup and entrypoint contracts.
- Prevent stale build jobs from overwriting newer work. Cancellation stops downstream work.
- Keep last-known-good snapshots and rollback failed edits rather than discarding the user's project.

## Wave 2 — Research, assets and Forge/runtime fidelity

### 6. Research redesign
- Four distinct results: technical evidence, visual references, actual downloadable assets, and compatibility/integration guidance.
- Build queries from the actual genre, mechanics, character/environment style, art direction and missing asset needs.
- Score relevance; suppress duplicate, off-topic and weak matches rather than filling every slot.
- Show source, direct target, license/attribution, format, size where available, and state: reference-only, downloadable, imported, generated, incompatible or license-unverified.
- Retrieve real asset bytes only from allowed/trusted sources and validate content/type/size. Keep original source metadata.
- Feed approved research and assets into the real project pipeline.

### 7. Forge asset fidelity
- Trace request → generation → files → manifest → viewport → scene placement → runtime loader → export.
- Share canonical geometry/material/texture data between the viewport and runtime.
- Preserve proportions, origin, orientation, scale, materials, UVs and textures. Avoid silent simplification.
- Extend quality evaluation beyond part counts: silhouette, completeness, proportions, material coherence, style consistency, reference match and runtime performance.
- Report limitations and unsupported features honestly.

### 8. Forge modelling capability
- Procedural/parametric generation for architecture, modular environments, furniture, vehicles and hard-surface assets.
- AI-directed generation and edits that preserve asset identity and project style.
- Real editable operations: transforms, hierarchy, selection, symmetry, extrusion/insets, bevels, components, alignment, modifier history and undo/redo.
- Materials, texture workflows, UV inspection, mesh validation, normals and LODs.
- Characters: topology and proportions, rigs, skinning, retargeting and animation where the backend genuinely supports them.
- Use an automatically managed external modelling backend when available, but maintain a useful built-in Forge path. Never require the user to manually wire a tool as a prerequisite; disclose which backend actually produced an asset.
- Goal: compete with Blender as an AI-first creation workflow and progressively expand feature parity. Do not claim full Blender parity until measured and delivered.

## Wave 3 — Better scenes, world design and creative intelligence

### 9. Scene/world intelligence
- Use consistent coordinate, unit, origin and camera conventions across Forge, scene editing and runtime.
- Place objects according to gameplay function, walkable space, sightlines, scale, collision, reachability, lighting, navigation and camera composition.
- Diagnose off-screen, clipped, buried, oversized, floating and inaccessible objects.
- Generate the structure the brief needs; never force a level-based format.

### 10. Adaptive genre architecture
- Support distinct content graphs for open worlds, connected regions, puzzle rooms, sandbox simulations, story locations, hubs/missions, endless runs, arenas, branching fiction, strategy maps and sports/simulation games.
- Let the brief and AI plan decide whether the game needs levels, chapters, missions, a continuous world, a hub, or no progression structure.
- Build gameplay systems around the intended genre instead of using the same generic collect/avoid template for every game.

### 11. Animation, audio and story
- Animation: clips, transitions, state machines, timing, object animation, events and supported rigging/retargeting. Confirm clips are attached and play in runtime.
- Audio: music, SFX, character voice-over, configurable pitch/tone/emotion, timing/subtitles, event mapping, buses, volume/mute and safe start gestures. Distinguish generated from imported audio and report provider limitations.
- Story when useful: story bible, character motives, lore, dialogue, quests, branches and endings with continuity checks. Simple arcade games do not need a forced story.

## Wave 4 — Complete games and dependable delivery

### 12. Whole-game completeness
- Use a genre-aware contract: core mechanics, real controls, camera/physics/collision, world/content graph, interactions, menus/settings/pause/restart where appropriate, reachable goals/failure/progression, saving where needed, art/animation/audio and performance.
- Avoid fake buttons, placeholder systems described as complete, silent empty scenes, unreachable objectives, audio-only builds and static sprite-sheet characters.
- Deliver a coherent playable game rather than a checklist of disconnected generated assets.

### 13. Runtime QA and self-repair
- Use actual runtime errors, screenshots/frame inspection, logs, source files and asset manifests to diagnose defects.
- Run bounded repair loops with explicit permissions for tool calls and a rollback point.
- Test representative gameplay: movement, interaction, objective, enemies/obstacles, menus and genre-specific states.
- Keep checks focused on meaningful failures; don't block implementation on repeated cosmetic previews.

### 14. Packaging and release verification
- Verify project files, dependency paths, asset licenses, engine compatibility, controls, responsive display, performance and export artifact.
- Produce a release report that distinguishes verified, unverified and unsupported features.
- Do not claim deployed, playable, imported, animated or tested unless the evidence supports it.

## Measures of success

- Interview/plan report real provider use or a clear provider-unavailable result.
- No tool executes without a matching explicit approval record.
- No build is marked playable when rendering/entrypoint/input/objective checks fail.
- Sprite sheets produce frame/clip manifests and animated entities, not one static sheet image.
- Forge preview and runtime use the same versioned asset data.
- Research results are relevant, deduplicated and traceable.
- Failed or canceled work cannot overwrite a newer project version.
- Game architecture matches the requested genre and does not force levels.
- Release reports separate tested facts from assumptions.

## Implementation order

Start with the highest-risk correctness fixes and shared contracts, then wire them into the actual endpoints and UI. Implement in coherent batches, reusing existing modules/tests and avoiding parallel duplicate systems. This roadmap is the target; completed work must be recorded separately with code, commits and verification evidence.


## Wave 2 implementation checkpoint (2026-10-23)

- Research results now distinguish **technical evidence** from **asset references** using explicit `resultType` / `integrationState` metadata. Search results and Wikimedia visual/audio results are labelled reference-only; a research result is not silently treated as an imported project asset.
- Commons results expose a declared-license state that still requires per-asset review. Wikipedia thumbnail references are explicitly license-unverified until the source page is checked. Poly Haven model matches are labelled catalog references with source-declared CC0 metadata, not downloaded/imported files.
- Added regression assertions for the provenance/integration-state contract in `tests/research-evidence.mjs`.
- These latest provenance commits still require CI and Playground verification. This is a focused Wave 2 increment, not completion of the full research or Forge roadmap.

## Continued implementation increment (2026-10-23)

- Forge's actual mesh-export path now rejects a recipe when structural QA marks it invalid instead of attaching a warning and exporting it anyway. The existing safe fallback can then handle the failed provider recipe.
- Sprite animation manifests now have a runtime validator that reports missing/invalid manifests, duplicate clip names, invalid frame indices or timing, missing referenced frames, and missing asset identity. Three-digit frame filenames are accepted consistently by both the runtime allowlist and the drawing helper.
- The runtime asset registry now validates manifests against actual OBJ/MTL files, reports broken geometry, missing materials, static-only limitations and required collision integration; resolving an asset includes the validation report.
- Scene integration now reports mesh readiness per scene object, including missing OBJ files, unrenderable geometry, and absent material files. Scene manifest normalization disambiguates duplicate object IDs and prevents zero/negative initial scales from silently making scene objects invisible.
- These are integration/diagnostic improvements, not proof of visual fidelity or playable gameplay. User-side web checks remain outstanding as requested.

## Asset-pipeline continuation (2026-10-23)

- Fixed a real 2D integration gap: both build-time Forge staging and manual asset saving now persist the cropped frame SVG files, not only the sprite sheet and manifest. Animation clips can now resolve their frame files from the project bundle.
- Native 2D manifests fingerprint the source sheet and each frame. The save paths relocate fingerprint entries alongside the actual project file paths.
- Native and AI 3D Forge manifests now fingerprint the exact OBJ and MTL outputs with SHA-256; runtime asset listings expose these fingerprints and warn when a legacy or incomplete manifest lacks valid hashes.
- Added regression coverage for sprite-manifest validation, missing frame detection, 2D frame persistence, scene mesh status, and Forge file-integrity metadata. These tests are committed for the user's later verification; they have not been reported as run on the current head.

## Forge modelling increment (2026-10-23)

- Expanded the 3D recipe vocabulary with real procedural **stairs** and curved **arch** meshes, including bounds and triangle-complexity estimates. The AI recipe instructions now describe when to use them, and the deterministic native building preset uses them when an arched entrance or staircase is requested.
- Corrected the arch's ellipse dimensions so the generated geometry spans the declared width and height instead of collapsing to a short semicircle.
- Added focused regression cases for both geometry options and their native building-preset use. These remain procedural static meshes: they do not imply rigging, UV textures, collision generation or gameplay integration.

## Runtime contract continuation (2026-10-23)

- Added a bounded `GENE_GAMEPLAY` reporting interface for games to declare their genre, controls, objective and expected event types, then report real start/movement/interaction/objective/win/lose/restart transitions. The API labels these as game-authored reports and never sets `verified=true`.
- The preview host now surfaces those reports as self-reported telemetry without changing the preview's verification status. Builder instructions tell generated games to report only actual state transitions, not placeholder signals.
- Runtime asset integrity can now asynchronously verify SHA-256 against the exact imported project-file text using Web Crypto. Scene-level verified status composes mesh readiness with those fingerprints and returns an explicit integrity failure if bytes changed.
- This improves observability and traceability but does not replace independent browser interaction tests; the user plans to perform the web checks after implementation is finished.

## Gameplay coverage increment (2026-10-23)

- The gameplay telemetry snapshot now summarizes observed event names and required-but-unreported events for a declared game contract. It always returns `reportedOnly: true` and `verified: false`; these signals are useful for diagnosis but cannot satisfy independent gameplay verification on their own.
- The workspace records game-reported events with that limitation stated explicitly, while preserving the existing visible-render-versus-playable distinction.

## Asset versioning continuation (2026-10-23)

- Editing an existing Forge model now reads its previous manifest version and increments it in the saved asset manifest, rather than resetting the stable asset to version 1. Project-wide build checkpoints remain separate from per-asset versions.

## Mesh validation increment (2026-10-23)

- Every procedural 3D primitive is now checked before OBJ serialization for non-empty geometry, finite vertex coordinates, valid face lengths, and in-range integer indices. A malformed generated primitive is rejected before it can be saved as a model.

## Reference-image safety increment (2026-10-23)

- Forge now decodes supplied reference images, enforces a decoded-byte budget in addition to the base64 character cap, validates the actual file signature against the declared JPEG/PNG/WebP MIME type, and forwards only the validated bytes. A client-supplied MIME label alone is no longer accepted as evidence of a valid image.

## Research-to-Forge provenance increment (2026-10-23)

- AI-generated 3D Forge manifests now retain sanitized source page/direct URL, declared license and attribution, MIME type, exact byte size, and SHA-256 of each validated reference image actually sent to the provider. Unsafe/non-HTTPS metadata links are omitted. A declared license remains metadata, not an automatic license approval.

## Scene-wide asset verification increment (2026-10-23)

- Added an asynchronous scene-wide verification helper that checks each visible scene mesh through the mesh-readiness report and SHA-256 integrity verifier. It returns per-object results and does not alter the render/playability state by itself.

## Latest implementation increment (2026-10-23)

- Runtime diagnostics now expose observed canvas dimensions, renderer context types, drawing/frame counts, input observations, and captured runtime errors. Context detection wraps the game's own `getContext` calls rather than creating a competing context that could break startup. The diagnostic assessment explicitly says gameplay remains unverified by telemetry alone.
- Research image payloads are streamed under a hard byte cap, checked against raster file signatures, and returned with exact byte size and SHA-256 fingerprint. External research candidates remain reference-only until an approved importer validates license, type, signature and size.
- Visual references are deduplicated by canonical URL, ignoring fragments and common tracking parameters.
- Forge structural QA now flags empty assets, unsupported shapes, malformed transforms, near-zero scales, missing part names and invalid colors; severe structural errors produce an `invalid` status. This remains structural QA, not visual-quality proof.
- Focused tests were added for these contracts. The newest commits have not been run through current-head CI or Game Playground; the user requested implementation first and will perform the web checks after the full update.

## Implementation log — current branch

The following code changes have been started on `gene-infinity-overhaul` (not yet merged to `main`):

- Added exact-input, expiring, call-scoped approval fingerprints and API enforcement for direct research, 2D Forge and 3D Forge calls.
- Added explicit browser confirmation for direct specialist calls and an enumerated approval batch for nested Forge calls made during a game build. Nested calls are skipped when the user cancels or when a matching approval is absent.
- AI interview/planning now returns a clear provider-unavailable error if configured providers fail instead of silently substituting the deterministic interview tree.
- Added Canvas/WebGL source contracts that reject builds with no detectable visible drawing operations, no WebGL draw submission, or no WebGL viewport setup. Renderer checks inspect the assembled module graph rather than only one file.
- Native 2D Forge now exports cropped frame SVG files and animation clip metadata in addition to the source atlas. The runtime exposes `GENE_SPRITES.draw` / `GENE_SPRITES.clips`, and generated frame files are included in the runtime asset allowlist.
- Updated the AI build instructions to use frame-based animation clips and not stretch the full sprite sheet into a static character.
- Tightened visual-reference queries and added topic/category relevance filtering to both the displayed research bundle and the image bytes sent to the model. Category-only results no longer pass for specific multi-term topics.
- Added stable asset IDs, version and provenance metadata to native 2D assets; added honest runtime capability metadata to 2D/3D manifests, including unsupported textures, UVs, rigs and colliders.
- Added a shared `GENE_ASSET_REGISTRY` for manifest lookup by path or stable ID. Fixed the runtime allowlist so actual Forge manifests under `assets/models/<kind>.json` are loaded and indexed.
- Strengthened preview acceptance: a WebGL clear/background buffer is not enough; 3D needs real geometry draw calls. Canvas2D needs non-uniform pixels plus entity drawing distinct from background clearing. A visible frame is now labeled `rendered`, not `playable`, until gameplay verification exists.
- Added focused regression coverage for sprite slicing, runtime animation, manifest registry behavior, actual Forge manifest paths, visible-renderer contracts, image relevance, AI-only planning recovery, and call-scoped tool approvals.

Verification status: the CI contract suite passed on an earlier commit containing the research-filter correction and runtime asset registry. Subsequent commits add further runtime, sprite, scene, Forge, and provenance work and have not been run through current-head CI/Playground, at the user's request. The user will perform web checks after implementation is finished. Do not interpret this log as a claim that the full overhaul is complete.
