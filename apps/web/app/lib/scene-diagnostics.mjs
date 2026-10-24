/**
 * Structural diagnostics for generated game scenes. This is not a rendering or playability test.
 */
export function inspectSceneManifest(spec, files = {}) {
  const errors = [];
  const warnings = [];
  const scene = spec && typeof spec === "object" ? spec.scene || {} : {};
  const objects = Array.isArray(scene.objects) ? scene.objects
    : Array.isArray(spec && spec.sceneObjects) ? spec.sceneObjects
    : Array.isArray(spec && spec.objects) ? spec.objects : [];
  const ids = new Set();
  const duplicateIds = new Set();
  let visibleCount = 0;
  const missingModelAssets = [];
  for (const [index, item] of objects.slice(0, 500).entries()) {
    const object = item && typeof item === "object" ? item : {};
    const id = typeof object.id === "string" && object.id ? object.id : "scene-object-" + (index + 1);
    if (ids.has(id)) duplicateIds.add(id);
    ids.add(id);
    if (object.visible !== false) visibleCount += 1;
    if (typeof object.modelPath === "string" && object.modelPath) {
      if (!object.modelPath.startsWith("assets/") || !object.modelPath.endsWith(".obj")) {
        errors.push(id + ": unsupported model path");
      } else if (typeof files[object.modelPath] !== "string") {
        missingModelAssets.push({ id, path: object.modelPath });
      }
    }
  }
  if (!objects.length) errors.push("Scene has no objects.");
  if (objects.length && !visibleCount) errors.push("All scene objects are hidden.");
  if (duplicateIds.size) errors.push("Duplicate scene object IDs: " + [...duplicateIds].join(", "));
  if (missingModelAssets.length) warnings.push(missingModelAssets.length + " OBJ asset(s) are missing.");
  if (objects.length > 500) warnings.push("Only the first 500 objects were inspected.");
  return {
    ok: errors.length === 0,
    objectCount: objects.length,
    visibleCount,
    hiddenCount: objects.length - visibleCount,
    duplicateIds: [...duplicateIds],
    missingModelAssets,
    errors,
    warnings,
    note: "Structural diagnostics do not prove rendering, controls, collision, or playability."
  };
}
