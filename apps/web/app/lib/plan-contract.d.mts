export type ProjectKind = "game" | "app";
export function ensurePlanTasks(tasks: unknown, projectKind: ProjectKind): string[];
export function ensurePlanMechanics(mechanics: unknown, projectKind: ProjectKind): string[];
