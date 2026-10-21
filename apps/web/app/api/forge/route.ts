import { NextRequest, NextResponse } from "next/server";
import { runAlternateChain } from "../../lib/providers";
import { buildNativeForgeRecipe } from "../../../lib/forge-presets.mjs";

export const runtime = "nodejs";
export const maxDuration = 60;

type Shape = "box" | "beveledBox" | "sphere" | "cylinder" | "cone" | "wedge" | "torus" | "capsule";
type Surface = "matte" | "metal" | "rubber" | "glass" | "emissive";
type Vec3 = [number, number, number];
type Part = {
  name: string;
  shape: Shape;
  position: Vec3;
  scale: Vec3;
  rotation: Vec3;
  color: string;
  surface: Surface;
};
type Recipe = { name: string; kind: string; style: string; parts: Part[]; notes?: string };

const KINDS = new Set(["character", "vehicle", "building", "environment", "prop", "weapon"]);
const SHAPES = new Set<Shape>(["box", "beveledBox", "sphere", "cylinder", "cone", "wedge", "torus", "capsule"]);
const SURFACES = new Set<Surface>(["matte", "metal", "rubber", "glass", "emissive"]);
const SHAPE_LIMITS: Record<string, number> = { performance: 32, standard: 54, high: 76 };

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
function fail(status: number, code: string, message: string) {
  return json(status, { ok: false, error: { code, message } });
}
function isVec3(value: unknown): value is Vec3 {
  return Array.isArray(value) && value.length === 3 && value.every(n => typeof n === "number" && Number.isFinite(n));
}
function safeColor(value: unknown) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : "#84958f";
}
function safeName(value: unknown, fallback: string) {
  const result = typeof value === "string" ? value.trim().replace(/[^a-zA-Z0-9 _-]/g, "").replace(/\s+/g, " ").slice(0, 60) : "";
  return result || fallback;
}
function normalizeRecipe(raw: any, kind: string, quality: string): Recipe {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Model recipe must be a JSON object.");
  if (!Array.isArray(raw.parts)) throw new Error("Model recipe needs a parts array.");
  const limit = SHAPE_LIMITS[quality] || SHAPE_LIMITS.standard;
  if (raw.parts.length < 3 || raw.parts.length > limit) throw new Error("Model returned " + raw.parts.length + " parts; expected between 3 and " + limit + ".");
  const parts: Part[] = raw.parts.map((part: any, index: number) => {
    if (!part || typeof part !== "object" || !SHAPES.has(part.shape)) throw new Error("Part " + index + " has an unsupported shape.");
    const position: Vec3 = isVec3(part.position) ? part.position : [0, 0, 0];
    const scale: Vec3 = isVec3(part.scale) ? part.scale : [1, 1, 1];
    const rotation: Vec3 = isVec3(part.rotation) ? part.rotation : [0, 0, 0];
    if (position.some(n => Math.abs(n) > 40)) throw new Error("Part " + index + " position exceeds the asset bounds.");
    if (scale.some(n => n <= 0.03 || n > 20)) throw new Error("Part " + index + " scale is outside the safe range.");
    if (rotation.some(n => Math.abs(n) > 360)) throw new Error("Part " + index + " rotation exceeds 360 degrees.");
    return {
      name: safeName(part.name, "part-" + (index + 1)).replace(/\s+/g, "_"),
      shape: part.shape as Shape,
      position,
      scale,
      rotation,
      color: safeColor(part.color),
      surface: SURFACES.has(part.surface) ? part.surface as Surface : "matte"
    };
  });
  return {
    name: safeName(raw.name, "GENE " + kind),
    kind,
    style: safeName(raw.style, "stylized game-ready"),
    parts,
    notes: typeof raw.notes === "string" ? raw.notes.slice(0, 1200) : ""
  };
}
function rgb(color: string): [number, number, number] {
  return [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16) / 255) as [number, number, number];
}
function geometry(shape: Shape, scale: Vec3): { vertices: Vec3[]; faces: number[][] } {
  const vertices: Vec3[] = [];
  const faces: number[][] = [];
  if (shape === "beveledBox") {
    const half = scale.map(n => n / 2) as Vec3;
    const bevel = Math.min(...half) * 0.14;
    const cornerIndices = new Map<string, number[]>();
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      const key = [sx, sy, sz].join(",");
      const points: Vec3[] = [
        [sx * (half[0] - bevel), sy * half[1], sz * half[2]],
        [sx * half[0], sy * (half[1] - bevel), sz * half[2]],
        [sx * half[0], sy * half[1], sz * (half[2] - bevel)]
      ];
      const ids: number[] = [];
      for (const point of points) { vertices.push(point); ids.push(vertices.length); }
      cornerIndices.set(key, ids);
      faces.push(ids);
    }
    const eps = 1e-5;
    const triangulate = (ids: number[], u: (p: Vec3) => number, v: (p: Vec3) => number) => {
      if (ids.length < 3) return;
      const centerU = ids.reduce((sum, id) => sum + u(vertices[id - 1]), 0) / ids.length;
      const centerV = ids.reduce((sum, id) => sum + v(vertices[id - 1]), 0) / ids.length;
      ids.sort((a, b) => Math.atan2(v(vertices[a - 1]) - centerV, u(vertices[a - 1]) - centerU) - Math.atan2(v(vertices[b - 1]) - centerV, u(vertices[b - 1]) - centerU));
      for (let i = 1; i < ids.length - 1; i++) faces.push([ids[0], ids[i], ids[i + 1]]);
    };
    faces.length = 0;
    for (let axis = 0; axis < 3; axis++) for (const sign of [-1, 1]) {
      const ids = vertices.map((point, index) => Math.abs(point[axis] - sign * half[axis]) < eps ? index + 1 : 0).filter(Boolean);
      triangulate(ids, point => point[(axis + 1) % 3], point => point[(axis + 2) % 3]);
    }
    for (let axisA = 0; axisA < 3; axisA++) for (let axisB = axisA + 1; axisB < 3; axisB++) {
      const axisC = 3 - axisA - axisB;
      for (const signA of [-1, 1]) for (const signB of [-1, 1]) {
        const ids = vertices.map((point, index) => {
          const matches = Math.sign(point[axisA]) === signA && Math.sign(point[axisB]) === signB && Math.abs(Math.abs(point[axisC]) - half[axisC]) < eps;
          return matches && (Math.abs(point[axisA]) < half[axisA] - eps || Math.abs(point[axisB]) < half[axisB] - eps) ? index + 1 : 0;
        }).filter(Boolean);
        triangulate(ids, point => signA * point[axisA] - signB * point[axisB], point => point[axisC]);
      }
    }
    for (const ids of cornerIndices.values()) faces.push(ids);
  } else if (shape === "box") {
    const [x, y, z] = scale.map(n => n / 2) as Vec3;
    vertices.push([-x,-y,-z],[x,-y,-z],[x,y,-z],[-x,y,-z],[-x,-y,z],[x,-y,z],[x,y,z],[-x,y,z]);
    const quads = [[1,4,3,2],[5,6,7,8],[1,2,6,5],[2,3,7,6],[3,4,8,7],[4,1,5,8]];
    for (const q of quads) { faces.push([q[0],q[1],q[2]],[q[0],q[2],q[3]]); }
  } else if (shape === "wedge") {
    const [x, y, z] = scale.map(n => n / 2) as Vec3;
    vertices.push(
      [-x,-y,-z],[x,-y,-z],[-x,y,-z],[x,y,-z],
      [-x,-y,z],[x,-y,z]
    );
    faces.push(
      [1,3,2],[2,3,4],
      [1,2,6],[1,6,5],
      [1,5,3],[3,5,6],[3,6,4],
      [2,4,6]
    );
  } else if (shape === "torus") {
    const majorSegments = 16, tubeSegments = 8;
    const rx = scale[0] * 0.34, rz = scale[2] * 0.34;
    const tubeXZ = Math.min(scale[0], scale[2]) * 0.16;
    const tubeY = Math.min(scale[1] * 0.42, tubeXZ);
    for (let i = 0; i < majorSegments; i++) {
      const u = i / majorSegments * Math.PI * 2;
      for (let j = 0; j < tubeSegments; j++) {
        const v = j / tubeSegments * Math.PI * 2;
        const radial = Math.cos(v);
        vertices.push([
          Math.cos(u) * (rx + tubeXZ * radial),
          Math.sin(v) * tubeY,
          Math.sin(u) * (rz + tubeXZ * radial)
        ]);
      }
    }
    for (let i = 0; i < majorSegments; i++) for (let j = 0; j < tubeSegments; j++) {
      const nextI = (i + 1) % majorSegments, nextJ = (j + 1) % tubeSegments;
      const a = i * tubeSegments + j + 1;
      const b = i * tubeSegments + nextJ + 1;
      const c = nextI * tubeSegments + nextJ + 1;
      const d = nextI * tubeSegments + j + 1;
      faces.push([a,b,d],[b,c,d]);
    }
  } else if (shape === "capsule") {
    // UV-style capsule: two hemispheres connected by a cylindrical middle.
    // Keep the radius bounded by X/Z and the total length by Y.
    const segments = 12;
    const radiusX = scale[0] / 2;
    const radiusZ = scale[2] / 2;
    const radius = Math.min(radiusX, radiusZ);
    const halfCylinder = Math.max(0, scale[1] / 2 - radius);
    const profile: Array<[number, number]> = [];
    for (const angle of [-Math.PI / 2, -Math.PI / 3, -Math.PI / 6, 0]) {
      profile.push([radius * Math.cos(angle), -halfCylinder + radius * Math.sin(angle)]);
    }
    for (const angle of [0, Math.PI / 6, Math.PI / 3, Math.PI / 2]) {
      profile.push([radius * Math.cos(angle), halfCylinder + radius * Math.sin(angle)]);
    }
    for (const [radial, y] of profile) {
      for (let i = 0; i < segments; i++) {
        const angle = i / segments * Math.PI * 2;
        vertices.push([Math.cos(angle) * (radial / radius * radiusX), y, Math.sin(angle) * (radial / radius * radiusZ)]);
      }
    }
    for (let ring = 0; ring < profile.length - 1; ring++) for (let i = 0; i < segments; i++) {
      const next = (i + 1) % segments;
      const a = ring * segments + i + 1;
      const b = ring * segments + next + 1;
      const c = (ring + 1) * segments + next + 1;
      const d = (ring + 1) * segments + i + 1;
      faces.push([a, d, b], [b, d, c]);
    }
  } else if (shape === "sphere") {
    const rings = 5;
    const segments = 10;
    for (let y = 0; y <= rings; y++) {
      const v = y / rings;
      const phi = v * Math.PI;
      for (let x = 0; x < segments; x++) {
        const theta = x / segments * Math.PI * 2;
        vertices.push([
          Math.sin(phi) * Math.cos(theta) * scale[0] / 2,
          Math.cos(phi) * scale[1] / 2,
          Math.sin(phi) * Math.sin(theta) * scale[2] / 2
        ]);
      }
    }
    for (let y = 0; y < rings; y++) for (let x = 0; x < segments; x++) {
      const a = y * segments + x + 1;
      const b = y * segments + ((x + 1) % segments) + 1;
      const c = (y + 1) * segments + ((x + 1) % segments) + 1;
      const d = (y + 1) * segments + x + 1;
      faces.push([a,d,b],[b,d,c]);
    }
  } else {
    const segments = 12;
    const rx = scale[0] / 2, rz = scale[2] / 2, halfY = scale[1] / 2;
    for (let i = 0; i < segments; i++) {
      const angle = i / segments * Math.PI * 2;
      vertices.push([Math.cos(angle) * rx, -halfY, Math.sin(angle) * rz]);
    }
    if (shape === "cylinder") {
      for (let i = 0; i < segments; i++) {
        const angle = i / segments * Math.PI * 2;
        vertices.push([Math.cos(angle) * rx, halfY, Math.sin(angle) * rz]);
      }
      vertices.push([0,-halfY,0],[0,halfY,0]);
      const bottomCenter = segments * 2 + 1, topCenter = segments * 2 + 2;
      for (let i = 0; i < segments; i++) {
        const next = (i + 1) % segments;
        const lowA = i + 1, lowB = next + 1, highA = segments + i + 1, highB = segments + next + 1;
        faces.push([lowA,lowB,highA],[lowB,highB,highA],[bottomCenter,lowB,lowA],[topCenter,highA,highB]);
      }
    } else {
      vertices.push([0,halfY,0],[0,-halfY,0]);
      const tip = segments + 1, bottomCenter = segments + 2;
      for (let i = 0; i < segments; i++) {
        const next = (i + 1) % segments;
        faces.push([i + 1,next + 1,tip],[bottomCenter,next + 1,i + 1]);
      }
    }
  }
  return { vertices, faces };
}
function transformPoint(point: Vec3, part: Part): Vec3 {
  let [x, y, z] = point;
  const rx = part.rotation[0] * Math.PI / 180;
  const ry = part.rotation[1] * Math.PI / 180;
  const rz = part.rotation[2] * Math.PI / 180;
  let ny = y * Math.cos(rx) - z * Math.sin(rx);
  let nz = y * Math.sin(rx) + z * Math.cos(rx);
  y = ny; z = nz;
  let nx = x * Math.cos(ry) + z * Math.sin(ry);
  nz = -x * Math.sin(ry) + z * Math.cos(ry);
  x = nx; z = nz;
  nx = x * Math.cos(rz) - y * Math.sin(rz);
  ny = x * Math.sin(rz) + y * Math.cos(rz);
  return [
    Number((nx + part.position[0]).toFixed(5)),
    Number((ny + part.position[1]).toFixed(5)),
    Number((nz + part.position[2]).toFixed(5))
  ];
}
function buildMesh(recipe: Recipe) {
  const obj: string[] = ["# Generated by GENE Forge", "mtllib model.mtl", "o " + recipe.name.replace(/\s+/g, "_")];
  const mtl: string[] = ["# Generated by GENE Forge"];
  let vertexOffset = 0;
  let triangles = 0;
  recipe.parts.forEach((part, index) => {
    const mesh = geometry(part.shape, part.scale);
    const material = "mat_" + String(index + 1).padStart(3, "0");
    const [r, g, b] = rgb(part.color);
    const surface = part.surface || "matte";
    const specular = surface === "metal" ? [0.72, 0.72, 0.72] : surface === "glass" ? [0.9, 0.9, 0.9] : surface === "emissive" ? [0.38, 0.38, 0.38] : surface === "rubber" ? [0.025, 0.025, 0.025] : [0.12, 0.12, 0.12];
    const shininess = surface === "metal" ? 96 : surface === "glass" ? 120 : surface === "emissive" ? 48 : surface === "rubber" ? 4 : 18;
    mtl.push("newmtl " + material, "Kd " + r.toFixed(4) + " " + g.toFixed(4) + " " + b.toFixed(4), "Ka 0.05 0.05 0.05", "Ks " + specular.map(value => value.toFixed(3)).join(" "), "Ns " + shininess, ...(surface === "glass" ? ["d 0.42", "illum 4"] : surface === "emissive" ? ["Ke " + r.toFixed(4) + " " + g.toFixed(4) + " " + b.toFixed(4), "illum 2"] : ["illum 2"]), "");
    obj.push("", "o " + part.name, "usemtl " + material);
    for (const vertex of mesh.vertices) {
      const p = transformPoint(vertex, part);
      obj.push("v " + p[0] + " " + p[1] + " " + p[2]);
    }
    for (const face of mesh.faces) {
      obj.push("f " + face.map(indexInPart => indexInPart + vertexOffset).join(" "));
      if (face.length === 3) triangles++;
      else triangles += face.length - 2;
    }
    vertexOffset += mesh.vertices.length;
  });
  const asset = {
    format: "gene-forge-asset-v1",
    name: recipe.name,
    kind: recipe.kind,
    style: recipe.style,
    notes: recipe.notes || "",
    generatedAt: new Date().toISOString(),
    triangleCount: triangles,
    vertexCount: vertexOffset,
    partCount: recipe.parts.length,
    recipe
  };
  return { obj: obj.join("\n") + "\n", mtl: mtl.join("\n") + "\n", asset };
}

function nativeAssetResponse(prompt: string, kind: string, quality: string, projectStyle: string): NextResponse | null {
  if (kind === "weapon") return null;
  try {
    const recipe = normalizeRecipe(buildNativeForgeRecipe({ prompt, kind, quality, projectStyle }), kind, quality);
    const mesh = buildMesh(recipe);
    const files = {
      "model.obj": mesh.obj,
      "model.mtl": mesh.mtl,
      "asset.json": JSON.stringify(mesh.asset, null, 2)
    };
    if (files["model.obj"].length > 1_500_000) return null;
    return json(200, {
      ok: true,
      aiMode: "native",
      model: "gene-native-forge-v1",
      asset: {
        name: recipe.name, kind: recipe.kind, style: recipe.style,
        partCount: recipe.parts.length, triangleCount: mesh.asset.triangleCount,
        vertexCount: mesh.asset.vertexCount, notes: recipe.notes || "",
        recipe, files
      }
    });
  } catch {
    return null;
  }
}

function extractJson(text: string) {
  let clean = text.trim();
  if (clean.startsWith("```")) clean = clean.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(clean);
}

export async function POST(request: NextRequest) {
  let body: any;
  try { body = await request.json(); } catch { return fail(400, "BAD_JSON", "Request body must be JSON."); }
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const kind = KINDS.has(body.kind) ? body.kind : "prop";
  const quality = ["performance", "standard", "high"].includes(body.quality) ? body.quality : "standard";
  if (!prompt || prompt.length > 4000) return fail(400, "PROMPT_REQUIRED", "Write a concrete asset request (maximum 4,000 characters).");
  // Internal bounded tool mode lets GENE Chat invoke the modeller without spending a second full provider budget.
  if (body.nativeOnly === true) {
    const native = nativeAssetResponse(prompt, kind, quality, String(body.projectStyle || "").slice(0, 1600));
    if (native) return native;
    return fail(422, "NATIVE_ASSET_UNAVAILABLE", "GENE Forge could not safely generate a native recipe for this asset.");
  }
  const apiKeys = [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
    process.env.GEMINI_API_KEY_4,
    process.env.GEMINI_API_KEY_5,
    ...(process.env.GEMINI_API_KEYS || "").split(/[,;\\n]+/)
  ].map(value => value?.trim()).filter((value): value is string => Boolean(value)).filter((value, index, all) => all.indexOf(value) === index);
  if (!apiKeys.length) {
    const native = nativeAssetResponse(prompt, kind, quality, String(body.projectStyle || "").slice(0, 1600));
    if (native) return native;
    return fail(503, "GEMINI_NOT_CONFIGURED", "No AI provider is configured and the native modeller could not safely generate this asset. No mesh files were saved.");
  }

  const model = process.env.GENE_FAST_MODEL || "gemini-3.8-flash";
  const fallbackModels = [model, "gemini-3.6-flash", "gemini-3.5-flash-lite"].filter((value, index, all) => all.indexOf(value) === index);
  const system = [
    "You are GENE Forge, a practical low-poly/game-asset modelling director.",
    "Return JSON only with shape {name:string,kind:string,style:string,notes:string,parts:[{name:string,shape:'box'|'beveledBox'|'sphere'|'cylinder'|'cone'|'wedge'|'torus'|'capsule',surface:'matte'|'metal'|'rubber'|'glass'|'emissive',position:[x,y,z],scale:[width,height,depth],rotation:[degreesX,degreesY,degreesZ],color:'#RRGGBB'}]}.",
    "This recipe is converted into a real OBJ mesh and MTL material file by the application. Optimize for a distinctive silhouette and correct proportions, not an arbitrary pile of shapes. Treat the parts like a senior hard-surface/prop artist: primary mass, secondary functional structures, tertiary bevel-like trims, layered panels, vents, fasteners, handles and material breaks. Use beveledBox for light-catching chamfered panels, torus for rings/handles/rims, wedge for ramps/roof armor/angled shells, cylinders for axles/barrels, rubber for tires/grips, glass for windows, metal for exposed hardware and emissive for small lights. Use spheres only where curvature makes sense. Avoid intersecting clutter, floating pieces, identical repeated primitives, impossible proportions and colors without a coherent palette.",
    "Use a coherent art direction, clear primary/secondary/tertiary forms, deliberate color blocking, aligned components, clean silhouette, believable proportions, functional detail placement, and a clear focal feature. Position Y is vertical. The asset is centered around world origin with a ground-level bottom near Y=0 when practical. Place trim, seams, layered plates, bezels, hinges, vents, rivets, grips or panel breaks only where they make sense for the requested asset; avoid arbitrary decoration. Vary material response intentionally: metal should have higher specular and shininess, rubber should be dark and matte, glass should be translucent in MTL, and emissive should identify small lights rather than large surfaces.",
    "Use 3 to 32 parts for performance quality, 3 to 54 for standard, and 3 to 76 for high. Allowed shapes: box, beveledBox, sphere, cylinder, cone, wedge, torus, capsule. Allowed surfaces: matte, metal, rubber, glass, emissive. Scale values must be >0.03 and <=20; position absolute values <=40; rotations within +/-360 degrees. Give each part a functional name and consistent object-local coordinate system; keep the whole asset centered and grounded near y=0.",
    "For vehicles make a body, cabin, wheels, windows and characteristic details. For characters make a torso, head, limbs and distinctive silhouette. For buildings make a foundation, wall masses, roof and openings. For weapons make a body, grip, barrel/blade and details. For nature assets make a trunk/stem and layered canopy/forms.",
    "If an existing recipe is supplied, modify that exact asset to match the user's edit; preserve its identity and unaffected parts. Do not just rename the asset or repeat the same recipe."
  ].join("\n");
  const user = [
    "Asset kind: " + kind,
    "Quality profile: " + quality,
    "Requested asset: " + prompt,
    "Existing recipe to edit if provided: " + JSON.stringify(body.existingRecipe || null),
    "Project style guidance: " + String(body.projectStyle || "").slice(0, 1600),
    "Return the full recipe JSON, not commentary."
  ].join("\n\n");

  const parts: Array<Record<string, unknown>> = [{ text: user }];
  const references = Array.isArray(body.references) ? body.references : [];
  const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
  let totalImageChars = 0;
  let imageCount = 0;
  for (const ref of references) {
    if (ref?.kind !== "image" || typeof ref.dataBase64 !== "string") continue;
    if (imageCount >= 2) break;
    if (!allowedImageTypes.has(ref.mimeType)) return fail(400, "REFERENCE_TYPE_UNSUPPORTED", "Forge reference images must be JPEG, PNG or WEBP.");
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(ref.dataBase64)) return fail(400, "REFERENCE_INVALID", "A reference image is not valid base64.");
    totalImageChars += ref.dataBase64.length;
    if (ref.dataBase64.length > 550_000 || totalImageChars > 750_000) return fail(413, "REFERENCE_TOO_LARGE", "Forge image references exceed the request budget. Attach smaller images or fewer references.");
    parts.push({ inlineData: { mimeType: ref.mimeType, data: ref.dataBase64 } });
    imageCount++;
  }

  let text = "";
  let successfulModel = model;
  let successfulProvider = "gemini";
  let lastDetail = "No configured model returned a complete asset recipe.";
  let sawTruncation = false;
  const startedAt = Date.now();
  const hasAlternateProvider = Boolean(process.env.GROQ_API_KEY?.trim() || process.env.OPENROUTER_API_KEY?.trim());
  const geminiBudgetMs = hasAlternateProvider ? 31_000 : 49_000;
  const attempts: Array<{ key: string; model: string }> = [];
  for (let keyIndex = 0; keyIndex < Math.min(apiKeys.length, 3); keyIndex++) {
    for (const candidateModel of fallbackModels) {
      attempts.push({ key: apiKeys[keyIndex], model: candidateModel });
      if (attempts.length >= 6) break;
    }
    if (attempts.length >= 6) break;
  }
  for (let index = 0; index < attempts.length; index++) {
    if (Date.now() - startedAt > geminiBudgetMs) break;
    const attempt = attempts[index];
    const compact = index > 0
      ? "\n\nRECOVERY RETRY: Previous output was truncated or invalid. Return a smaller complete asset recipe from scratch, never continue partial JSON. Use fewer parts (18 maximum), concise names/notes, preserve the signature silhouette and correct proportions, and output one complete JSON object only."
      : "";
    try {
      const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + attempt.model + ":generateContent", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": attempt.key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user + compact }, ...parts.slice(1)] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.2, maxOutputTokens: index > 0 ? 3_800 : 6_500, thinkingConfig: { thinkingLevel: index > 0 || quality === "performance" ? "low" : quality === "high" ? "high" : "medium" } }
        }),
        signal: AbortSignal.timeout(Math.min(index === 0 ? 13_000 : 9_000, Math.max(1_000, geminiBudgetMs - (Date.now() - startedAt))))
      });
      const payload: any = await response.json().catch(() => null);
      const candidateText = payload?.candidates?.[0]?.content?.parts?.map((part: any) => part.text || "").join("\n") || "";
      const finishReason = String(payload?.candidates?.[0]?.finishReason || "");
      if (!response.ok) {
        lastDetail = payload?.error?.message || "HTTP " + response.status;
        if (response.status !== 429 && response.status < 500 && response.status !== 401 && response.status !== 403) break;
        continue;
      }
      if (finishReason === "MAX_TOKENS") {
        sawTruncation = true;
        lastDetail = "The model reached its output token limit.";
        continue;
      }
      if (!candidateText.trim()) {
        lastDetail = "The model returned an empty recipe.";
        continue;
      }
      try { extractJson(candidateText); } catch {
        lastDetail = "The model returned malformed or incomplete JSON.";
        continue;
      }
      text = candidateText;
      successfulModel = attempt.model;
      break;
    } catch (error) {
      lastDetail = error instanceof Error ? error.message : "Network timeout.";
    }
  }
  if (!text && hasAlternateProvider && Date.now() - startedAt < 54_000) {
    // Free-only router: verified-free OpenRouter models from the live catalog plus Groq.
    const chain = await runAlternateChain({
      system: system + "\n\nYou are an alternate provider in GENE Forge. Return one valid JSON object only. Do not use provider branding.",
      user: user + "\n\nALTERNATE PROVIDER RECOVERY: Generate a compact, complete recipe from scratch using no more than 18 parts. Use only the declared shapes and surfaces. Preserve the main silhouette and functional details. No markdown, no commentary, valid JSON only.",
      maxTokens: 3_600,
      temperature: 0.2,
      json: true,
      deadline: startedAt + 58_000,
      perCallMs: 12_000,
      maxAttempts: 4,
      siteTitle: "GENE Forge",
      validate: candidate => { try { extractJson(candidate); return true; } catch { return false; } }
    });
    if (chain.ok) {
      text = chain.text;
      successfulModel = chain.model;
      successfulProvider = chain.provider;
    } else {
      lastDetail = chain.failure.detail;
      if (chain.truncated) sawTruncation = true;
    }
  }

  if (!text) {
    const native = nativeAssetResponse(prompt, kind, quality, String(body.projectStyle || "").slice(0, 1600));
    if (native) return native;
    return fail(502, sawTruncation ? "ASSET_OUTPUT_TRUNCATED" : "ASSET_OUTPUT_INVALID",
      (sawTruncation ? "GENE Forge detected a cut-off model response and retried compact recipes and fallback models, but none completed. " : "GENE Forge retried invalid/empty model responses, but none returned a valid recipe. ") +
      "No mesh files were saved. Try Performance quality or simplify the requested asset. Detail: " + lastDetail);
  }
  try {
    const recipe = normalizeRecipe(extractJson(text), kind, quality);
    const mesh = buildMesh(recipe);
    const files = {
      "model.obj": mesh.obj,
      "model.mtl": mesh.mtl,
      "asset.json": JSON.stringify(mesh.asset, null, 2)
    };
    if (files["model.obj"].length > 1_500_000) return fail(413, "MESH_TOO_LARGE", "Generated mesh exceeded the 1.5 MB mesh budget.");
    return json(200, {
      ok: true,
      aiMode: successfulProvider,
      model: successfulModel,
      asset: { name: recipe.name, kind: recipe.kind, style: recipe.style, partCount: recipe.parts.length, triangleCount: mesh.asset.triangleCount, vertexCount: mesh.asset.vertexCount, notes: recipe.notes || "", recipe, files }
    });
  } catch (e) {
    // Provider output is untrusted: if its recipe fails validation or mesh construction,
    // try the bounded native generator before returning an error.
    const native = nativeAssetResponse(prompt, kind, quality, String(body.projectStyle || "").slice(0, 1600));
    if (native) return native;
    return fail(422, "ASSET_VALIDATION_FAILED", "GENE Forge rejected the generated recipe and the native fallback could not safely replace it: " + (e instanceof Error ? e.message : String(e)) + ". No mesh files were saved.");
  }
}
