import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { APPROVAL_TTL_MS, GATED_TOOLS, canonicalToolCall } from "./tool-permissions.mjs";

/**
 * Server-side half of GENE's permission gateway.
 *  - Approvals are HMAC-signed by the server and bound to the tool and the exact canonical inputs.
 *  - They expire, and a call that executes consumes its approval, so one consent cannot be replayed.
 *  - Every issue/verify/consume/reject decision is written to a bounded audit log (no inputs, no secrets).
 * This is consent enforcement, not user authentication: issuing is restricted to same-origin browser requests.
 */
const MAX_CONSUMED = 5000;
const MAX_AUDIT = 300;
const consumed = new Map();
const audit = [];
let cachedSecret = null;

function secret() {
  if (cachedSecret) return cachedSecret;
  const explicit = (process.env.GENE_APPROVAL_SECRET || "").trim();
  if (explicit.length >= 16) return (cachedSecret = createHash("sha256").update("gene-approval-v1|" + explicit).digest());
  // Without a configured secret, derive one from server-only credentials so every instance agrees and the
  // browser cannot know it. If none exist, fall back to a random per-process key (approvals then only work in-process).
  const material = ["GEMINI_API_KEY", "GROQ_API_KEY", "OPENROUTER_API_KEY", "GENE_BUILD_PASSWORD", "GENE_PUBLISH_PASSWORD"].map(name => process.env[name] || "").filter(Boolean).join("|");
  cachedSecret = material ? createHash("sha256").update("gene-approval-v1|" + material).digest() : randomBytes(32);
  return cachedSecret;
}
function fingerprint(tool, input) {
  return createHash("sha256").update(canonicalToolCall(tool, input)).digest("hex");
}
function sign(claims) {
  return createHmac("sha256", secret()).update([claims.tool, claims.fingerprint, claims.issuedAt, claims.expiresAt, claims.nonce].join("|")).digest("hex");
}
function record(event, tool, code, claims) {
  const entry = { at: new Date().toISOString(), event, tool: String(tool), code, fingerprint: claims?.fingerprint ? String(claims.fingerprint).slice(0, 12) : undefined };
  audit.push(entry);
  if (audit.length > MAX_AUDIT) audit.shift();
  if (process.env.GENE_APPROVAL_LOG !== "off" && process.env.NODE_ENV !== "test") console.info("[gene-approval]", JSON.stringify(entry));
}
function prune(now) {
  for (const [nonce, expiresAt] of consumed) if (expiresAt < now) consumed.delete(nonce);
  while (consumed.size > MAX_CONSUMED) consumed.delete(consumed.keys().next().value);
}

export function isGatedTool(tool) {
  return Object.prototype.hasOwnProperty.call(GATED_TOOLS, tool);
}

/** Issue an approval for exactly this tool call. Call only after the user has explicitly consented. */
export function issueToolApproval(tool, input, now = Date.now()) {
  if (!isGatedTool(tool)) throw new Error("Unknown tool: " + tool);
  const claims = { approved: true, tool, fingerprint: fingerprint(tool, input), issuedAt: now, expiresAt: now + APPROVAL_TTL_MS, nonce: randomBytes(12).toString("hex") };
  record("issued", tool, "ok", claims);
  return { ...claims, signature: sign(claims) };
}

/**
 * Check the approval attached to a request body.
 * mode "check" verifies without using the approval up (parent calls that hand it to a child call);
 * mode "consume" (default) marks it used so it cannot run a second time.
 */
export function verifyToolApproval(body, tool, { consume = true, now = Date.now() } = {}) {
  const approval = body && typeof body === "object" ? body.toolApproval : null;
  const reject = (code, claims) => { record("rejected", tool, code, claims); return { ok: false, code }; };
  if (!approval || typeof approval !== "object" || approval.approved !== true) return reject("MISSING");
  if (approval.tool !== tool) return reject("WRONG_TOOL");
  const { fingerprint: fp, issuedAt, expiresAt, nonce, signature } = approval;
  if (typeof fp !== "string" || typeof nonce !== "string" || typeof signature !== "string" || !Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)) return reject("MALFORMED");
  const expected = Buffer.from(sign({ tool, fingerprint: fp, issuedAt, expiresAt, nonce }), "hex");
  let given;
  try { given = Buffer.from(signature, "hex"); } catch { return reject("BAD_SIGNATURE"); }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return reject("BAD_SIGNATURE");
  if (issuedAt > now + 5_000 || now > expiresAt || expiresAt - issuedAt > APPROVAL_TTL_MS) return reject("EXPIRED", approval);
  if (fp !== fingerprint(tool, body)) return reject("INPUT_CHANGED", approval);
  prune(now);
  if (consumed.has(nonce)) return reject("ALREADY_USED", approval);
  if (consume) {
    consumed.set(nonce, expiresAt);
    record("consumed", tool, "ok", approval);
  } else record("verified", tool, "ok", approval);
  return { ok: true, code: "OK" };
}
export const hasToolApproval = (body, tool, options) => verifyToolApproval(body, tool, options).ok;

export function getApprovalAudit() { return audit.slice(); }
export function resetApprovalStateForTests() { consumed.clear(); audit.length = 0; cachedSecret = null; }
