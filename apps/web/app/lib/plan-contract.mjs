/** Deterministically repairs incomplete plan metadata; it never claims implementation work happened. */
const APP_TASKS = [
  "Define the primary screen flow and responsive layout",
  "Connect visible controls to real state changes and input validation",
  "Check keyboard behavior and the primary user flows"
];
const GAME_TASKS = [
  "Implement the core gameplay loop and responsive player controls",
  "Connect collisions, game state, and visible gameplay feedback",
  "Implement restart and clear win/loss outcomes, then verify the loop"
];
function cleanStrings(value, limit, maxLength) {
  if (!Array.isArray(value)) return [];
  const seen = new Set(), result = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const normalized = item.trim().slice(0, maxLength);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
    if (result.length >= limit) break;
  }
  return result;
}
export function ensurePlanTasks(tasks, projectKind) {
  const result = cleanStrings(tasks, 40, 240);
  for (const task of (projectKind === "app" ? APP_TASKS : GAME_TASKS)) {
    if (result.length >= 3) break;
    if (!result.some(existing => existing.toLowerCase() === task.toLowerCase())) result.push(task);
  }
  return result;
}
export function ensurePlanMechanics(mechanics, projectKind) {
  const result = cleanStrings(mechanics, 30, 180);
  if (result.length) return result;
  return projectKind === "app"
    ? ["Primary user flows and interactive state"]
    : ["Core gameplay loop and responsive controls"];
}
