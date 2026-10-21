# GENE Forge Modelling Course

This course is the shared craft and evaluation contract for every model used by GENE. It teaches workflow; the application must also enforce the workflow through API routing, validation, persistence, and tests.

## 1. Translate intent into a brief
Extract subject, purpose, target engine, camera distance, style, scale, silhouette, functional features, material groups, animation needs, budget, and references. Separate must-have requirements from optional polish. Ask one concise question only when a missing constraint materially changes the result; otherwise use documented defaults.

## 2. Choose a truthful target
Use Performance for mobile/small/distant assets, Standard for normal gameplay, and High for hero assets within budget. Prefer a clear silhouette and recognizable proportions over arbitrary detail. Never describe a primitive mesh as a sculpted or photorealistic model.

## 3. Build hierarchically
Primary forms establish silhouette and mass. Secondary forms communicate function: doors, windows, limbs, wheels, handles, seats, and panels. Tertiary forms add selected trims, seams, vents, bolts, labels, and material breaks. Each part must serve a purpose; avoid piles of repeated primitives and floating parts.

## 4. Spatial reasoning and proportion
Use consistent units and a predictable origin. Check bounds, positive scales, rotations, clearances, ground contact, and front orientation. Buildings need believable floor heights, window rhythm, entrances, roofs and foundations. Vehicles need chassis, cabin, wheelbase, wheel contact and clear front/rear cues. Characters need readable body ratios, joints, limbs, hands/feet and clothing layers.

## 5. Materials and colour
Choose a restrained, coherent palette: dominant base, neutral support, and small accents. Match material to function; metal has stronger specular response, rubber stays dark, glass is distinct without hiding form, and emissive materials are reserved for lights. Validate hexadecimal colours and allowed surface enums. Do not claim PBR fidelity from basic MTL export.

## 6. Asset-specific patterns
- Character: clean silhouette, balanced limbs, readable joints, layered clothing, clear facing direction. Rigging/skinning are separate capabilities that require tests.
- Building: foundation, facade, entrance, floors/windows, roof, and ground contact.
- Vehicle: chassis, cabin, wheels, glazing, lights, bumper, and functional cargo.
- Environment: focal landmark, ground plane, navigable negative space, and foreground/midground/background hierarchy.
- Furniture/prop: function first, load-bearing structure, contact points, handles/hinges, and material breaks.
- Unsupported categories: do not fabricate support; narrow the task or return an honest limitation.

## 7. Recipe validation
Recipes contain name, kind, style, notes and parts. Every part must have a supported shape, finite 3D position, positive bounded scale, bounded rotation, safe name, valid hex colour, and supported surface. Reject malformed JSON, extreme coordinates, excessive part counts and oversized meshes. Keep generated paths inside the project.

## 8. Export and integrate
The current first export is OBJ geometry, MTL materials and asset.json manifest. Keep the files together. Record source mode, style, counts and notes. Persist through safe workspace operations and never overwrite unrelated files without explicit approval. glTF/GLB, Godot scenes, UVs, texture baking, rigging and Blender scenes are future adapters unless implemented and tested.

## 9. Visual QA and repair
An HTTP success is not proof of quality. Validate schema and bounds, then inspect a rendered preview where available. Check silhouette, missing/floating/overlapping parts, orientation, materials and triangle budget. Make focused edits that preserve correct work. If visual QA was not performed, disclose it.

## 10. Verified experience and evaluation
Only store examples when policy permits and explicit verification metadata exists. Capture task, engine, constraints, output summary, tests, source mode and provenance. Split training, validation and held-out evaluation deterministically. Never train on unverified output or infer quality from training loss alone. Track prompt fidelity, export success, visual review, defects, triangles, retries, latency and cost; compare changes on a fixed held-out benchmark.

## 11. Providers and workers
AI providers may propose recipes; Forge validates and converts them. Retry within a bounded budget, then use native recipes for supported kinds. Blender may be an automatically orchestrated worker only when actually available. Never claim Blender ran, or that rigging, UVs, texture baking or visual QA occurred, without a real worker result.

## 12. Acceptance checklist
- [ ] Requirements and quality target recorded.
- [ ] Correct kind and silhouette.
- [ ] Parts, transforms, materials and names validated.
- [ ] Geometry and file size within budget.
- [ ] Export files complete and mutually consistent.
- [ ] Visual QA done or its absence disclosed.
- [ ] Safely integrated without unrelated overwrites.
- [ ] Mode truthfully labelled: provider, native, Blender-worker, or imported.
- [ ] Unsupported requirements reported honestly.

## Current boundary
Native Forge currently means deterministic, parameterized low-poly recipes and primitive mesh construction. It is a foundation, not a Blender replacement or universal AI image-to-3D system. Sculpting, UV unwrap, texture painting, retopology, rigging, skinning and photoreal materials need dedicated implementations and acceptance tests.
