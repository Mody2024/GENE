import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const agent = readFileSync(new URL("../apps/web/app/api/agent/route.ts", import.meta.url), "utf8");
const forge = readFileSync(new URL("../apps/web/app/api/forge/route.ts", import.meta.url), "utf8");

assert.match(agent, /GENE Forge tool bridge/, "the unified agent route must invoke Forge during relevant 3D builds");
assert.match(agent, /body\.project\?\.projectIntent === "game-3d"/, "explicit 3D project intent must trigger Forge");
assert.match(agent, /body\.project\?\.preferredEngine === "webgl3d"/, "WebGL3D projects must trigger Forge");
assert.match(agent, /nativeOnly: true/, "agent tool calls must use bounded native mode to avoid recursive provider calls");
assert.match(agent, /assets\/models\/" \+ asset\.kind \+ "\.obj"/, "generated OBJ meshes must be added to the project");
assert.match(agent, /assets\/models\/" \+ asset\.kind \+ "\.mtl"/, "generated materials must be added to the project");
assert.match(agent, /GENE Forge tool run: generated/, "the final agent response must disclose the actual Forge run");
assert.match(forge, /body\.nativeOnly === true/, "Forge must expose a bounded native-only internal tool mode");
assert.match(forge, /nativeAssetResponse\(prompt, kind, quality/, "native-only mode must use the validated native asset generator");
console.log("GENE Chat ↔ Forge integration contract tests passed.");
