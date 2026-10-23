import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source = readFileSync(new URL("../apps/web/app/lib/runtime-scene.ts", import.meta.url), "utf8");
assert.match(source, /draw2D=function\(ctx,opts\)[\s\S]{0,100}var scene=this/ , "draw2D captures the scene before entering its callback");
assert.match(source, /scene\.drawMesh2D\(ctx,o,unit,ox,oy\)/, "OBJ scene objects route through the captured scene instance");
assert.doesNotMatch(source, /if\(o\.modelPath&&this\.drawMesh2D/, "callback must not access an unbound this");
assert.match(source, /getVisibleObjects=function\(\)[\s\S]{0,100}return this\.objects\.filter/, "renderer uses visible scene objects");
console.log("Runtime scene contract passed (callback binding and OBJ draw dispatch).");
