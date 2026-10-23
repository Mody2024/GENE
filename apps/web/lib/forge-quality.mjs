const SHAPE_TRIANGLE_ESTIMATES = {
  box: 12, beveledBox: 44, sphere: 80, cylinder: 44,
  cone: 24, wedge: 8, torus: 256, capsule: 168, stairs: 60, arch: 192
};

function rotateHalfExtents(scale, rotation) {
  // Mirroring with negative scale must not create negative half-extents in world bounds.
  const [x, y, z] = scale.map(value => Math.abs(value) / 2);
  const toRad = value => value * Math.PI / 180;
  const [rx, ry, rz] = rotation.map(toRad);
  const cx = Math.cos(rx), sx = Math.sin(rx);
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const cz = Math.cos(rz), sz = Math.sin(rz);
  // Absolute values of Rz * Ry * Rx, multiplied by half-extents.
  const r00 = cz * cy, r01 = cz * sy * sx - sz * cx, r02 = cz * sy * cx + sz * sx;
  const r10 = sz * cy, r11 = sz * sy * sx + cz * cx, r12 = sz * sy * cx - cz * sx;
  const r20 = -sy, r21 = cy * sx, r22 = cy * cx;
  return [
    Math.abs(r00) * x + Math.abs(r01) * y + Math.abs(r02) * z,
    Math.abs(r10) * x + Math.abs(r11) * y + Math.abs(r12) * z,
    Math.abs(r20) * x + Math.abs(r21) * y + Math.abs(r22) * z
  ];
}

/**
 * Deterministic structural QA only. It cannot detect artistic defects or prove visual quality.
 * Returns actionable warnings plus conservative world bounds and a rough complexity estimate.
 */
export function analyzeForgeRecipe(recipe) {
  const parts = Array.isArray(recipe?.parts) ? recipe.parts : [];
  const warnings = [];
  const nameCounts = new Map();
  const transformCounts = new Map();
  const colors = new Set();
  const surfaces = new Set();
  let estimatedTriangles = 0;
  let invalidShapeCount = 0;
  let invalidTransformCount = 0;
  let degenerateScaleCount = 0;
  let missingNameCount = 0;
  let invalidColorCount = 0;
  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];

  for (const part of parts) {
    const name = String(part?.name || "").trim();
    const key = name.toLowerCase();
    if (!name) missingNameCount++;
    nameCounts.set(key, (nameCounts.get(key) || 0) + 1);
    const color = String(part?.color || "").toLowerCase();
    if (!/^#[0-9a-f]{6}$/i.test(color)) invalidColorCount++;
    colors.add(color);
    surfaces.add(String(part?.surface || "matte"));
    if (Object.prototype.hasOwnProperty.call(SHAPE_TRIANGLE_ESTIMATES, part?.shape)) estimatedTriangles += SHAPE_TRIANGLE_ESTIMATES[part.shape];
    else invalidShapeCount++;

    const transformKey = JSON.stringify([part?.shape, part?.position, part?.scale, part?.rotation, part?.color, part?.surface]);
    transformCounts.set(transformKey, (transformCounts.get(transformKey) || 0) + 1);

    if (!Array.isArray(part?.position) || part.position.length !== 3 || !Array.isArray(part?.scale) || part.scale.length !== 3 || !Array.isArray(part?.rotation) || part.rotation.length !== 3) { invalidTransformCount++; continue; }
    if (![...part.position, ...part.scale, ...part.rotation].every(Number.isFinite)) { invalidTransformCount++; continue; }
    if (part.scale.some(value => Math.abs(value) < 0.0001)) { degenerateScaleCount++; continue; }
    const extents = rotateHalfExtents(part.scale, part.rotation);
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], part.position[axis] - extents[axis]);
      max[axis] = Math.max(max[axis], part.position[axis] + extents[axis]);
    }
  }

  if (!parts.length) warnings.push({ code: "EMPTY_ASSET", severity: "error", message: "No geometry parts were supplied; this is an empty asset, not a finished model." });
  if (invalidShapeCount) warnings.push({ code: "UNSUPPORTED_SHAPE", severity: "error", message: "Some parts use unknown shapes and cannot be estimated reliably.", count: invalidShapeCount });
  if (invalidTransformCount) warnings.push({ code: "INVALID_TRANSFORM", severity: "error", message: "Some parts have missing, malformed or non-finite transforms; bounds exclude those parts.", count: invalidTransformCount });
  if (degenerateScaleCount) warnings.push({ code: "DEGENERATE_SCALE", severity: "error", message: "Some parts have near-zero scale and may be invisible or unusable.", count: degenerateScaleCount });
  if (missingNameCount) warnings.push({ code: "MISSING_PART_NAME", severity: "warning", message: "Every part should have a stable, non-empty name for editing and diagnostics.", count: missingNameCount });
  if (invalidColorCount) warnings.push({ code: "INVALID_COLOR", severity: "warning", message: "Some parts have missing or invalid hex colors; the runtime may fall back to a default material.", count: invalidColorCount });

  const duplicateNames = [...nameCounts.entries()].filter(([, count]) => count > 1).map(([name]) => name);
  if (duplicateNames.length) warnings.push({ code: "DUPLICATE_PART_NAMES", severity: "warning", message: "Some parts share names; rename them for reliable editing and debugging.", parts: duplicateNames.slice(0, 8) });

  const exactDuplicates = [...transformCounts.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
  if (exactDuplicates) warnings.push({ code: "IDENTICAL_PARTS", severity: "warning", message: "Identical parts occupy identical transforms; check for accidental duplicates.", count: exactDuplicates });

  if (parts.length >= 12 && colors.size > Math.max(10, Math.ceil(parts.length * 0.65))) {
    warnings.push({ code: "PALETTE_FRAGMENTATION", severity: "info", message: "The asset uses many distinct colors; review whether they form a coherent palette.", distinctColors: colors.size });
  }
  if (Number.isFinite(min[1]) && min[1] > 0.5) {
    warnings.push({ code: "POSSIBLE_FLOATING_ASSET", severity: "warning", message: "The lowest estimated geometry is well above ground level; verify the intended origin and ground contact.", lowestY: Number(min[1].toFixed(3)) });
  }
  if (Number.isFinite(min[1]) && min[1] < -0.5) {
    warnings.push({ code: "BELOW_GROUND_GEOMETRY", severity: "info", message: "Some geometry extends below the ground plane; this may be intentional for foundations or buried objects.", lowestY: Number(min[1].toFixed(3)) });
  }

  const bounds = Number.isFinite(min[0]) ? {
    min: min.map(value => Number(value.toFixed(3))),
    max: max.map(value => Number(value.toFixed(3))),
    size: min.map((value, index) => Number((max[index] - value).toFixed(3)))
  } : { min: [0, 0, 0], max: [0, 0, 0], size: [0, 0, 0] };
  if (bounds.size.some(size => size > 35)) warnings.push({ code: "LARGE_WORLD_BOUNDS", severity: "warning", message: "The assembled asset spans a large world-space area; verify scale and origin.", size: bounds.size });

  const penalties = warnings.reduce((sum, warning) => sum + (warning.severity === "error" ? 25 : warning.severity === "warning" ? 12 : 4), 0);
  const score = Math.max(0, 100 - penalties);
  return {
    version: 1,
    scope: "structural-only",
    status: warnings.some(item => item.severity === "error") ? "invalid" : warnings.some(item => item.severity === "warning") ? "review-recommended" : "structurally-clean",
    score,
    partCount: parts.length,
    distinctColors: colors.size,
    materialSurfaceCount: surfaces.size,
    estimatedTriangles,
    bounds,
    warnings
  };
}
