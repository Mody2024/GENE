/**
 * Call-scoped tool approvals shared by the browser and API routes.
 * The fingerprint binds approval to the exact tool inputs. This is not a user-auth
 * system; it is the server-side enforcement half of GENE's explicit-consent workflow.
 */
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).filter(key => key !== "toolApproval").sort().map(key => [key, stable(value[key])]));
  }
  return value;
}
export function toolCallFingerprint(tool, input) {
  const text = JSON.stringify({ tool: String(tool), input: stable(input || {}) });
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0") + "-" + text.length.toString(16);
}
export function createToolApproval(tool, input, now = Date.now()) {
  return { approved: true, tool: String(tool), fingerprint: toolCallFingerprint(tool, input), issuedAt: now };
}
export function hasToolApproval(body, tool, now = Date.now(), maxAgeMs = 5 * 60 * 1000) {
  const approval = body && typeof body === "object" ? body.toolApproval : null;
  if (!approval || approval.approved !== true || approval.tool !== tool || typeof approval.fingerprint !== "string") return false;
  if (!Number.isFinite(approval.issuedAt) || approval.issuedAt > now + 5_000 || now - approval.issuedAt > maxAgeMs) return false;
  return approval.fingerprint === toolCallFingerprint(tool, body);
}
export function stripToolApproval(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  const { toolApproval, ...input } = body;
  return input;
}
