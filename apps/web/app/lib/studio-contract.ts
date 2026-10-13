export type StudioProjectKind = "game" | "app";
export type StudioEngine = "canvas2d" | "webgl3d" | "webapp";
export type CapabilityLevel = "supported" | "partial" | "pipeline-dependent" | "not-verified";

export type StudioCapability = {
  id: string;
  label: string;
  level: CapabilityLevel;
  detail: string;
};

const WEB_GAME_CAPABILITIES: StudioCapability[] = [
  { id: "source-editing", label: "Editable project source", level: "supported", detail: "Generated HTML, CSS, JavaScript, JSON, and supported text assets can be edited and exported as source." },
  { id: "browser-preview", label: "Browser preview", level: "supported", detail: "The project can be previewed in a browser-compatible runtime; preview success must be observed separately from source validation." },
  { id: "input-and-game-loop", label: "Input and gameplay loop", level: "supported", detail: "Keyboard and browser pointer/touch patterns can be implemented in project code and must be validated per project." },
  { id: "3d-assets", label: "Detailed 3D assets", level: "partial", detail: "WebGL scenes and supported text model formats can be authored or imported; procedural approximations must not be described as professionally sculpted assets." },
  { id: "asset-integration", label: "Scene asset integration", level: "partial", detail: "Mesh creation, runtime loading, scene placement, materials, collision and animation are separate steps. A saved mesh is not proof it appears or works in a playable scene." },
  { id: "animation", label: "Character rigging and animation", level: "partial", detail: "Runtime animation depends on actual imported/generated assets and supported code. Never imply a rig or animation exists when it does not." },
  { id: "audio", label: "Sound and music", level: "partial", detail: "Browser audio can be implemented where supported assets and event wiring exist; music/voice generation depends on configured providers or imported assets." },
  { id: "audio-mixer", label: "Event-driven audio mixer", level: "partial", detail: "Each project must implement its own event wiring and user controls. The production contract calls for separate master/music/ambience/SFX/UI levels, safe audio unlock, mute persistence and cleanup on pause/restart where relevant." },
  { id: "spatial-audio", label: "3D positional audio", level: "partial", detail: "Requires an actual spatial audio implementation in the selected runtime; simple stereo panning is not full spatial audio." },
  { id: "physics", label: "Physics and destruction", level: "partial", detail: "Only implemented collision and simulation behavior may be claimed; visual effects alone do not make an object physically destructible." },
  { id: "online-multiplayer", label: "Online multiplayer", level: "pipeline-dependent", detail: "Requires a real server/network implementation and a two-client integration test. Local co-op or a mock is not online multiplayer." },
  { id: "native-binaries", label: "Native EXE/APK", level: "pipeline-dependent", detail: "Only claim a native artifact when a configured native build pipeline produced it and its artifact/launch checks passed. A web ZIP or wrapper is not equivalent to a native game." }
];

const WEB_APP_CAPABILITIES: StudioCapability[] = [
  { id: "source-editing", label: "Editable project source", level: "supported", detail: "Generated HTML, CSS, JavaScript, JSON, and supported text assets can be edited and exported as source." },
  { id: "browser-preview", label: "Browser preview", level: "supported", detail: "The project can be previewed in a browser-compatible runtime; preview success must be observed separately from source validation." },
  { id: "interactive-flows", label: "Interactive user flows", level: "supported", detail: "Controls must change real state, validate input, and show loading, empty, success, and recoverable error states as appropriate." },
  { id: "persistent-backend", label: "Remote persistence/backend", level: "pipeline-dependent", detail: "Requires a real configured backend and verified authorization/data ownership; local browser storage must not be described as server persistence." },
  { id: "authentication", label: "Production authentication", level: "pipeline-dependent", detail: "Requires a real configured identity provider and tested server-side authorization; a login-looking screen is not authentication." },
  { id: "native-binaries", label: "Native EXE/APK", level: "pipeline-dependent", detail: "Only claim a native artifact when a configured native build pipeline produced it and its artifact/launch checks passed." }
];

export function getStudioCapabilities(kind: StudioProjectKind, engine: StudioEngine): StudioCapability[] {
  const base = kind === "app" ? WEB_APP_CAPABILITIES : WEB_GAME_CAPABILITIES;
  if (kind === "app" && engine !== "webapp") {
    return [{ id: "engine-mismatch", label: "Engine selection", level: "not-verified", detail: "Apps in this builder must use the webapp engine." }, ...base];
  }
  if (kind === "game" && engine === "webapp") {
    return [{ id: "engine-mismatch", label: "Engine selection", level: "not-verified", detail: "Games must use canvas2d or webgl3d." }, ...base];
  }
  return base.map(item => ({ ...item }));
}

export function buildStudioContract(kind: StudioProjectKind, engine: StudioEngine, operation: string): string {
  const capabilities = getStudioCapabilities(kind, engine);
  const capabilityLines = capabilities.map(item => "- " + item.label + " [" + item.level + "]: " + item.detail).join("\n");
  const gameSpecific = kind === "game" ? [
    "GAME PRODUCTION GATES:",
    "1. Prove the core loop, controls, objective, pause/restart and win/loss path before adding broad content.",
    "2. Prefer a polished, coherent vertical slice over a huge world full of placeholders.",
    "3. Keep one canonical art direction: scale, palette, silhouette, material, lighting, camera, UI and asset conventions must agree.",
    "4. Separate playable blockout, procedural approximation, imported authored asset and verified detailed asset. Label them honestly.",
    "5. Design levels around a reachable critical path, safe spawns, clear objectives, checkpoints and tested recovery.",
    "6. Synchronize gameplay, animation, audio and VFX through named events when those systems actually exist.",
    "7. Budget geometry, effects, sound, memory and frame time for the declared target; offer cheaper fallbacks for weak hardware.",
    "8. Do not claim AAA/AAA-quality output, realistic physics, rigged animation, spatial audio, online multiplayer, or native builds without evidence.",
    "9. SOUND SYSTEM ACCEPTANCE: when the requested game needs sound, implement a cohesive event-driven audio layer, not random beeps. Define named events for UI, player actions, impacts, enemy states, objectives, transitions and outcomes; group music, ambience, SFX and UI into independently adjustable buses; provide master/music/SFX sliders and a persistent mute toggle when the game has settings; respect browser autoplay restrictions by unlocking audio only after a user gesture; avoid clipping, excessive overlapping voices and audio continuing after pause/restart; use short procedural Web Audio effects only as a fallback when actual audio assets are unavailable.",
    "10. SOUND HONESTY: do not label generated oscillator tones as recorded instruments or licensed music. Do not claim positional 3D audio unless listener/source positioning and attenuation are implemented. Provide graceful silence/fallback when audio initialization is blocked, and never let audio errors stop gameplay.",
    "11. 3D ASSET ACCEPTANCE: every important object needs a readable silhouette, deliberate proportions, material/color variation, consistent scale and lighting. Prefer reusable modular parts and authored GLB/glTF/OBJ assets when available; use primitive blockouts only for early greyboxing or intentionally minimalist art. Validate triangle/material budgets and do not invent rigging, UVs, textures or animations that are absent."
  ] : [
    "APPLICATION PRODUCTION GATES:",
    "1. Build the real primary user journey, not a static visual mockup.",
    "2. Connect every visible control to state or a real action and validate loading, empty, success, and recoverable error states.",
    "3. Distinguish browser-local persistence from a remote database and a visual login from real authentication.",
    "4. Validate responsive layout, keyboard navigation, labels, focus states, and data ownership before claiming production readiness."
  ];
  return [
    "GENE STUDIO CONTRACT (enforced design guidance; capability levels are not proof that a feature is implemented):",
    "Project kind: " + kind + ". Engine: " + engine + ". Operation: " + operation + ".",
    "CAPABILITY MATRIX:",
    capabilityLines,
    ...gameSpecific,
    "CHANGE SAFETY:",
    "- Preserve approved requirements and unrelated working behavior; edit the smallest relevant set of files.",
    "- Keep stable IDs and references when replacing assets; never silently overwrite user-authored work.",
    "- Treat build success, source validation, preview rendering, playable behavior, and native artifact verification as separate checks.",
    "- If a requested feature exceeds the current runtime or available assets/providers, explain the limitation and implement the strongest honest supported fallback.",
    "- Never invent tests, assets, model quality, licenses, backend services, multiplayer clients, or binaries. State what remains unverified.",
    "This contract must shape the actual plan/code for this request, not merely be repeated in the response."
  ].join("\n");
}
