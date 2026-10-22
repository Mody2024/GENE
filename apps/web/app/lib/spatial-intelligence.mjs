const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const vec3 = (value, fallback = [0, 0, 0]) => Array.isArray(value)
  ? [0, 1, 2].map(i => finite(value[i], fallback[i]))
  : value && typeof value === "object"
    ? [finite(value.x, fallback[0]), finite(value.y, fallback[1]), finite(value.z, fallback[2])]
    : [...fallback];

function rotationMatrix(rotation) {
  const [x, y, z] = rotation.map(deg => deg * Math.PI / 180);
  const cx = Math.cos(x), sx = Math.sin(x);
  const cy = Math.cos(y), sy = Math.sin(y);
  const cz = Math.cos(z), sz = Math.sin(z);
  // Rz * Ry * Rx, row-major.
  return [
    [cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx],
    [sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx],
    [-sy, cy * sx, cy * cx]
  ];
}

/** Conservative world-space AABB for an object with position, scale/size and Euler rotation. */
export function getWorldAabb(object = {}) {
  const position = vec3(object.position ?? object.translation);
  const scale = vec3(object.scale ?? object.size, [1, 1, 1]).map(value => Math.max(0.001, Math.abs(value)));
  const rotation = vec3(object.rotation);
  const matrix = rotationMatrix(rotation);
  const half = scale.map(value => value / 2);
  const extent = [0, 1, 2].map(row => Math.abs(matrix[row][0]) * half[0] + Math.abs(matrix[row][1]) * half[1] + Math.abs(matrix[row][2]) * half[2]);
  return {
    min: position.map((value, i) => value - extent[i]),
    max: position.map((value, i) => value + extent[i]),
    center: position,
    size: extent.map(value => value * 2)
  };
}

export function aabbIntersects(a, b, padding = 0) {
  if (!a?.min || !a?.max || !b?.min || !b?.max) return false;
  const pad = Math.max(0, finite(padding));
  return [0, 1, 2].every(axis => a.min[axis] <= b.max[axis] + pad && a.max[axis] + pad >= b.min[axis]);
}

export function auditSceneLayout({ objects = [], bounds, spawnId, goalId, camera } = {}) {
  const warnings = [];
  const ids = new Set();
  const byId = new Map();
  const world = bounds && Array.isArray(bounds.min) && Array.isArray(bounds.max)
    ? { min: vec3(bounds.min), max: vec3(bounds.max) }
    : null;
  for (const object of objects) {
    const id = String(object?.id || object?.name || "object-" + (ids.size + 1));
    if (ids.has(id)) warnings.push({ code: "DUPLICATE_OBJECT_ID", id, message: "Object IDs must be unique." });
    ids.add(id);
    const aabb = getWorldAabb(object);
    byId.set(id, { object, aabb });
    if (world && [0, 1, 2].some(axis => aabb.min[axis] < world.min[axis] || aabb.max[axis] > world.max[axis])) {
      warnings.push({ code: "OUTSIDE_PLAYABLE_BOUNDS", id, message: "Object extends beyond the declared playable world bounds." });
    }
    if (object?.visible === false && (id === spawnId || id === goalId)) {
      warnings.push({ code: "HIDDEN_CRITICAL_OBJECT", id, message: "The player spawn or goal is marked invisible." });
    }
  }
  const spawn = byId.get(spawnId);
  const goal = byId.get(goalId);
  if (spawnId && !spawn) warnings.push({ code: "MISSING_SPAWN_OBJECT", id: String(spawnId), message: "The declared player spawn does not match an object in the scene." });
  if (goalId && !goal) warnings.push({ code: "MISSING_GOAL_OBJECT", id: String(goalId), message: "The declared goal does not match an object in the scene." });
  if (spawn) {
    for (const [id, item] of byId) {
      if (id === spawnId || item.object?.solid === false || item.object?.role === "decoration") continue;
      if (aabbIntersects(spawn.aabb, item.aabb)) {
        warnings.push({ code: item.object?.role === "hazard" ? "HAZARD_OVERLAPS_SPAWN" : "SPAWN_OVERLAP", id, message: "Spawn intersects another gameplay object; verify the start is safe and playable." });
      }
    }
  }
  if (goal) {
    for (const [id, item] of byId) {
      if (id === goalId || id === spawnId || item.object?.solid === false || item.object?.role === "decoration") continue;
      const role = String(item.object?.role || "").toLowerCase();
      const blocksGoal = item.object?.solid === true || ["hazard", "obstacle", "blocker", "wall", "barrier"].includes(role);
      if (blocksGoal && aabbIntersects(goal.aabb, item.aabb)) {
        warnings.push({ code: role === "hazard" ? "HAZARD_OVERLAPS_GOAL" : "GOAL_BLOCKED", id, message: "A solid obstacle or hazard overlaps the goal; verify the objective can be reached." });
      }
    }
    if (spawn && aabbIntersects(spawn.aabb, goal.aabb)) {
      warnings.push({ code: "GOAL_OVERLAPS_SPAWN", id: String(goalId), message: "The goal overlaps the player spawn; verify the opening objective and route are intentional." });
    }
  }
  const cameraData = camera && typeof camera === "object" ? {
    fov: clamp(finite(camera.fov, 68), 35, 95),
    near: Math.max(0.001, finite(camera.near, 0.1)),
    far: Math.max(1, finite(camera.far, 1000)),
    distance: Math.max(0, finite(camera.distance, 5)),
    height: finite(camera.height, 2)
  } : null;
  if (cameraData && cameraData.far <= cameraData.near) warnings.push({ code: "INVALID_CAMERA_CLIP", message: "Camera far plane must be greater than its near plane." });
  return {
    version: 1,
    objectCount: objects.length,
    bounds: world,
    camera: cameraData,
    warnings,
    passed: warnings.length === 0
  };
}

/**
 * Estimate a conservative equal-height jump gap from the game's movement physics.
 * This is a planning estimate, not a replacement for collision-aware playtesting.
 */
export function recommendJumpLayout({
  horizontalSpeed = 5,
  jumpVelocity = 8,
  gravity = 18,
  playerWidth = 0.8,
  safetyMargin = 0.35
} = {}) {
  const speed = Math.max(0, finite(horizontalSpeed, 5));
  const impulse = Math.max(0, finite(jumpVelocity, 8));
  const pull = Math.max(0.001, Math.abs(finite(gravity, 18)));
  const width = Math.max(0, finite(playerWidth, 0.8));
  const margin = Math.max(0, finite(safetyMargin, 0.35));
  const airtime = (2 * impulse) / pull;
  const theoreticalDistance = speed * airtime;
  const safeGap = Math.max(0, theoreticalDistance - width - margin);
  return {
    assumptions: "equal-height takeoff and landing; constant horizontal speed; no mid-air acceleration or collision losses",
    airtimeSeconds: Number(airtime.toFixed(3)),
    theoreticalDistance: Number(theoreticalDistance.toFixed(3)),
    recommendedMaximumGap: Number(safeGap.toFixed(3)),
    safetyMargin: margin,
    warning: "Treat this as a conservative layout estimate; validate with the actual player collider, movement code, and deterministic gameplay tests."
  };
}

/** Estimate a useful perspective camera distance from a known scene bounding box. */
export function recommendCameraFraming({ bounds, fov = 68, aspectRatio = 16 / 9, margin = 1.18 } = {}) {
  const min = vec3(bounds?.min);
  const max = vec3(bounds?.max, [10, 5, 10]);
  const size = max.map((value, axis) => Math.max(0.1, Math.abs(value - min[axis])));
  const radius = Math.hypot(size[0], size[1], size[2]) / 2;
  const verticalFov = clamp(finite(fov, 68), 35, 95) * Math.PI / 180;
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * Math.max(0.2, finite(aspectRatio, 16 / 9)));
  const limitingFov = Math.min(verticalFov, horizontalFov);
  const distance = radius / Math.max(0.05, Math.sin(limitingFov / 2)) * clamp(finite(margin, 1.18), 1.02, 1.8);
  return {
    target: min.map((value, axis) => (value + max[axis]) / 2),
    distance: Number(distance.toFixed(3)),
    fov: clamp(finite(fov, 68), 35, 95),
    near: Math.max(0.03, Number((distance / 500).toFixed(3))),
    far: Math.max(100, Number((distance * 12).toFixed(2))),
    framing: "Fit the scene bounds with margin, keep the player and next objective visible, then validate from actual gameplay viewpoints."
  };
}

export function formatSpatialContract(intent = "", engine = "canvas2d") {
  const is3d = engine === "webgl3d";
  return [
    "SPATIAL INTELLIGENCE CONTRACT (apply before placing entities):",
    "Define world units, origin, ground height, world bounds, player collider, camera framing, spawn, goal and interaction distances before laying out the level.",
    is3d
      ? "3D sizing: use consistent world units; estimate model bounds from transformed mesh dimensions; match collider extents to visible geometry; use ground-contact positions and stable Y-up orientation; keep camera near/far planes and field of view consistent with world scale."
      : "2D sizing: define one world-to-screen transform; size sprites and colliders in world units; derive screen positions from the same camera offset/scale used for drawing; preserve tile alignment and resize-safe HUD margins.",
    "Placement: use a deterministic layout pass with IDs and roles. Spawn must be visible, grounded where appropriate, and clear of hazards; the opening route must be unobstructed; goals and pickups must lie inside bounds; decoration cannot block critical gameplay.",
    "Reachability: derive gap/obstacle spacing from movement speed, gravity, jump impulse, collider width, and reaction time. For equal-height jumps, estimate airtime as 2 * jumpVelocity / gravity and horizontal distance as horizontalSpeed * airtime; subtract collider width and a safety margin to get a conservative gap. This is only a planning estimate; validate with actual collision-aware movement tests. If reachability cannot be calculated exactly, simplify the route.",
    "Camera: fit the playable area and important objectives; avoid near/far clipping, wall penetration, sudden snapping, jitter, hidden hazards and HUD overlap. For mobile, reserve touch-control safe areas and size touch targets for fingers.",
    "Before completion, inspect actual transformed bounds and run a layout audit for objects outside bounds, duplicate IDs, hidden critical objects, spawn collisions, and unreachable objectives. Treat automated geometry checks as warnings to verify, not as proof of full gameplay. Do not claim a layout or camera test ran unless it did.",
    "Game intent: " + String(intent).slice(0, 900)
  ].join("\n");
}
