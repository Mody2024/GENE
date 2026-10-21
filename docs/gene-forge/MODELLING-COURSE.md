# GENE Forge Modelling Course and Runtime Contract

Version: 1.0  
Status: engineering curriculum and runtime contract; not a claim that every advanced capability is implemented.

## Non-negotiable operating rule

When a user requests a 3D asset, character, prop, vehicle, building, environment, or editable 3D scene, the planner must route the request through GENE Forge's typed asset workflow before attempting to hand-write unrelated mesh files. Use the Forge API contract and save its returned files into the active project workspace. Do not silently substitute a text description for a model. If Forge cannot safely support the requested category or fidelity, explain the limitation and ask for a narrower supported target. Blender is an optional automatically managed worker; never require the user to manually connect it. Native procedural generation must remain available when external providers are absent or fail.

## Course outcomes

A model is considered Forge-literate when it can: translate briefs into measurable asset requirements; select a supported asset category and target quality; design primary, secondary, and tertiary forms; choose consistent proportions, silhouette, materials, and palette; keep geometry within bounds; validate the recipe; export and organize the generated files; inspect results; and request a focused repair rather than restarting everything.

## Lesson 1 — Translate intent into a modelling brief

Extract: subject, purpose, camera distance, target engine, style, scale, silhouette, functional features, material groups, animation/rigging needs, budget, and reference constraints. Separate must-have requirements from optional details. If critical constraints are missing, ask one short question; otherwise use safe defaults and record them in the manifest. Never infer that “realistic” means photorealistic sculpting is available.

## Lesson 2 — Choose a production target

Use Performance for small/mobile scenes and distant props; Standard for normal gameplay assets; High for hero assets when the geometry budget permits. Prefer a coherent, readable silhouette over arbitrary detail. State the quality target in the request and record the resulting triangle count. Do not exceed configured part, scale, coordinate, or output-size limits to fake quality.

## Lesson 3 — Build forms hierarchically

Model in three passes:
1. Primary masses establish silhouette, proportions, balance, and recognizability.
2. Secondary structures establish function: doors, windows, limbs, wheels, handles, rooflines, seats, panels.
3. Tertiary details establish material breaks: trims, seams, vents, buttons, bolts, labels, and edge accents.

Each part must have a meaningful name and purpose. Avoid piles of identical primitives. Use symmetry when appropriate, then add a few asymmetries that support the brief. Ensure contact points overlap or meet; avoid visible floating components.

## Lesson 4 — Proportion, scale, and spatial reasoning

Use a consistent unit convention within an asset and a predictable origin, normally near the ground/contact plane for props and buildings or near the body centre for characters. Keep the main mass centred unless the design requires otherwise. Verify bounds, positive non-zero scales, rotations, and clearances. For buildings, define floor height, window rhythm, entrance scale, roof and foundation. For vehicles, define chassis, cabin, wheelbase, cargo volume, wheel contact, and front/rear cues. For characters, define head-to-body ratio, torso, limbs, hands/feet, clothing layers, and pose readability.

## Lesson 5 — Materials and colour

Assign materials by physical role rather than random colour. Use a restrained palette with a dominant base, supporting neutral, accent, and material-specific dark/light values. Metal uses stronger specular response; rubber stays dark and rough; glass should be visually distinct but not obscure the silhouette; emissive materials are reserved for intentional lights. Validate every colour as six-digit hexadecimal and every surface against the allowed enum. Do not claim physically based shader fidelity when exporting a basic MTL material.

## Lesson 6 — Asset-specific design patterns

- Character: recognizable silhouette, balanced limbs, clean joints, clothing as distinct layers, palette consistency, and clear front orientation. Native stylized skeletons are a valid starting point; rigging and skinning must be separately validated.
- Building: foundation, main mass, roof, entrance, repeated floor/window logic, balconies or trim where useful, and ground contact.
- Vehicle: chassis, cabin, wheels/track, windows, lights, bumper, cargo or functional attachment. Verify wheels are aligned and the vehicle reads from front and side.
- Environment: establish a focal landmark, ground plane, navigable negative space, and foreground/midground/background hierarchy. Keep repeated props deterministic but not visually monotonous.
- Furniture/prop: define function first, then load-bearing parts, contact points, handles, hinges, and material breaks.
- Unsupported categories: do not invent support. Follow the current engine's explicit category policy and report unsupported categories.

## Lesson 7 — Recipe contract and safe generation

Forge recipes use a JSON object containing name, kind, style, notes, and parts. Each part has a supported shape, 3D position, positive scale, rotation, hexadecimal colour, and supported surface. Reject malformed JSON, unknown shapes/surfaces, invalid vectors, extreme bounds, excessive part counts, and oversized exported meshes. Sanitize names. Never write generated paths outside the active project. Keep deterministic native recipes labelled aiMode=native so users can distinguish procedural fallback from provider-generated results.

## Lesson 8 — Export and project integration

The current first export target is OBJ geometry plus MTL materials and an asset JSON manifest. Preserve the three files together. The manifest must describe source mode, style, part/triangle/vertex counts, recipe, and notes where available. Use stable per-project names; avoid overwriting existing user assets without an explicit edit operation. Integrate returned files through the workspace's safe file-operation layer. Future adapters may add glTF/GLB, Godot scenes/resources, Blender scenes, UV maps, rigging, and texture baking only when implemented and tested.

## Lesson 9 — Visual QA and focused repair

A successful HTTP response is not proof of a good asset. Validate recipe schema and mesh bounds first; then inspect a rendered preview when available. Check silhouette, missing/overlapping parts, floating geometry, inverted orientation, material consistency, and triangle budget. Translate each defect into a targeted change: “raise roof 0.2 units” is better than “make it better.” Preserve successful parts and project history; repair only affected recipe sections where possible. If visual QA is unavailable, label that gap honestly.

## Lesson 10 — Evaluation and continual improvement

Store examples only when user/privacy policy permits and the result has explicit verification metadata. A training example should include task, engine, constraints, output summary, test names/results, source mode, and provenance. Keep train, validation, and held-out evaluation splits separate. Never train on unverified outputs or report improvement from training loss alone. Measure prompt fidelity, valid exports, visual review scores, geometry defects, triangle count, retry rate, latency, and cost. Compare candidate changes against a fixed held-out benchmark and retain a known-good version for rollback.

## Lesson 11 — Provider and worker orchestration

AI providers may propose a recipe, but Forge validates and converts it into mesh files. On provider failure, retry within bounded time and then use native generation only for explicitly supported categories. Do not let a model directly claim it used Blender, generated a rig, baked textures, or performed visual QA unless the corresponding worker and result exist. If Blender is available in the deployment environment, orchestration may launch it automatically as a worker; if not, continue with native capabilities or return a clear capability boundary.

## Lesson 12 — Final acceptance checklist

- [ ] Brief and quality target recorded.
- [ ] Correct asset category selected.
- [ ] Primary silhouette and required functional features present.
- [ ] Parts/materials/names validated.
- [ ] Coordinates and scales within safe bounds.
- [ ] Export files are complete and mutually consistent.
- [ ] Triangle count and file size fit target budget.
- [ ] Visual QA completed, or its absence is disclosed.
- [ ] Files are safely integrated into the project without overwriting unrelated work.
- [ ] Result mode is honestly labelled: provider-generated, native procedural, Blender-worker, or imported.
- [ ] Unsupported requests are declined or narrowed without fabricating capabilities.

## Current capability boundary

The native fallback in this milestone uses deterministic, parameterized low-poly recipes and primitive mesh construction. It is a resilience foundation, not yet a Blender replacement and not a claim of universal AI image-to-3D, sculpting, UV unwrapping, texture painting, topology retopology, rigging, skinning, or photorealistic material authoring. Those require dedicated implementations, worker adapters, and acceptance tests.
