import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const prompts = await readFile(new URL("../apps/web/app/lib/prompts.ts", import.meta.url), "utf8");
const gateStart = prompts.indexOf("WEBGL3D PLAYABILITY GATE:");
assert.notEqual(gateStart, -1, "3D generation must include a dedicated visible-gameplay gate");
const gate = prompts.slice(gateStart, prompts.indexOf("\\", gateStart + 20) > -1 ? prompts.indexOf("\\", gateStart + 20) : gateStart + 3000);
for (const requirement of [
  "shader compile/link status",
  "non-zero viewport",
  "depth testing",
  "non-empty vertex buffers",
  "projection, view, and model matrices",
  "visible player/avatar",
  "camera frustum",
  "controls that change player/world state",
  "clear-only loops",
  "keep the build from being described as gameplay-verified"
]) {
  assert.ok(gate.includes(requirement), `3D playability gate must require ${requirement}`);
}
console.log("WebGL3D generation acceptance contract passed.\\n");
