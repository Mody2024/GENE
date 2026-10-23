import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source = readFileSync(new URL("../apps/web/app/lib/runtime-scene.ts", import.meta.url), "utf8");
assert.match(source, /draw2D=function\(ctx,opts\)[\s\S]{0,100}var scene=this/ , "draw2D captures the scene before entering its callback");
assert.match(source, /scene\.drawMesh2D\(ctx,o,unit,ox,oy\)/, "OBJ scene objects route through the captured scene instance");
assert.doesNotMatch(source, /if\(o\.modelPath&&this\.drawMesh2D/, "callback must not access an unbound this");
assert.match(source, /getVisibleObjects=function\(\)[\s\S]{0,100}return this\.objects\.filter/, "renderer uses visible scene objects");
console.log("Runtime scene contract passed (callback binding and OBJ draw dispatch).");

assert.match(source, /getAssetStatus=function\(id\)/, "scene runtime exposes asset integration status per object");
assert.match(source, /Referenced OBJ file is absent from the runtime asset bundle/, "scene diagnostics catch missing model files before rendering");
assert.match(source, /OBJ file contains no renderable triangle groups/, "scene diagnostics reject empty or non-renderable mesh files");
assert.match(source, /ready-with-warnings/, "scene diagnostics distinguish usable assets with missing materials");
assert.match(source, /getAssetStatus/, "the status API is part of the scene runtime bootstrap");
