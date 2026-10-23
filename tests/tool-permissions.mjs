import assert from "node:assert/strict";
import { createToolApproval, hasToolApproval, toolCallFingerprint } from "../apps/web/app/lib/tool-permissions.mjs";
import { readFileSync } from "node:fs";

const input = { prompt: "A skeleton character", kind: "character", quality: "standard" };
const approval = createToolApproval("forge2d", input, 1_000);
assert.equal(hasToolApproval({ ...input, toolApproval: approval }, "forge2d", 1_001), true);
assert.equal(hasToolApproval({ ...input, prompt: "A different character", toolApproval: approval }, "forge2d", 1_001), false, "approval must be bound to exact inputs");
assert.equal(hasToolApproval({ ...input, toolApproval: approval }, "forge3d", 1_001), false, "approval cannot be reused for another tool");
assert.equal(hasToolApproval({ ...input, toolApproval: approval }, "forge2d", 400_000), false, "expired approval must fail");
assert.equal(toolCallFingerprint("research", { query: "skeleton", images: true }), toolCallFingerprint("research", { images: true, query: "skeleton" }), "object key order should not affect approval");
for (const [path, tool] of [
  ["../apps/web/app/api/research/route.ts", "research"],
  ["../apps/web/app/api/forge/route.ts", "forge3d"],
  ["../apps/web/app/api/forge/2d/route.ts", "forge2d"]
]) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  assert.match(source, new RegExp('hasToolApproval\\(body, "' + tool + '"\\)'), path + " must enforce approvals server-side");
}
const agentRoute = readFileSync(new URL("../apps/web/app/api/agent/route.ts", import.meta.url), "utf8");
assert.match(agentRoute, /GENE_AI_REQUIRED/, "interview and planning must not use deterministic native mode");
assert.match(agentRoute, /GENE_AI_PROVIDER_UNAVAILABLE/, "provider failures must be surfaced instead of falling back to a native interview");
const workspace = readFileSync(new URL("../apps/web/app/page.tsx", import.meta.url), "utf8");
assert.match(workspace, /window\.confirm\(approvalPrompt/, "the user must explicitly approve direct tool calls");
assert.match(workspace, /buildNestedToolApprovals/, "nested Forge calls must be listed and approved as a batch");
console.log("Call-scoped tool approval tests passed.");
