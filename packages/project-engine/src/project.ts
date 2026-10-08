export type Engine = "phaser" | "three" | "godot" | "unity" | "unreal";

export type ProjectManifest = {
  id: string;
  name: string;
  engine: Engine;
  mode: "2d" | "3d";
  version: number;
  createdAt: string;
  updatedAt: string;
  performance: { targetFps: number; maxObjects: number; maxEnemies: number; maxParticles: number };
};

export function nextVersion(current: number): number {
  if (!Number.isInteger(current) || current < 0) throw new Error("invalid project version");
  return current + 1;
}
