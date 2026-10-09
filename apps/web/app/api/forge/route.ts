import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

type Shape = "box" | "sphere" | "cylinder" | "cone";
type Vec3 = [number, number, number];
type Part = {
  name: string;
  shape: Shape;
  position: Vec3;
  scale: Vec3;
  rotation: Vec3;
  color: string;
};
type Recipe = { name: string; kind: string; style: string; parts: Part[]; notes?: string };

const KINDS = new Set(["character", "vehicle", "building", "environment", "prop", "weapon"]);
const SHAPES = new Set<Shape>(["box", "sphere", "cylinder", "cone"]);
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
      color: safeColor(part.color)
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
  if (shape === "box") {
    const [x, y, z] = scale.map(n => n / 2) as Vec3;
    vertices.push([-x,-y,-z],[x,-y,-z],[x,y,-z],[-x,y,-z],[-x,-y,z],[x,-y,z],[x,y,z],[-x,y,z]);
    const quads = [[1,4,3,2],[5,6,7,8],[1,2,6,5],[2,3,7,6],[3,4,8,7],[4,1,5,8]];
    for (const q of quads) { faces.push([q[0],q[1],q[2]],[q[0],q[2],q[3]]); }
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
    mtl.push("newmtl " + material, "Kd " + r.toFixed(4) + " " + g.toFixed(4) + " " + b.toFixed(4), "Ka 0.05 0.05 0.05", "Ks 0.08 0.08 0.08", "Ns 12", "");
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
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return fail(503, "GEMINI_NOT_CONFIGURED", "Forge requires Gemini to create a structured asset recipe. No model or mesh was generated.");

  const model = process.env.GENE_FAST_MODEL || "gemini-3.8-flash";
  const system = [
    "You are GENE Forge, a practical low-poly/game-asset modelling director.",
    "Return JSON only with shape {name:string,kind:string,style:string,notes:string,parts:[{name:string,shape:'box'|'sphere'|'cylinder'|'cone',position:[x,y,z],scale:[width,height,depth],rotation:[degreesX,degreesY,degreesZ],color:'#RRGGBB'}]}.",
    "This recipe is converted into a real OBJ mesh and MTL material file by the application. Optimize for a distinctive silhouette and correct proportions, not an arbitrary pile of shapes.",
    "Use a coherent art direction, clear primary/secondary forms, deliberate color blocking, aligned components, and grounded proportions. Position Y is vertical. The asset is centered around world origin with a ground-level bottom near Y=0 when practical.",
    "Use 3 to 32 parts for performance quality, 3 to 54 for standard, and 3 to 76 for high. Only these shapes are allowed. Scale values must be >0.03 and <=20; position absolute values <=40; rotations within +/-360 degrees.",
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

  let response: Response;
  try {
    response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.25, maxOutputTokens: 6500, thinkingConfig: { thinkingLevel: quality === "high" ? "high" : "medium" } }
      }),
      signal: AbortSignal.timeout(50_000)
    });
  } catch (e) {
    return fail(502, "GEMINI_NETWORK_ERROR", "Could not reach Gemini: " + (e instanceof Error ? e.message : String(e)));
  }
  const payload: any = await response.json().catch(() => null);
  if (!response.ok) return fail(response.status === 429 ? 429 : 502, "GEMINI_API_ERROR", payload?.error?.message || "Gemini could not generate an asset recipe.");
  const text = payload?.candidates?.[0]?.content?.parts?.map((part: any) => part.text || "").join("\n") || "";
  if (!text.trim()) return fail(502, "GEMINI_EMPTY_RESPONSE", "Gemini returned no asset recipe.");
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
      aiMode: "gemini",
      model,
      asset: { name: recipe.name, kind: recipe.kind, style: recipe.style, partCount: recipe.parts.length, triangleCount: mesh.asset.triangleCount, vertexCount: mesh.asset.vertexCount, notes: recipe.notes || "", recipe, files }
    });
  } catch (e) {
    return fail(422, "ASSET_VALIDATION_FAILED", "GENE Forge rejected the generated recipe: " + (e instanceof Error ? e.message : String(e)) + ". No mesh files were saved.");
  }
}
