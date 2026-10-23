import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const agent = readFileSync(new URL("../apps/web/app/api/agent/route.ts", import.meta.url), "utf8");
const forge = readFileSync(new URL("../apps/web/app/api/forge/route.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../apps/web/app/page.tsx", import.meta.url), "utf8");

assert.match(agent, /GENE Forge tool bridge/, "the unified agent route must invoke Forge during relevant 3D builds");
assert.match(agent, /body\.project\?\.projectIntent === "game-3d"/, "explicit 3D project intent must trigger Forge");
assert.match(agent, /body\.project\?\.preferredEngine === "webgl3d"/, "WebGL3D projects must trigger Forge");
assert.match(agent, /nativeOnly: true/, "agent tool calls must use bounded native mode to avoid recursive provider calls");
assert.match(agent, /assets\/models\/" \+ asset\.kind \+ "\.obj"/, "generated OBJ meshes must be added to the project");
assert.match(agent, /assets\/models\/" \+ asset\.kind \+ "\.mtl"/, "generated materials must be added to the project");
assert.match(agent, /GENE Forge — completed stages/, "the final agent response must disclose completed Forge stages");
assert.match(agent, /assets\/models\/" \+ asset\.kind \+ "\.obj".*replace\(\/mtllib/, "OBJ material-library references must match exported MTL filenames");
assert.match(forge, /body\.nativeOnly === true/, "Forge must expose a bounded native-only internal tool mode");
assert.match(forge, /nativeAssetResponse\(prompt, kind, quality/, "native-only mode must use the validated native asset generator");
console.log("GENE Chat ↔ Forge integration contract tests passed.");

assert.match(page, /stagedFiles\[base \+ "\/frames\/" \+ frameName\] = String\(frameSvg\)/, "generated 2D frame files must be persisted into the project instead of dropping animation frames");
assert.match(page, /Object\.entries\(item\.asset\.frameFiles \|\| \{\}\)/, "the build pipeline iterates all generated sprite frames");

assert.match(page, /Object\.entries\(data\.asset\.frameFiles \|\| \{\}\)\.map\(\(\[name, svg\]\) => \[prefix \+ "frames\/" \+ name, String\(svg\)\]\)/, "manual 2D asset saving must persist frame files next to the manifest");
assert.match(page, /and " \+ Object\.keys\(data\.asset\.frameFiles \|\| \{\}\)\.length \+ " animation frame files/, "activity log reports how many cropped frames were actually saved");

assert.match(page, /sourceIntegrity\.files\["sprite\.svg"\]/, "staged 2D manifest maps the source sheet fingerprint to its actual project path");
assert.match(page, /sourceManifest\.contentIntegrity\.files \|\| \{\}/, "manual 2D import preserves and relocates the generated source fingerprints");
assert.match(page, /\[prefix \+ name, hash\]/, "manual 2D manifest fingerprints follow the saved asset paths");

assert.match(page, /previousAssetVersion = Number\(JSON\.parse\(project\.files\[prefix \+ "asset\.json"\]/, "editing an existing Forge asset reads its previous manifest version");
assert.match(page, /version: Math\.max\(1, previousAssetVersion \+ 1\)/, "asset edits increment manifest version instead of resetting to version one");
