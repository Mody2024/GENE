const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const CAMERA_PROFILES = [
  { match: /first.?person|fps|immersive shooter/i, profile: "first-person", type: "perspective", fov: 82, height: 1.65, distance: 0, smoothing: 0.12, lookAhead: 0.7, framing: "Keep the horizon readable, weapon/hands below center, and avoid excessive head bob. Clamp pitch and prevent camera penetration into walls." },
  { match: /third.?person|over.?the.?shoulder|character action|soulslike/i, profile: "third-person", type: "perspective", fov: 68, height: 2.3, distance: 5.2, smoothing: 0.1, lookAhead: 1.1, framing: "Keep the character around the lower-middle third; use shoulder offset only when it improves aiming. Smooth follow, collision-aware zoom, wall avoidance, and fade occluding geometry when possible." },
  { match: /isometric|tactics|tactical rpg/i, profile: "isometric", type: "orthographic", fov: 50, height: 12, distance: 12, smoothing: 0.14, lookAhead: 0.3, framing: "Use a stable 30–45 degree diagonal view, orthographic-like scale, readable ground footprints, and consistent depth sorting. Do not rotate the view unexpectedly." },
  { match: /top.?down|arena|twin.?stick|bullet.?hell|management sim/i, profile: "top-down", type: "orthographic", fov: 55, height: 14, distance: 14, smoothing: 0.16, lookAhead: 0.45, framing: "Keep the player and nearby threats visible at once; zoom out with crowd density, reserve HUD space, and do not let the camera hide incoming hazards." },
  { match: /platformer|side.?scroller|metroidvania|precision jump/i, profile: "side-scroller", type: "orthographic", fov: 55, height: 5, distance: 8, smoothing: 0.12, lookAhead: 2.2, framing: "Use horizontal look-ahead in the movement direction, show landing surfaces before the player commits, keep the player away from screen edges, and avoid vertical camera oscillation." },
  { match: /racing|driving|vehicle|truck|car game/i, profile: "chase-driving", type: "perspective", fov: 74, height: 3.1, distance: 7.5, smoothing: 0.08, lookAhead: 3, framing: "Aim ahead of the vehicle, retain road horizon and upcoming turns, smooth steering-induced motion, and prevent the vehicle or road edges from being cropped." },
  { match: /rhythm|geometry.?dash|runner|endless runner/i, profile: "forward-runner", type: "orthographic", fov: 55, height: 4, distance: 9, smoothing: 0.04, lookAhead: 3.5, framing: "Prioritize predictable obstacle readability and timing. Keep the player and next hazard visible together; camera motion must not distort rhythm or collision expectations." }
];

export function recommendCamera({ intent = "", engine = "canvas2d", platform = "desktop" } = {}) {
  const text = String(intent).slice(0, 12000);
  const profile = CAMERA_PROFILES.find(item => item.match.test(text));
  const is3d = engine === "webgl3d";
  const mobile = platform === "mobile" || /mobile|android|touch/i.test(text);
  const selected = profile || (is3d
    ? { profile: "third-person", type: "perspective", fov: 68, height: 2.3, distance: 5.2, smoothing: 0.1, lookAhead: 0.8, framing: "Keep the controlled character and objective visible; preserve depth cues and use collision-aware follow." }
    : { profile: "follow-2d", type: "orthographic", fov: 55, height: 0, distance: 0, smoothing: 0.12, lookAhead: 0.6, framing: "Use a stable 2D follow camera with clear objective visibility and minimal motion." });
  return {
    version: 1, profile: selected.profile,
    projection: is3d && selected.type === "perspective" ? "perspective" : "orthographic",
    fov: clamp(Number(selected.fov) || 55, 35, 95),
    height: clamp(Number(selected.height) || 0, 0, 40),
    distance: clamp(Number(selected.distance) || 0, 0, 40),
    smoothing: clamp(Number(selected.smoothing) || 0.12, 0.02, 0.35),
    lookAhead: clamp(Number(selected.lookAhead) || 0, 0, 6),
    mobile, framing: selected.framing,
    checks: [
      "Keep the player, next objective, and immediate threats in a readable frame.",
      "Test camera behavior at minimum and maximum movement speed and at screen resize.",
      "Check wall/geometry clipping, sudden snapping, jitter, excessive lag, and important objects hidden behind scenery.",
      mobile ? "Reserve safe areas for touch controls and mobile HUD; do not cover the active playfield." : "Reserve consistent safe areas for HUD and menus.",
      "If occlusion handling or camera collision is not implemented in this runtime, state the limitation instead of claiming it exists."
    ]
  };
}

export function formatCameraContract(intent, engine = "canvas2d") {
  const camera = recommendCamera({ intent, engine });
  return [
    "CAMERA INTELLIGENCE CONTRACT (recommended starting profile, not a claim that a camera tool has run):",
    "Profile=" + camera.profile + "; projection=" + camera.projection + "; FOV=" + camera.fov + "; height=" + camera.height + "; distance=" + camera.distance + "; smoothing=" + camera.smoothing + "; lookAhead=" + camera.lookAhead + ".",
    camera.framing,
    ...camera.checks.map((check, index) => (index + 1) + ". " + check),
    "Adapt values to actual world scale and engine. For Canvas 2D, implement the equivalent framing/offset rather than pretending a 3D camera exists. Keep camera settings in game-spec.json when the schema permits; ensure preview and game use the same values."
  ].join("\n");
}
