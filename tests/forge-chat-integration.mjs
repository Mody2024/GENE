import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const agent = readFileSync(new URL("../apps/web/app/api/agent/route.ts", import.meta.url), "utf8");
const forge = readFileSync(new URL("../apps/web/app/api/forge/route.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../apps/web/app/page.tsx", import.meta.url), "utf8");
const researchCard = readFileSync(new URL("../apps/web/app/components/ResearchCard.tsx", import.meta.url), "utf8");

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

assert.match(page, /async function importResearchImage\(image: any\)/, "research cards can invoke the reviewed image-import workflow");
assert.match(page, /fetchWithToolApproval\("\/api\/research\/import"/, "image import passes through the explicit call-scoped approval gateway");
assert.match(page, /contentIntegrity: \{ algorithm: "sha256", files: \{ \[imagePath\]: imported\.sha256 \} \}/, "imported images are saved with exact-byte SHA-256 manifests");
assert.match(page, /automaticallyAppliedAsTexture: false/, "reference import does not falsely claim automatic texture application");
assert.match(page, /<ResearchCard bundle=\{msg\.research\} onImportImage=\{importResearchImage\}/, "the research card is connected to project import");
assert.match(page, /researchAssetImport/, "the tool approval helper recognizes research image import");

assert.match(researchCard, /onImportImage\?: \(image: any\) => void/, "research cards expose an optional import callback");
assert.match(researchCard, /Import to project/, "each eligible visual reference has a clear import action");
assert.match(researchCard, /<a href=\{image\.page\}[\s\S]{0,700}<\/a>[\s\S]{0,600}Import to project/, "the import action is a separate control rather than nested inside the source link");

assert.match(page, /tool === "researchAssetImport"[\s\S]{0,260}input\?\.sourceUrl[\s\S]{0,180}input\?\.license/, "research import approval previews the exact source URL and declared license");

assert.match(page, /sourcePage: String\(sourceImage\.page \|\| ""\)/, "research image references preserve source page metadata");
assert.match(page, /sourceUrl: String\(sourceImage\.full \|\| sourceImage\.thumb \|\| ""\)/, "research image references preserve the exact image URL");
assert.match(page, /filter\(ref => ref\.kind === "image" && ref\.dataBase64\)\.slice\(0, 2\)/, "automated and manual Forge calls pass actual image pixels rather than text-only references");
assert.match(page, /filter\(ref => ref\.kind === "text"\)\.slice\(0, 2\)/, "text notes remain available alongside image references");

assert.match(page, /const savedResearchImages = useMemo/, "imported research images are enumerated from project manifests");
assert.match(page, /RESEARCH REFERENCES[\s\S]{0,900}Imported images/, "the asset library displays imported reference images");
assert.match(page, /removeForgeAsset\(asset\.id\)/, "imported reference files can be removed through the existing asset removal flow");
