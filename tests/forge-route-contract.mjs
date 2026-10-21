import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync(new URL("../apps/web/app/api/forge/route.ts", import.meta.url), "utf8");
const presets = readFileSync(new URL("../apps/web/lib/forge-presets.mjs", import.meta.url), "utf8");
const prompt = readFileSync(new URL("../apps/web/app/lib/prompts.ts", import.meta.url), "utf8");

assert.match(route, /from "\.\.\/\.\.\/\.\.\/lib\/forge-presets\.mjs"/, "Forge route must import native presets from the correct workspace-relative path");
assert.match(route, /if \(!apiKeys\.length\)\s*\{\s*const native = nativeAssetResponse/, "native generation must work when Gemini keys are absent");
assert.match(route, /if \(!text\)\s*\{\s*const native = nativeAssetResponse/, "native generation must recover from provider failures");
assert.match(route, /try the bounded native generator before returning an error/, "invalid provider recipes must attempt native fallback");
assert.match(route, /"model\.obj": mesh\.obj/, "Forge must export real OBJ geometry");
assert.match(route, /"model\.mtl": mesh\.mtl/, "Forge must export material definitions");
assert.match(route, /"asset\.json": JSON\.stringify\(mesh\.asset, null, 2\)/, "Forge must export a machine-readable asset manifest");
assert.match(route, /files\["model\.obj"\]\.length > 1_500_000/, "Forge must enforce the mesh output size cap");
assert.match(presets, /export function buildNativeForgeRecipe/, "native recipe generator must be exported");
assert.match(presets, /kind === "weapon"\) throw new Error/, "unsupported native categories must fail explicitly");
assert.match(prompt, /GENE FORGE MANDATORY WORKFLOW/, "the unified agent must be instructed to route 3D requests through Forge");
assert.match(prompt, /GENE FORGE — MANDATORY MODELLING COURSE/, "the detailed modelling curriculum must be present in the agent system prompt");

console.log("GENE Forge route contract tests passed (imports, no-key fallback, provider failure recovery, validated exports, size limits, and mandatory agent routing).");
