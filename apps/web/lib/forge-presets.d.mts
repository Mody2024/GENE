export type ForgeNativePart = {
  name: string;
  shape: "box" | "beveledBox" | "sphere" | "cylinder" | "cone" | "wedge" | "torus";
  position: [number, number, number];
  scale: [number, number, number];
  rotation: [number, number, number];
  color: string;
  surface: "matte" | "metal" | "rubber" | "glass" | "emissive";
};
export type ForgeNativeRecipe = {
  name: string;
  kind: string;
  style: string;
  parts: ForgeNativePart[];
  notes: string;
};
export function buildNativeForgeRecipe(input?: {
  prompt?: string;
  kind?: string;
  quality?: string;
  projectStyle?: string;
}): ForgeNativeRecipe;
