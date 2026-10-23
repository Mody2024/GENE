import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync(new URL("../apps/web/app/api/forge/route.ts", import.meta.url), "utf8");
const presets = readFileSync(new URL("../apps/web/lib/forge-presets.mjs", import.meta.url), "utf8");
const prompt = readFileSync(new URL("../apps/web/app/lib/prompts.ts", import.meta.url), "utf8");
const quality = readFileSync(new URL("../apps/web/lib/forge-quality.mjs", import.meta.url), "utf8");
const twoDRoute = readFileSync(new URL("../apps/web/app/api/forge/2d/route.ts", import.meta.url), "utf8");
const twoDModule = readFileSync(new URL("../apps/web/lib/forge-2d.mjs", import.meta.url), "utf8");
const studioPage = readFileSync(new URL("../apps/web/app/page.tsx", import.meta.url), "utf8");
const runtimeAssets = readFileSync(new URL("../apps/web/app/lib/runtime-assets.ts", import.meta.url), "utf8");
const runtimeScene = readFileSync(new URL("../apps/web/app/lib/runtime-scene.ts", import.meta.url), "utf8");
const researchRoute = readFileSync(new URL("../apps/web/app/api/research/route.ts", import.meta.url), "utf8");
const researchSources = readFileSync(new URL("../apps/web/app/lib/research-sources.mjs", import.meta.url), "utf8");

assert.match(route, /from "\.\.\/\.\.\/\.\.\/lib\/forge-presets\.mjs"/, "Forge route must import native presets from the correct workspace-relative path");
assert.match(route, /if \(!apiKeys\.length\)\s*\{\s*const native = nativeAssetResponse/, "native generation must work when Gemini keys are absent");
assert.match(route, /if \(!text\)\s*\{\s*const native = nativeAssetResponse/, "native generation must recover from provider failures");
assert.match(route, /function stableForgeAssetId/, "3D assets must receive stable IDs");
assert.match(route, /function withForgeAssetMetadata/, "3D assets must carry a canonical versioned manifest");
assert.match(route, /runtimeCompatibility:/, "3D assets must expose runtime capability metadata");
assert.match(route, /textures: "not-included"/, "3D manifests must not imply texture support when textures are not exported");
assert.match(route, /rigging: "not-supported-by-current-pipeline"/, "3D manifests must clearly disclose missing rigging support");
assert.match(route, /qualityEvidence: "structural-only; no automatic visual equivalence claim"/, "structural QA must not be presented as proof of visual fidelity");
assert.match(route, /externalDependencies: \[\]/, "native and AI-generated meshes must disclose their external dependency list");
assert.match(route, /sourcePrompt: prompt\.slice/, "3D asset provenance must retain the source brief");
assert.match(route, /assetId: manifest\.assetId, version: manifest\.version, manifest/, "API response and exported manifest must share one identity");
assert.match(route, /try the bounded native generator before returning an error/, "invalid provider recipes must attempt native fallback");
assert.match(route, /shape === "capsule"/, "mesh builder must generate capsule geometry for better limbs and organic forms");
assert.match(route, /"model\.obj": mesh\.obj/, "Forge must export real OBJ geometry");
assert.ok(runtimeScene.includes('o.modelPath.replace(/\\\\.obj$/i,".mtl")'), "Scene Studio must resolve the matching MTL file for any Forge model filename, including assets/models/character.obj");
assert.match(route, /"model\.mtl": mesh\.mtl/, "Forge must export material definitions");
assert.match(route, /"asset\.json": JSON\.stringify\(manifest, null, 2\)/, "Forge must export the canonical versioned asset manifest");
assert.match(route, /analyzeForgeRecipe\(recipe\)/, "Forge must run deterministic structural QA before returning an asset");
assert.match(route, /qualityReport: manifest\.qualityReport/, "Forge response must expose the canonical manifest QA report");
assert.match(quality, /scope: "structural-only"/, "QA must disclose that checks are structural, not visual");
assert.match(quality, /DUPLICATE_PART_NAMES/, "QA must flag duplicate part names");
assert.match(quality, /POSSIBLE_FLOATING_ASSET/, "QA must flag likely floating assets");
assert.match(route, /files\["model\.obj"\]\.length > 1_500_000/, "Forge must enforce the mesh output size cap");
assert.match(twoDRoute, /buildNative2DAsset/, "2D Forge API must use the native asset generator");
assert.match(twoDRoute, /sprite\.svg/, "2D Forge API must return an SVG asset file");
assert.match(twoDRoute, /GENE_2D_RATE_LIMIT/, "2D Forge API must have a request rate limit");
assert.match(twoDModule, /gene-forge-2d-v1/, "2D assets must have a versioned manifest format");
assert.match(twoDModule, /NO_SKELETON_RIG/, "2D character output must disclose that it is not a rigged model");
assert.match(studioPage, /fetchWithToolApproval\("\/api\/forge\/2d"/, "asset workshop must call the native 2D endpoint through explicit consent");
assert.match(studioPage, /generateForge2DAsset/, "asset workshop must save native 2D output");
assert.match(studioPage, /Integrate the generated 2D asset/, "2D assets must offer a game-integration action");
assert.match(studioPage, /Saved artwork/, "asset workshop must list saved 2D assets");
assert.ok(runtimeAssets.includes("asset-2d\\.json"), "runtime asset bootstrap must include 2D manifests");
assert.match(runtimeAssets, /sprite\|sprite-sheet\|atlas/, "runtime asset bootstrap must expose generated and imported sprite sheets");
assert.match(researchRoute, /GOOGLE_CSE_API_KEY/, "Google search must only use server-side configured credentials");
assert.match(researchRoute, /GOOGLE_CSE_ID/, "Google Custom Search must require a configured engine ID");
assert.match(researchRoute, /Google Custom Search is not configured/, "research must disclose when Google search is unavailable");
assert.match(researchSources, /parseGoogleSearchResults/, "research sources must rank external search results");
assert.match(runtimeAssets, /A\.draw=function\(ctx,p,x,y,w,h\)/, "generated SVG assets must be drawable by Canvas games");
assert.match(presets, /part\("left upper arm","capsule"/, "native characters must use capsule limbs instead of purely cylindrical limbs");
assert.match(presets, /export function buildNativeForgeRecipe/, "native recipe generator must be exported");
assert.match(presets, /kind\s*===\s*"weapon"\)\s*throw new Error/, "unsupported native categories must fail explicitly");
assert.match(prompt, /GENE FORGE MANDATORY WORKFLOW/, "the unified agent must be instructed to route 3D requests through Forge");
assert.match(prompt, /GENE FORGE — MANDATORY MODELLING COURSE/, "the detailed modelling curriculum must be present in the agent system prompt");

console.log("GENE Forge route contract tests passed (imports, no-key fallback, provider failure recovery, validated exports, size limits, and mandatory agent routing).");

assert.match(route, /function attachContentIntegrity\(manifest: any, obj: string, mtl: string\)/, "Forge manifests expose a reusable exact-file integrity helper");
assert.match(route, /createHash\("sha256"\)\.update\(obj, "utf8"\)\.digest\("hex"\)/, "the exported OBJ receives a SHA-256 fingerprint");
assert.match(route, /createHash\("sha256"\)\.update\(mtl, "utf8"\)\.digest\("hex"\)/, "the exported MTL receives a SHA-256 fingerprint");
assert.equal((route.match(/attachContentIntegrity\(withForgeAssetMetadata/g) || []).length, 2, "native and AI Forge outputs both receive file fingerprints");

assert.match(twoDRoute, /createHash\("sha256"\)\.update\(asset\.svg, "utf8"\)\.digest\("hex"\)/, "native 2D sprite SVG receives a SHA-256 fingerprint");
assert.match(twoDRoute, /integrityFiles\["frames\/" \+ name\] = createHash\("sha256"\)/, "every cropped animation frame receives its own fingerprint");
assert.match(twoDRoute, /contentIntegrity: \{ algorithm: "sha256", files: integrityFiles \}/, "2D asset manifest stores exact source and frame fingerprints");

assert.match(route, /"stairs" \| "arch"/, "Forge accepts useful procedural architectural shapes");
assert.match(route, /const steps = 5/, "stair geometry is generated from bounded step segments");
assert.match(route, /const segments = 16/, "arched geometry uses a curved segmented mesh rather than a flat placeholder");
assert.match(route, /Allowed shapes: box, beveledBox[\s\S]{0,180}stairs, arch/, "AI modelling instructions describe the new shapes");

assert.match(route, /function assertValidPrimitiveMesh\(/, "Forge validates generated primitive geometry before export");
assert.match(route, /contains a non-finite vertex/, "non-finite mesh coordinates are rejected");
assert.match(route, /contains an invalid face/, "invalid face indices cannot be written into an OBJ file");
assert.match(route, /assertValidPrimitiveMesh\(mesh, part\.name\)/, "every generated part passes topology validation");

assert.match(route, /hasValidImageSignature\(ref\.mimeType, referenceBytes\)/, "Forge validates the actual uploaded reference bytes against the declared image MIME");
assert.match(route, /REFERENCE_SIGNATURE_MISMATCH/, "Forge rejects image payloads disguised as another raster format");
assert.match(route, /totalImageBytes > 550_000/, "Forge enforces a decoded byte budget in addition to base64 character limits");
assert.match(route, /referenceBytes\.toString\("base64"\)/, "only the validated decoded bytes are forwarded to the provider");

assert.match(prompt, /every frameFiles entry[\s\S]{0,140}preserve animationClips and remap contentIntegrity paths/, "Forge course requires persisting all animation frames and their integrity metadata");
