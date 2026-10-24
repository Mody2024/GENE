/**
 * Isomorphic helpers for call-scoped tool approvals (safe to import in the browser).
 * Approvals themselves are issued and verified on the server (see tool-approval-server.mjs):
 * the browser can no longer mint an approval by itself.
 */
export const APPROVAL_TTL_MS = 5 * 60 * 1000;

/** Tools that need an explicit, call-scoped approval before the server will run them. */
export const GATED_TOOLS = Object.freeze({
  research: "Research (Wikipedia, Wikimedia Commons, Poly Haven, optional web search)",
  agentResearch: "AI web research",
  forge3d: "3D Forge mesh generation",
  forge2d: "2D Forge sprite/art generation",
  illustrate: "AI SVG illustration"
});

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).filter(key => key !== "toolApproval").sort().map(key => [key, stable(value[key])]));
  }
  return value;
}
/** Canonical JSON for a tool call: key order and any attached approval never change it. */
export function canonicalToolCall(tool, input) {
  return JSON.stringify({ tool: String(tool), input: stable(input || {}) });
}
export function stripToolApproval(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  const { toolApproval, ...input } = body;
  return input;
}
/** Human-readable proposal shown before the user decides. Lists the exact inputs that will be approved. */
export function describeToolCall(tool, input) {
  const label = GATED_TOOLS[tool] || String(tool);
  const clean = stripToolApproval(input) || {};
  const detail = String(clean.query || clean.prompt || clean.message || clean.project?.initialPrompt || "project request").trim().slice(0, 240);
  const extras = ["kind", "quality", "style", "engine", "images"].filter(key => clean[key] !== undefined && typeof clean[key] !== "object").map(key => key + "=" + clean[key]);
  return { tool, label, detail, extras };
}
