import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
process.env.NODE_ENV = "test";
process.env.GENE_APPROVAL_SECRET = "unit-test-secret-0123456789";
const { issueToolApproval, verifyToolApproval, hasToolApproval, getApprovalAudit, resetApprovalStateForTests, isGatedTool } = await import("../apps/web/app/lib/tool-approval-server.mjs");
const { canonicalToolCall, describeToolCall, GATED_TOOLS, APPROVAL_TTL_MS } = await import("../apps/web/app/lib/tool-permissions.mjs");
resetApprovalStateForTests();

const input = { prompt: "A skeleton character", kind: "character", quality: "standard" };
const t0 = 1_000_000;
let approval = issueToolApproval("forge2d", input, t0);
assert.equal(approval.signature.length, 64, "approval is HMAC-SHA256 signed by the server");
assert.equal(verifyToolApproval({ ...input, toolApproval: approval }, "forge2d", { consume: false, now: t0 + 1 }).ok, true);
assert.equal(hasToolApproval({ ...input, prompt: "A different character", toolApproval: approval }, "forge2d", { consume: false, now: t0 + 1 }), false, "approval is bound to exact inputs");
assert.equal(verifyToolApproval({ ...input, prompt: "A different character", toolApproval: approval }, "forge2d", { consume: false, now: t0 + 1 }).code, "INPUT_CHANGED");
assert.equal(verifyToolApproval({ ...input, toolApproval: approval }, "forge3d", { consume: false, now: t0 + 1 }).code, "WRONG_TOOL", "approval cannot be reused for another tool");
assert.equal(verifyToolApproval({ ...input, toolApproval: approval }, "forge2d", { consume: false, now: t0 + APPROVAL_TTL_MS + 1 }).code, "EXPIRED", "expired approval fails");
assert.equal(canonicalToolCall("research", { query: "skeleton", images: true }), canonicalToolCall("research", { images: true, query: "skeleton" }), "key order does not matter");

// Forgery: a browser cannot mint an approval by itself.
const forgedSignature = { ...approval, signature: "0".repeat(64) };
assert.equal(verifyToolApproval({ ...input, toolApproval: forgedSignature }, "forge2d", { consume: false, now: t0 + 1 }).code, "BAD_SIGNATURE");
const fakeFingerprint = { approved: true, tool: "forge2d", fingerprint: "deadbeef-1c", issuedAt: t0, expiresAt: t0 + 1000, nonce: "abc", signature: "00" };
assert.equal(verifyToolApproval({ ...input, toolApproval: fakeFingerprint }, "forge2d", { consume: false, now: t0 + 1 }).ok, false, "legacy unsigned approvals are rejected");
const extended = { ...approval, expiresAt: approval.expiresAt + 3_600_000 };
assert.equal(verifyToolApproval({ ...input, toolApproval: extended }, "forge2d", { consume: false, now: t0 + 1 }).code, "BAD_SIGNATURE", "expiry cannot be extended by the client");
assert.equal(verifyToolApproval({ ...input }, "forge2d", { now: t0 + 1 }).code, "MISSING");
assert.equal(verifyToolApproval({ ...input, toolApproval: { ...approval, approved: false } }, "forge2d", { now: t0 + 1 }).code, "MISSING", "denied approval never runs");

// Single use: a call that executes consumes its approval.
const body = { ...input, toolApproval: approval };
assert.equal(verifyToolApproval(body, "forge2d", { now: t0 + 2 }).ok, true, "first run is allowed");
assert.equal(verifyToolApproval(body, "forge2d", { now: t0 + 3 }).code, "ALREADY_USED", "replaying the same approval is refused");
assert.equal(verifyToolApproval(body, "forge2d", { consume: false, now: t0 + 3 }).code, "ALREADY_USED");

// A batch must enumerate each call: every call has its own approval and one cannot stand in for another.
const batchA = issueToolApproval("forge3d", { prompt: "rover", kind: "vehicle" }, t0);
const batchB = issueToolApproval("forge3d", { prompt: "tower", kind: "environment" }, t0);
assert.equal(hasToolApproval({ prompt: "tower", kind: "environment", toolApproval: batchA }, "forge3d", { consume: false, now: t0 + 1 }), false, "a denied/missing call cannot borrow another call's approval");
assert.equal(hasToolApproval({ prompt: "rover", kind: "vehicle", toolApproval: batchA }, "forge3d", { consume: false, now: t0 + 1 }), true);
assert.equal(hasToolApproval({ prompt: "tower", kind: "environment", toolApproval: batchB }, "forge3d", { consume: false, now: t0 + 1 }), true);
// A parent route may pre-check without consuming; only the executing leaf consumes.
assert.equal(hasToolApproval({ prompt: "rover", kind: "vehicle", toolApproval: batchA }, "forge3d", { consume: false, now: t0 + 1 }), true);
assert.equal(hasToolApproval({ prompt: "rover", kind: "vehicle", toolApproval: batchA }, "forge3d", { now: t0 + 1 }), true);
assert.equal(hasToolApproval({ prompt: "rover", kind: "vehicle", toolApproval: batchA }, "forge3d", { now: t0 + 1 }), false);

// Only the declared tools can be approved, and every tool the server gates is declared.
assert.equal(isGatedTool("illustrate"), true);
assert.equal(isGatedTool("rm -rf"), false);
assert.throws(() => issueToolApproval("nope", {}), /Unknown tool/);
assert.deepEqual(Object.keys(GATED_TOOLS).sort(), ["agentResearch", "forge2d", "forge3d", "illustrate", "research"]);

// Audit trail: decisions are recorded without inputs or secrets.
const log = getApprovalAudit();
assert.ok(log.some(entry => entry.event === "issued") && log.some(entry => entry.event === "consumed") && log.some(entry => entry.event === "rejected" && entry.code === "ALREADY_USED"));
const serialized = JSON.stringify(log);
assert.ok(!serialized.includes("skeleton") && !serialized.includes("unit-test-secret") && !serialized.includes(approval.signature), "audit log holds no inputs, secrets or signatures");
assert.ok(log.every(entry => !entry.fingerprint || entry.fingerprint.length === 12));
assert.match(describeToolCall("forge2d", { ...input, toolApproval: approval }).detail, /skeleton/);
assert.ok(!describeToolCall("forge2d", { ...input, toolApproval: approval }).extras.some(extra => extra.includes("toolApproval")));

// Every server route that runs a gated tool enforces approvals at the server boundary.
for (const [path, tool] of [
  ["../apps/web/app/api/research/route.ts", "research"],
  ["../apps/web/app/api/forge/route.ts", "forge3d"],
  ["../apps/web/app/api/forge/2d/route.ts", "forge2d"],
  ["../apps/web/app/api/illustrate/route.ts", "illustrate"]
]) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  assert.match(source, new RegExp('hasToolApproval\\(body, "' + tool + '"\\)'), path + " must enforce approvals server-side");
  assert.match(source, /tool-approval-server\.mjs/, path + " must use the signed verifier");
}
const agentRoute = readFileSync(new URL("../apps/web/app/api/agent/route.ts", import.meta.url), "utf8");
assert.match(agentRoute, /hasToolApproval\(body, "agentResearch"\)/);
assert.equal((agentRoute.match(/consume: false/g) || []).length >= 4, true, "parent pre-checks must not spend the approval the leaf call needs");
assert.match(agentRoute, /GENE_AI_REQUIRED/, "interview and planning must not use deterministic native mode");
assert.match(agentRoute, /GENE_AI_PROVIDER_UNAVAILABLE/, "provider failures must be surfaced instead of falling back to a native interview");

// The approval endpoint is same-origin only and the browser cannot sign anything itself.
const approvalsRoute = readFileSync(new URL("../apps/web/app/api/approvals/route.ts", import.meta.url), "utf8");
assert.match(approvalsRoute, /APPROVAL_ORIGIN/);
assert.match(approvalsRoute, /issueToolApproval/);
const clientLib = readFileSync(new URL("../apps/web/app/lib/tool-approval-client.ts", import.meta.url), "utf8");
assert.match(clientLib, /window\.confirm\(approvalPrompt/, "the user must explicitly approve direct tool calls");
assert.ok(!/createHmac|createHash|sign\(/.test(clientLib), "the client library never signs approvals");
const workspace = readFileSync(new URL("../apps/web/app/page.tsx", import.meta.url), "utf8");
assert.match(workspace, /confirmAndApprove\(tool, payload/);
assert.match(workspace, /buildNestedToolApprovals/, "nested Forge calls must be listed and approved as a batch");
assert.ok(!/createToolApproval/.test(workspace), "the workspace must not mint approvals locally");
const art = readFileSync(new URL("../apps/web/app/components/ArtStudio.tsx", import.meta.url), "utf8");
assert.match(art, /confirmAndApprove\("illustrate"/);
assert.match(art, /confirmAndApprove\("research"/);
assert.match(art, /explicit batch/, "art-pack generation must enumerate every call before running");
console.log("Call-scoped tool approval tests passed (signed, single-use, expiring, audited, every gated route).");
