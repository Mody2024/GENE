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
    // Catch malformed transforms before they turn into NaN matrices or invisible meshes.
    for (const field of ["position", "rotation", "scale"]) {
      if (object[field] === undefined || object[field] === null) continue;
      const value = object[field];
      const components = Array.isArray(value)
        ? value.slice(0, 3)
        : value && typeof value === "object"
          ? [value.x, value.y, value.z]
          : null;
      if (!components || components.length !== 3 ||
        components.some(component => component === undefined || component === null || component === "" || !Number.isFinite(Number(component)))) {
        errors.push(id + ": invalid " + field + " transform; expected three finite numeric components");
        continue;
      }
      if (field === "scale" && components.some(component => Number(component) === 0)) {
        warnings.push(id + ": zero scale makes this object invisible on at least one axis");
      }
      if (field === "scale" && components.some(component => Math.abs(Number(component)) > 10000)) {
        warnings.push(id + ": unusually large scale may cause camera/clipping problems");
      }
    }
    if (String(spec && spec.engine || "").toLowerCase() === "webgl3d") {
      const type = String(object.type || "mesh").toLowerCase();
      const supportedTypes = new Set(["mesh", "custom", "box", "cube", "rectangular-prism", "sphere", "cylinder", "cone", "plane", "light", "camera"]);
      if (!supportedTypes.has(type)) errors.push(id + ": unsupported WebGL scene type " + type);
      if ((type === "mesh" || type === "custom") && (typeof object.modelPath !== "string" || !object.modelPath.trim())) {
        errors.push(id + ": mesh/custom object has no OBJ model path");
      }
    }
    if (typeof object.modelPath === "string" && object.modelPath) {
      const path = object.modelPath;
      // Accept only normalized project-relative OBJ paths; reject traversal, backslashes,
      // query fragments and unusual characters before resolving a generated asset.
      if (!/^assets\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.obj$/i.test(path)) {
        errors.push(id + ": unsafe or unsupported model path");
      } else if (!Object.prototype.hasOwnProperty.call(files, path) || typeof files[path] !== "string") {
        missingModelAssets.push({ id, path });
      } else {
        const source = files[path];
        const vertices = (source.match(/^\\s*v\\s+[-+0-9.eE]+\\s+[-+0-9.eE]+\\s+[-+0-9.eE]+(?:\\s|$)/gm) || []).length;
        const faces = (source.match(/^\\s*f\\s+.+$/gm) || []).length;
        if (!source.trim() || source.length > 2_000_000) {
          errors.push(id + ": OBJ asset is empty or exceeds the 2 MB validation limit");
        } else if (!vertices || !faces) {
          errors.push(id + ": OBJ asset must contain at least one valid vertex and face record");
        } else if (vertices > 100_000 || faces > 100_000) {
          errors.push(id + ": OBJ asset exceeds the bounded vertex/face count");
        }
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
