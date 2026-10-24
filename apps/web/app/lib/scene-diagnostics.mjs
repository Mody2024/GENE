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
  if (objects.length > 500) {
    errors.push("Scene contains " + objects.length + " objects; the runtime limit is 500. Split the scene into smaller sections.");
  }
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
        ? value
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
        if (String(spec && spec.engine || "").toLowerCase() === "webgl3d") {
          errors.push(id + ": required OBJ asset is missing from the build package (" + path + ")");
        }
      } else {
        const source = files[path];
        // Check size before scanning lines so an oversized model cannot trigger expensive regex work.
        if (!source.trim() || source.length > 2_000_000) {
          errors.push(id + ": OBJ asset is empty or exceeds the 2 MB validation limit");
        } else {
          const folder = path.slice(0, path.lastIndexOf("/") + 1);
          for (const line of source.split(/\r?\n/)) {
            const materialLine = line.split("#", 1)[0].trim();
            if (!/^mtllib(?:\s|$)/i.test(materialLine)) continue;
            const libraries = materialLine.split(/\s+/).slice(1);
            if (!libraries.length) {
              errors.push(id + ": OBJ material-library record is empty");
              continue;
            }
            for (const library of libraries) {
              if (!/^[a-zA-Z0-9_-]+\.mtl$/i.test(library)) {
                errors.push(id + ": OBJ asset contains an unsafe or unsupported material filename (" + library + ")");
              } else if (!Object.prototype.hasOwnProperty.call(files, folder + library) || typeof files[folder + library] !== "string") {
                errors.push(id + ": OBJ asset references missing material file (" + folder + library + ")");
              } else {
                const materialSource = files[folder + library];
                if (materialSource.length > 500_000) {
                  errors.push(id + ": material file exceeds the 500 KB validation limit (" + folder + library + ")");
                  continue;
                }
                for (const materialRow of materialSource.split(/\r?\n/)) {
                  const materialRecord = materialRow.split("#", 1)[0].trim();
                  if (!/^(?:map_[a-z0-9_]+|bump|disp|decal|refl|norm)(?:\s|$)/i.test(materialRecord)) continue;
                  const fields = materialRecord.split(/\s+/);
                  const texture = fields[fields.length - 1];
                  if (!texture || !/^[a-zA-Z0-9_.-]+\.(?:png|jpe?g|webp|bmp|tga|gif)$/i.test(texture) || texture === "." || texture === "..") {
                    errors.push(id + ": material file contains an unsafe or unsupported texture path (" + texture + ")");
                  } else if (!Object.prototype.hasOwnProperty.call(files, folder + texture) || typeof files[folder + texture] !== "string") {
                    errors.push(id + ": material file references missing texture (" + folder + texture + ")");
                  }
                }
              }
            }
          }
          let vertices = 0;
          let textureCoordinates = 0;
          let normals = 0;
          let faces = 0;
          let malformedVertex = false;
          let malformedAttribute = false;
          let malformedFace = false;
          // Parse in one pass: negative OBJ indices are relative to vertices already declared,
          // and repeated identical face lines must not confuse source-position lookups.
          for (const line of source.split(/\r?\n/)) {
            // Wavefront OBJ permits comments after geometry records; ignore them before tokenizing.
            const trimmed = line.split("#", 1)[0].trim();
            if (!trimmed) continue;
            if (/^v(?:\s|$)/.test(trimmed)) {
              const parts = trimmed.split(/\s+/);
              // Standard XYZ/XYZW and common vertex-color OBJ extensions are accepted.
              // Reject trailing garbage rather than treating a malformed line as a valid vertex.
              const allowedCounts = parts.length === 4 || parts.length === 5 || parts.length === 7 || parts.length === 8;
              if (parts[0] !== "v" || !allowedCounts || parts.slice(1).some(component => !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(component) || !Number.isFinite(Number(component)))) {
                malformedVertex = true;
                break;
              }
              vertices += 1;
              if (vertices > 100_000) break;
            } else if (/^vt(?:\s|$)/.test(trimmed)) {
              const parts = trimmed.split(/\s+/);
              if (parts.length < 2 || parts.length > 4 || parts.slice(1).some(component => !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(component) || !Number.isFinite(Number(component)))) {
                malformedAttribute = true;
                break;
              }
              textureCoordinates += 1;
              if (textureCoordinates > 100_000) {
                malformedAttribute = true;
                break;
              }
            } else if (/^vn(?:\s|$)/.test(trimmed)) {
              const parts = trimmed.split(/\s+/);
              if (parts.length !== 4 || parts.slice(1).some(component => !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(component) || !Number.isFinite(Number(component)))) {
                malformedAttribute = true;
                break;
              }
              normals += 1;
              if (normals > 100_000) {
                malformedAttribute = true;
                break;
              }
            } else if (/^f(?:\s|$)/.test(trimmed)) {
              faces += 1;
              const refs = trimmed.split(/\s+/).slice(1);
              if (faces > 100_000 || refs.length < 3) {
                malformedFace = true;
                break;
              }
              const invalidIndex = (raw, count) => {
                if (!/^-?\d+$/.test(raw)) return true;
                const n = Number(raw);
                return n === 0 || n > count || n < -count;
              };
              if (refs.some(ref => {
                const parts = ref.split("/");
                if (parts.length > 3 || !parts[0] || invalidIndex(parts[0], vertices)) return true;
                if (parts.length >= 2 && parts[1] !== "" && invalidIndex(parts[1], textureCoordinates)) return true;
                if (parts.length === 2 && parts[1] === "") return true;
                if (parts.length === 3 && (parts[2] === "" || invalidIndex(parts[2], normals))) return true;
                return false;
              })) {
                malformedFace = true;
                break;
              }
            }
          }
          if (!vertices || !faces) {
            errors.push(id + ": OBJ asset must contain at least one valid vertex and face record");
          } else if (vertices > 100_000 || faces > 100_000) {
            errors.push(id + ": OBJ asset exceeds the bounded vertex/face count");
          } else if (malformedVertex) {
            errors.push(id + ": OBJ asset contains a malformed vertex record or non-finite coordinates");
          } else if (malformedAttribute) {
            errors.push(id + ": OBJ asset contains malformed or excessive texture-coordinate/normal records");
          } else if (malformedFace) {
            errors.push(id + ": OBJ asset contains a face with invalid vertex indices or too few vertices");
          }
        }
      }
    }
  }
  if (!objects.length) errors.push("Scene has no objects.");
  if (objects.length && !visibleCount) errors.push("All scene objects are hidden.");
  if (duplicateIds.size) errors.push("Duplicate scene object IDs: " + [...duplicateIds].join(", "));
  if (missingModelAssets.length) warnings.push(missingModelAssets.length + " OBJ asset(s) are missing.");
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
