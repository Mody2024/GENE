export type Vec3 = [number, number, number];
export type Aabb = { min: Vec3; max: Vec3; center: Vec3; size: Vec3 };
export function getWorldAabb(object?: Record<string, any>): Aabb;
export function aabbIntersects(a: Aabb, b: Aabb, padding?: number): boolean;
export function auditSceneLayout(input?: { objects?: Array<Record<string, any>>; bounds?: { min: Vec3; max: Vec3 }; spawnId?: string; goalId?: string; camera?: Record<string, number> }): { version: number; objectCount: number; bounds: { min: Vec3; max: Vec3 } | null; camera: Record<string, number> | null; warnings: Array<{ code: string; id?: string; message: string }>; passed: boolean };
export function recommendCameraFraming(input?: { bounds?: { min?: Vec3; max?: Vec3 }; fov?: number; aspectRatio?: number; margin?: number }): { target: Vec3; distance: number; fov: number; near: number; far: number; framing: string };
export function formatSpatialContract(intent?: string, engine?: string): string;
