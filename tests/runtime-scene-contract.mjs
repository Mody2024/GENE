import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source = readFileSync(new URL("../apps/web/app/lib/runtime-scene.ts", import.meta.url), "utf8");
assert.match(source, /draw2D=function\(ctx,opts\)[\s\S]{0,100}var scene=this/ , "draw2D captures the scene before entering its callback");
assert.match(source, /scene\.drawMesh2D\(ctx,o,unit,ox,oy\)/, "OBJ scene objects route through the captured scene instance");
assert.doesNotMatch(source, /if\(o\.modelPath&&this\.drawMesh2D/, "callback must not access an unbound this");
assert.match(source, /getVisibleObjects=function\(\)[\s\S]{0,100}return this\.objects\.filter/, "renderer uses visible scene objects");
assert.match(source, /analyzeLayout=function\(options\)/, "scene runtime exposes an advisory layout analysis pass");
assert.match(source, /OBJECT_OUTSIDE_WORLD_LIMIT/, "layout analysis flags objects outside a configurable world limit");
assert.match(source, /EXTREME_OBJECT_SCALE/, "layout analysis flags unusually large scene transforms");
assert.match(source, /POSSIBLE_OBJECT_OVERLAP/, "layout analysis reports near-complete object overlap for duplicate-geometry review");
assert.match(source, /Heuristic checks are advisory/, "layout analysis explicitly avoids claiming every overlap is a defect");
console.log("Runtime scene contract passed (callback binding and OBJ draw dispatch).");

assert.match(source, /getIntegrityReport=function\(\)/, "scene runtime exposes a unified manifest integrity report");
assert.match(source, /getPlayableReadinessReport=async function\(options\)/, "scene runtime exposes a playable-readiness preflight");
assert.match(source, /SPAWN_MARKER_NOT_FOUND/, "readiness preflight can enforce a requested spawn marker");
assert.match(source, /GOAL_MARKER_NOT_FOUND/, "readiness preflight can enforce a requested goal marker");
assert.match(source, /MESH_NOT_RENDERABLE/, "readiness preflight blocks scenes with assigned mesh assets that fail validation");
assert.match(source, /var status=await scene\.getAssetStatusVerified\(o\.id\)/, "playable readiness verifies mesh content integrity rather than checking only file presence");
assert.match(source, /ASSET_INTEGRITY_FAILED/, "playable readiness blocks assets whose verified content fingerprints fail");
assert.match(source, /MISSING_RUNTIME_MESH_ASSET/, "readiness preflight blocks visible objects whose assigned mesh files are absent");
assert.match(source, /UNASSIGNED_MESH_OBJECT/, "readiness preflight blocks mesh/model objects with no assigned model");
assert.match(source, /DUPLICATE_SCENE_IDS_REPAIRED/, "readiness preflight warns when duplicate IDs required normalization");
assert.match(source, /INVALID_SCENE_ENTRIES_NORMALIZED/, "readiness preflight warns when malformed manifest entries were normalized");
assert.match(source, /This is a structural preflight, not proof of successful rendering/, "readiness preflight documents its limits and does not falsely certify a complete playable game");
assert.match(source, /MISSING_RUNTIME_MESH_ASSETS/, "scene integrity report identifies assigned meshes missing from the runtime bundle");
assert.match(source, /SCENE_OBJECT_LIMIT_REACHED/, "scene integrity report surfaces objects dropped by the runtime limit");
assert.match(source, /Presence checks do not guarantee a mesh parses/, "scene integrity report distinguishes file presence from actual renderability");
assert.match(source, /getAssetStatus=function\(id\)/, "scene runtime exposes asset integration status per object");
assert.match(source, /Referenced OBJ file is absent from the runtime asset bundle/, "scene diagnostics catch missing model files before rendering");
assert.match(source, /OBJ file contains no renderable triangle groups/, "scene diagnostics reject empty or non-renderable mesh files");
assert.match(source, /ready-with-warnings/, "scene diagnostics distinguish usable assets with missing materials");
assert.match(source, /getAssetStatus/, "the status API is part of the scene runtime bootstrap");

assert.match(source, /const seenIds = new Set<string>\(\)/, "runtime scene normalization tracks duplicate object identifiers");
assert.match(source, /while \(seenIds\.has\(id\)\)/, "duplicate scene IDs are deterministically disambiguated");
assert.match(source, /integrity: \{[\s\S]{0,600}duplicateIds,[\s\S]{0,300}truncatedObjectCount:[\s\S]{0,200}invalidObjectEntryIndices/, "scene manifest exposes duplicate-ID, truncation, and invalid-entry repair evidence");
assert.match(source, /sourceObjectCount: rawObjects\.length/, "scene diagnostics report the original manifest object count");
assert.match(source, /loadedObjectCount: Math\.min\(rawObjects\.length, 500\)/, "scene diagnostics report how many objects were admitted to the runtime");
assert.match(source, /truncatedObjectCount: Math\.max\(0, rawObjects\.length - 500\)/, "scene diagnostics expose object entries dropped by the runtime safety limit");
assert.match(source, /invalidObjectEntryIndices/, "scene diagnostics identify malformed scene entries by source index");
assert.match(source, /Math\.max\(0\.001, Math\.min\(100000, Math\.abs\(s\.x\)\)\)/, "zero or negative initial scale values are normalized to visible positive magnitudes");

assert.match(source, /getAssetStatusVerified=async function\(id\)/, "scene status can verify asset hashes before treating a mesh as ready");
assert.match(source, /registry\.verifyContentIntegrity\(manifestPath\)/, "scene integration invokes the runtime asset integrity verifier");
assert.match(source, /status="integrity-failed"/, "scene status blocks assets whose exact file hashes do not match");

assert.match(source, /verifyAllAssets=async function\(\)/, "runtime exposes a scene-wide asset verification pass");
assert.match(source, /targets\.map\(async function\(o\)\{var status=await scene\.getAssetStatusVerified\(o\.id\)/, "scene-wide verification checks every visible mesh object against actual asset hashes");

assert.match(source, /collisionProxyCount:collisionProxies\.length/, "scene mesh readiness reports collision proxy metadata availability");
assert.match(source, /physicsColliderInstantiated:false/, "scene reports never mistake collision metadata for an instantiated physics collider");
assert.match(source, /No collision proxy metadata is available/, "scene readiness warns when a visible mesh has no collision metadata");

assert.match(source, /getCollisionProxyData=function\(id\)/, "runtime scene exposes collision proxy data for each assigned mesh");
assert.match(source, /PROXY_DATA_READY_NOT_INSTANTIATED/, "proxy generation explicitly does not claim to instantiate physics colliders");
assert.match(source, /center:\{x:center\[0\]\+o\.position\.x,y:center\[1\]\+o\.position\.y,z:center\[2\]\+o\.position\.z\}/, "proxy centers are transformed into scene coordinates");
assert.match(source, /var sign=next\[a\]<0\?-1:1;next\[a\]=sign\*Math\.max\(\.001,Math\.min\(100000,Math\.abs\(next\[a\]\)\)\)/, "scene transforms preserve negative scale for mirrored geometry while clamping magnitude");
assert.match(source, /size:\{x:p\.size\[0\]\*Math\.abs\(o\.scale\.x\),y:p\.size\[1\]\*Math\.abs\(o\.scale\.y\),z:p\.size\[2\]\*Math\.abs\(o\.scale\.z\)\}/, "mirrored transforms keep collision proxy dimensions positive");
assert.match(source, /rotation:\{x:o\.rotation\.x,y:o\.rotation\.y,z:o\.rotation\.z\}/, "scene object rotation is retained for oriented-box adapters");
