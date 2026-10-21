type Shape = "box" | "beveledBox" | "sphere" | "cylinder" | "cone" | "wedge" | "torus";
type Surface = "matte" | "metal" | "rubber" | "glass" | "emissive";
type Vec3 = [number, number, number];
type Part = { name: string; shape: Shape; position: Vec3; scale: Vec3; rotation: Vec3; color: string; surface: Surface };
type Recipe = { name: string; kind: string; style: string; parts: Part[]; notes: string };

const PALETTES = {
  city: ["#d7c6a5", "#b9c0c5", "#e7e1d3", "#4b6574", "#343d46", "#6e9b88"],
  character: ["#e9d9bd", "#3d5368", "#a7b7ad", "#d7a86e", "#4a4240", "#e5e7eb"],
  vehicle: ["#d75a4a", "#252e37", "#c6d0d8", "#e5b84b", "#526d82", "#e9ecef"],
  nature: ["#587b55", "#86a96f", "#a7bb8c", "#74624c", "#d5bd8b", "#4d6a4c"],
  prop: ["#b88a5a", "#76553c", "#d8c7a5", "#414b55", "#8eaaa0", "#c3a76d"]
} as const;

function part(name: string, shape: Shape, position: Vec3, scale: Vec3, color: string, surface: Surface = "matte", rotation: Vec3 = [0, 0, 0]): Part {
  return { name, shape, position, scale, rotation, color, surface };
}
function cleanName(value: string) {
  const words = value.trim().replace(/[^a-zA-Z0-9 _-]/g, "").replace(/\s+/g, " ").slice(0, 48);
  return words || "Gene procedural asset";
}
function chooseStyle(prompt: string, projectStyle: string) {
  const text = (prompt + " " + projectStyle).toLowerCase();
  if (/voxel|minecraft|blocky/.test(text)) return "voxel-inspired stylized low-poly";
  if (/cartoon|cute|funny|stylized/.test(text)) return "polished cartoon low-poly";
  if (/realistic|realism|modern city|architectural/.test(text)) return "clean realistic-proportion low-poly";
  if (/horror|abandoned|dark/.test(text)) return "moody weathered low-poly";
  return "coherent game-ready stylized low-poly";
}
function building(prompt: string, quality: string, palette: readonly string[]): Part[] {
  const parts: Part[] = [];
  const floors = quality === "performance" ? 2 : quality === "high" ? 5 : 3;
  const width = /tower|skyscraper|office/.test(prompt.toLowerCase()) ? 7 : 8;
  const depth = 6;
  const floorH = 2.35;
  const height = floors * floorH;
  parts.push(part("foundation", "beveledBox", [0, 0.25, 0], [width + 0.6, 0.5, depth + 0.6], palette[4], "metal"));
  parts.push(part("main facade", "beveledBox", [0, height / 2 + 0.5, 0], [width, height, depth], palette[0]));
  parts.push(part("roof slab", "beveledBox", [0, height + 0.55, 0], [width + 0.35, 0.35, depth + 0.35], palette[2], "matte"));
  parts.push(part("front entrance", "beveledBox", [0, 1.35, depth / 2 + 0.045], [1.55, 2.15, 0.12], palette[4], "metal"));
  parts.push(part("door glass", "box", [0, 1.48, depth / 2 + 0.12], [0.88, 1.7, 0.035], "#7ca4b7", "glass"));
  parts.push(part("entrance canopy", "beveledBox", [0, 2.55, depth / 2 + 0.38], [2.2, 0.18, 0.9], palette[3], "metal"));
  const columns = width > 7 ? 4 : 3;
  const spacing = (width - 1.6) / (columns - 1);
  for (let floor = 0; floor < floors; floor++) {
    const y = 1.45 + floor * floorH;
    for (let col = 0; col < columns; col++) {
      const x = -width / 2 + 0.8 + col * spacing;
      parts.push(part(`window ${floor + 1}-${col + 1} frame`, "beveledBox", [x, y, depth / 2 + 0.05], [1.0, 1.25, 0.13], palette[4], "metal"));
      parts.push(part(`window ${floor + 1}-${col + 1} glass`, "box", [x, y, depth / 2 + 0.13], [0.78, 1.03, 0.035], "#8db5c6", "glass"));
    }
    if (floor > 0 && parts.length < (quality === "high" ? 65 : quality === "performance" ? 27 : 45)) {
      parts.push(part(`floor belt ${floor}`, "beveledBox", [0, floor * floorH + 0.5, depth / 2 + 0.12], [width + 0.12, 0.09, 0.12], palette[3], "metal"));
    }
  }
  if (/house|villa|home/.test(prompt.toLowerCase())) {
    parts.push(part("pitched roof", "wedge", [0, height + 1.25, 0], [width + 0.7, 1.5, depth + 0.7], palette[3]));
    parts.push(part("front steps", "beveledBox", [0, 0.22, depth / 2 + 0.8], [2.5, 0.25, 1.4], palette[2]));
  }
  return parts;
}
function character(prompt: string, palette: readonly string[]): Part[] {
  const isSkeleton = /skeleton|bone|undead/.test(prompt.toLowerCase());
  const bone = "#e8e1ce", clothes = palette[1], accent = palette[3];
  const p: Part[] = [];
  p.push(part("pelvis", "beveledBox", [0, 1.0, 0], [0.52, 0.32, 0.3], isSkeleton ? bone : clothes));
  p.push(part("torso", "beveledBox", [0, 1.48, 0], [0.68, 0.78, 0.36], isSkeleton ? bone : clothes));
  p.push(part("neck", "cylinder", [0, 1.94, 0], [0.18, 0.18, 0.18], isSkeleton ? bone : palette[0]));
  p.push(part("head", "sphere", [0, 2.22, 0], [0.48, 0.53, 0.43], isSkeleton ? bone : palette[0]));
  p.push(part("left eye", "sphere", [-0.105, 2.25, 0.2], [0.07, 0.08, 0.04], "#24272a", "emissive"));
  p.push(part("right eye", "sphere", [0.105, 2.25, 0.2], [0.07, 0.08, 0.04], "#24272a", "emissive"));
  p.push(part("left upper arm", "cylinder", [-0.47, 1.52, 0], [0.2, 0.52, 0.2], isSkeleton ? bone : clothes, "matte", [0, 0, -12]));
  p.push(part("right upper arm", "cylinder", [0.47, 1.52, 0], [0.2, 0.52, 0.2], isSkeleton ? bone : clothes, "matte", [0, 0, 12]));
  p.push(part("left forearm", "cylinder", [-0.52, 1.13, 0.02], [0.16, 0.42, 0.16], isSkeleton ? bone : palette[0], "matte", [0, 0, -7]));
  p.push(part("right forearm", "cylinder", [0.52, 1.13, 0.02], [0.16, 0.42, 0.16], isSkeleton ? bone : palette[0], "matte", [0, 0, 7]));
  p.push(part("left hand", "sphere", [-0.55, 0.88, 0.04], [0.18, 0.16, 0.16], isSkeleton ? bone : palette[0]));
  p.push(part("right hand", "sphere", [0.55, 0.88, 0.04], [0.18, 0.16, 0.16], isSkeleton ? bone : palette[0]));
  p.push(part("left thigh", "cylinder", [-0.18, 0.67, 0], [0.22, 0.52, 0.22], isSkeleton ? bone : clothes));
  p.push(part("right thigh", "cylinder", [0.18, 0.67, 0], [0.22, 0.52, 0.22], isSkeleton ? bone : clothes));
  p.push(part("left shin", "cylinder", [-0.18, 0.28, 0.02], [0.17, 0.42, 0.17], isSkeleton ? bone : palette[0]));
  p.push(part("right shin", "cylinder", [0.18, 0.28, 0.02], [0.17, 0.42, 0.17], isSkeleton ? bone : palette[0]));
  p.push(part("left shoe", "beveledBox", [-0.18, 0.08, 0.09], [0.25, 0.14, 0.38], accent, "rubber"));
  p.push(part("right shoe", "beveledBox", [0.18, 0.08, 0.09], [0.25, 0.14, 0.38], accent, "rubber"));
  if (!isSkeleton) {
    p.push(part("jacket trim", "beveledBox", [0, 1.5, 0.19], [0.07, 0.64, 0.035], accent, "metal"));
    p.push(part("belt", "beveledBox", [0, 1.12, 0], [0.56, 0.1, 0.34], accent, "rubber"));
  } else {
    p.push(part("rib cage detail", "torus", [0, 1.53, 0.19], [0.5, 0.35, 0.18], bone));
    p.push(part("pelvis detail", "torus", [0, 1.0, 0.17], [0.43, 0.2, 0.15], bone));
  }
  return p;
}
function vehicle(prompt: string, quality: string, palette: readonly string[]): Part[] {
  const p: Part[] = [];
  const truck = /truck|van|bus|lorry/.test(prompt.toLowerCase());
  const length = truck ? 4.8 : 3.5;
  p.push(part("chassis", "beveledBox", [0, 0.55, 0], [length, 0.35, 1.65], palette[1], "metal"));
  p.push(part("main body", "beveledBox", [0, 0.95, 0], [length, 0.75, 1.8], palette[0]));
  p.push(part("front bumper", "beveledBox", [0, 0.55, length / 2 + 0.05], [1.7, 0.18, 0.16], palette[2], "metal"));
  p.push(part("front grille", "beveledBox", [0, 0.85, length / 2 + 0.04], [0.75, 0.25, 0.08], palette[1], "metal"));
  p.push(part("left headlight", "box", [-0.55, 1.0, length / 2 + 0.08], [0.25, 0.14, 0.07], "#fff0b0", "emissive"));
  p.push(part("right headlight", "box", [0.55, 1.0, length / 2 + 0.08], [0.25, 0.14, 0.07], "#fff0b0", "emissive"));
  p.push(part("cabin", "beveledBox", [0, 1.55, truck ? 0.55 : -0.15], [truck ? 1.9 : 1.65, 0.75, truck ? 1.6 : 1.35], palette[4]));
  p.push(part("windshield", "box", [0, 1.65, truck ? 1.38 : 0.57], [1.35, 0.48, 0.05], "#8db5c6", "glass", [-12, 0, 0]));
  p.push(part("rear window", "box", [0, 1.65, truck ? -0.28 : -0.85], [1.25, 0.42, 0.05], "#8db5c6", "glass"));
  for (const x of [-0.91, 0.91]) for (const z of [-length * 0.31, length * 0.31]) {
    p.push(part(`wheel ${x} ${z}`, "cylinder", [x, 0.42, z], [0.25, 0.52, 0.52], "#26292d", "rubber", [0, 0, 90]));
    p.push(part(`hub ${x} ${z}`, "cylinder", [x * 1.01, 0.42, z], [0.28, 0.22, 0.22], palette[2], "metal", [0, 0, 90]));
  }
  if (truck) p.push(part("cargo box", "beveledBox", [0, 1.55, -1.25], [1.9, 1.15, 1.65], palette[2], "metal"));
  if (quality !== "performance") {
    p.push(part("roof detail", "beveledBox", [0, 1.99, truck ? 0.55 : -0.15], [0.75, 0.06, 0.25], palette[3], "metal"));
    p.push(part("side stripe left", "box", [-0.92, 0.98, 0], [0.035, 0.1, length * 0.68], palette[3], "emissive"));
    p.push(part("side stripe right", "box", [0.92, 0.98, 0], [0.035, 0.1, length * 0.68], palette[3], "emissive"));
  }
  return p;
}
function prop(prompt: string, palette: readonly string[]): Part[] {
  const text = prompt.toLowerCase();
  const p: Part[] = [];
  if (/chair|seat|stool/.test(text)) {
    p.push(part("seat cushion", "beveledBox", [0, 0.9, 0], [1.05, 0.18, 0.95], palette[0]));
    p.push(part("backrest", "beveledBox", [0, 1.5, -0.38], [1.05, 1.0, 0.18], palette[0]));
    for (const x of [-0.4, 0.4]) for (const z of [-0.35, 0.35]) p.push(part(`chair leg ${x} ${z}`, "beveledBox", [x, 0.42, z], [0.12, 0.8, 0.12], palette[1]));
    p.push(part("seat seam", "box", [0, 1.0, 0.48], [0.82, 0.025, 0.02], palette[2]));
  } else if (/table|desk|workbench/.test(text)) {
    p.push(part("tabletop", "beveledBox", [0, 1.0, 0], [2.0, 0.18, 1.1], palette[0]));
    for (const x of [-0.82, 0.82]) for (const z of [-0.38, 0.38]) p.push(part(`table leg ${x} ${z}`, "beveledBox", [x, 0.48, z], [0.14, 0.9, 0.14], palette[1]));
    p.push(part("front apron", "beveledBox", [0, 0.78, 0.42], [1.55, 0.18, 0.08], palette[1]));
  } else if (/sofa|couch/.test(text)) {
    p.push(part("sofa base", "beveledBox", [0, 0.48, 0], [2.5, 0.5, 1.0], palette[1]));
    p.push(part("seat cushions", "beveledBox", [0, 0.83, 0.12], [2.25, 0.28, 0.8], palette[0]));
    p.push(part("back cushions", "beveledBox", [0, 1.2, -0.35], [2.35, 0.72, 0.22], palette[0]));
    for (const x of [-1.15, 1.15]) p.push(part(`armrest ${x}`, "beveledBox", [x, 0.88, 0], [0.22, 0.65, 1.0], palette[1]));
    for (const x of [-0.95, 0.95]) p.push(part(`foot ${x}`, "cylinder", [x, 0.18, 0], [0.12, 0.25, 0.12], palette[3], "metal"));
  } else if (/lamp|light/.test(text)) {
    p.push(part("lamp base", "cylinder", [0, 0.12, 0], [0.6, 0.22, 0.6], palette[3], "metal"));
    p.push(part("lamp stem", "cylinder", [0, 1.0, 0], [0.12, 1.65, 0.12], palette[3], "metal"));
    p.push(part("lamp shade", "cone", [0, 1.95, 0], [0.85, 0.65, 0.85], palette[0]));
    p.push(part("bulb", "sphere", [0, 1.72, 0], [0.24, 0.24, 0.24], "#ffe7a6", "emissive"));
  } else if (/tree|plant|bush/.test(text)) {
    p.push(part("trunk", "cylinder", [0, 1.1, 0], [0.38, 2.2, 0.38], palette[3]));
    p.push(part("lower canopy", "sphere", [0, 2.1, 0], [1.8, 1.65, 1.6], palette[0]));
    p.push(part("upper canopy", "sphere", [0.18, 2.8, 0], [1.35, 1.3, 1.25], palette[1]));
    p.push(part("highlight foliage", "sphere", [-0.38, 2.55, 0.38], [0.55, 0.6, 0.55], palette[2]));
  } else {
    p.push(part("main body", "beveledBox", [0, 0.7, 0], [1.4, 1.2, 1.0], palette[0]));
    p.push(part("top panel", "beveledBox", [0, 1.34, 0], [1.1, 0.12, 0.75], palette[2], "metal"));
    p.push(part("front panel", "box", [0, 0.72, 0.52], [0.72, 0.5, 0.04], palette[3], "metal"));
    p.push(part("detail left", "cylinder", [-0.48, 0.75, 0.56], [0.08, 0.08, 0.08], palette[1], "metal"));
    p.push(part("detail right", "cylinder", [0.48, 0.75, 0.56], [0.08, 0.08, 0.08], palette[1], "metal"));
  }
  return p;
}
function environment(prompt: string, quality: string, palette: readonly string[]): Part[] {
  const text = prompt.toLowerCase();
  const p: Part[] = [
    part("ground tile", "beveledBox", [0, -0.15, 0], [8, 0.3, 8], palette[2]),
  ];
  if (/city|street|urban|town/.test(text)) {
    p.push(part("road", "box", [0, 0.02, 0], [8, 0.05, 2.5], "#424950"));
    for (const x of [-2.5, -0.8, 0.8, 2.5]) p.push(part("road marking " + x, "box", [x, 0.055, 0], [0.75, 0.015, 0.08], "#e8dca5", "emissive"));
    p.push(...building("city apartment building", quality, PALETTES.city).slice(0, quality === "performance" ? 12 : 24).map((item, i) => ({ ...item, name: "background building " + (i + 1), position: [item.position[0] - 2.2, item.position[1], item.position[2] - 2.0] as Vec3, scale: [item.scale[0] * 0.35, item.scale[1] * 0.7, item.scale[2] * 0.35] as Vec3 })));
    p.push(part("street sign post", "cylinder", [3.0, 0.8, 1.3], [0.08, 1.6, 0.08], palette[3], "metal"));
    p.push(part("street sign", "beveledBox", [3.0, 1.55, 1.3], [0.75, 0.35, 0.08], palette[0], "metal"));
  } else {
    p.push(part("tree trunk", "cylinder", [-1.4, 0.8, -0.8], [0.35, 1.6, 0.35], palette[3]));
    p.push(part("tree crown", "sphere", [-1.4, 2.0, -0.8], [1.7, 1.7, 1.7], palette[0]));
    p.push(part("tree highlight", "sphere", [-1.75, 2.2, -0.5], [0.75, 0.85, 0.75], palette[1]));
    p.push(part("rock cluster", "beveledBox", [1.8, 0.3, 1.2], [1.0, 0.6, 0.8], palette[4], "matte", [0, 14, 8]));
    p.push(part("path", "beveledBox", [0.5, 0.03, 2.0], [3.4, 0.08, 0.75], palette[4]));
    if (quality !== "performance") p.push(part("small shrub", "sphere", [2.1, 0.45, -1.7], [0.85, 0.75, 0.8], palette[1]));
  }
  return p;
}

export function buildNativeForgeRecipe(input: { prompt: string; kind?: string; quality?: string; projectStyle?: string }) {
  const prompt = String(input.prompt || "").trim().slice(0, 4000);
  const kind = String(input.kind || "prop");
  const quality = ["performance", "standard", "high"].includes(String(input.quality)) ? String(input.quality) : "standard";
  const style = chooseStyle(prompt, String(input.projectStyle || ""));
  const text = prompt.toLowerCase();
  let parts: Part[];
  let palette: readonly string[] = PALETTES.prop;
  if (kind === "weapon") throw new Error("Native Forge does not generate weapon assets.");
  if (kind === "character" || /\b(skeleton|character|citizen|person|human|player avatar)\b/.test(text)) {
    palette = PALETTES.character;
    parts = character(prompt, palette);
  } else if (kind === "building" || /\b(building|house|villa|apartment|skyscraper|tower|office)\b/.test(text)) {
    palette = PALETTES.city;
    parts = building(prompt, quality, palette);
  } else if (kind === "vehicle" || /\b(car|vehicle|truck|van|bus|lorry)\b/.test(text)) {
    palette = PALETTES.vehicle;
    parts = vehicle(prompt, quality, palette);
  } else if (kind === "environment" || /\b(environment|city|street|town|forest|park|world|landscape)\b/.test(text)) {
    palette = /\b(city|street|town|urban)\b/.test(text) ? PALETTES.city : PALETTES.nature;
    parts = environment(prompt, quality, palette);
  } else {
    parts = prop(prompt, palette);
  }
  const max = quality === "performance" ? 32 : quality === "high" ? 76 : 54;
  parts = parts.slice(0, max);
  return {
    name: cleanName(prompt.split(/[,.!?\n]/)[0] || "GENE asset"),
    kind: ["character", "vehicle", "building", "environment", "prop"].includes(kind) ? kind : "prop",
    style,
    notes: "Generated by GENE Forge's deterministic native modeller. This asset is a procedural starting point; inspect its silhouette and proportions in the preview before using it in production.",
    parts
  } satisfies Recipe;
}
