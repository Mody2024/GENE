export type AssetKind = "character" | "vehicle" | "building" | "environment" | "prop" | "weapon";

export type AssetRequest = {
  kind: AssetKind;
  prompt: string;
  quality: "performance" | "standard" | "high";
  referencePaths?: string[];
};

export type AssetManifest = {
  id: string;
  source: "procedural" | "ai3d" | "blender" | "imported";
  files: string[];
  triangleCount: number;
  materialCount: number;
  lods: number;
};
