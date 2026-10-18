/**
 * Deterministic module ordering shared by live preview and project export.
 * The spec's additionalFiles array is the dependency/load order; any valid
 * JavaScript modules not listed there are appended in stable lexical order.
 */
const MODULE_PATH = /\.(?:m?js|cjs)$/i;

function declaredModuleOrder(files) {
  try {
    const spec = JSON.parse(typeof files["game-spec.json"] === "string" ? files["game-spec.json"] : "{}");
    const architecturePaths = Array.isArray(spec?.architecture?.modules)
      ? spec.architecture.modules.map(module => typeof module === "string" ? module : module?.path)
      : [];
    const manifestPaths = Array.isArray(spec?.additionalFiles) ? spec.additionalFiles : [];
    // The explicit architecture blueprint is authoritative when present; the
    // runtime manifest remains the compatibility fallback for older projects.
    return [...architecturePaths, ...manifestPaths]
      .filter(path => typeof path === "string" && MODULE_PATH.test(path)
        && !/(^|\\/)node_modules\\//i.test(path));
  } catch {
    return [];
  }
}

export function orderRuntimeModulePaths(files) {
  const candidates = Object.keys(files)
    .filter(path => path !== "game.js" && MODULE_PATH.test(path) && !/(^|\/)node_modules\//i.test(path));
  const available = new Set(candidates);
  const seen = new Set();
  const ordered = [];
  for (const path of declaredModuleOrder(files)) {
    if (available.has(path) && !seen.has(path)) {
      seen.add(path);
      ordered.push(path);
    }
  }
  const remaining = candidates.filter(path => !seen.has(path)).sort((a, b) => a.localeCompare(b));
  return ordered.concat(remaining);
}
