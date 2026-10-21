# GENE Forge Runtime Integration Contract

## Mandatory routing
- 3D asset creation/edit requests must use the GENE Forge workflow and its typed request/response contract.
- Prefer provider-backed recipe generation when a configured provider succeeds and passes validation.
- If providers are absent or fail, invoke native deterministic recipes for supported categories.
- Never claim a model exists until OBJ/MTL/manifest output is validated and attached to the active project.
- Never claim Blender, rigging, UVs, texture baking, or visual QA occurred unless a worker/result proves it.
- Return the exact mode (provider, native, blender, or imported) in task status and asset manifest.
- Keep the user's project style and constraints in the request, and preserve existing files unless the user explicitly requests replacement.

## Request shape
POST /api/forge with JSON:
{ "prompt": string, "kind": "character"|"vehicle"|"building"|"environment"|"prop"|"weapon", "quality": "performance"|"standard"|"high", "projectStyle"?: string }

## Response contract
Success returns ok=true, aiMode, model, and asset containing recipe metadata plus files named model.obj, model.mtl, and asset.json. The workspace integration layer must persist these files using safe path/file operations and report their paths. Errors must remain typed and explain whether no files were produced.

## Provider teaching
Inject the modelling-course summary into the model's system/developer instructions at runtime. The model should learn the workflow, but the application must enforce it through routing, schema validation, bounded retries, file persistence, and tests rather than relying on prompt text alone.
