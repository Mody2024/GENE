import assert from "node:assert/strict";
import { buildNativeForgeRecipe } from "../apps/web/lib/forge-presets.mjs";

const cases = [
  { prompt: "A customized skeleton citizen with a jacket", kind: "character", min: 16 },
  { prompt: "A modern apartment building with glass windows", kind: "building", min: 20 },
  { prompt: "A delivery truck with cargo box", kind: "vehicle", min: 12 },
  { prompt: "A city street environment", kind: "environment", min: 10 },
  { prompt: "A wooden chair", kind: "prop", min: 5 },
  { prompt: "A desk with metal legs", kind: "prop", min: 5 },
  { prompt: "A leafy tree", kind: "prop", min: 4 }
];
for (const item of cases) {
  const recipe = buildNativeForgeRecipe({ prompt: item.prompt, kind: item.kind, quality: "standard" });
  assert.equal(recipe.kind, item.kind);
  assert.ok(recipe.parts.length >= item.min, item.prompt + " should have meaningful geometry");
  assert.ok(recipe.parts.length <= 54);
  for (const part of recipe.parts) {
    assert.match(part.color, /^#[0-9a-f]{6}$/i);
    assert.ok(["box", "beveledBox", "sphere", "cylinder", "cone", "wedge", "torus"].includes(part.shape));
    assert.ok(part.name.trim().length > 0, "parts need meaningful names");
    assert.ok(["matte", "metal", "rubber", "glass", "emissive"].includes(part.surface));
    assert.ok(part.scale.every(n => Number.isFinite(n) && n > 0.03 && n <= 20));
    assert.ok(part.position.every(n => Number.isFinite(n) && Math.abs(n) <= 40));
    assert.ok(part.rotation.every(n => Number.isFinite(n) && Math.abs(n) <= 360));
  }
}
const blank = buildNativeForgeRecipe({ prompt: "   ", kind: "prop" });
assert.equal(blank.name, "GENE asset");
assert.ok(blank.parts.length >= 3);
const mobile = buildNativeForgeRecipe({ prompt: "A delivery truck", kind: "vehicle", quality: "performance" });
assert.ok(mobile.parts.length <= 32);
const bounded = buildNativeForgeRecipe({ prompt: "A city environment", kind: "environment", quality: "unknown-quality" });
assert.ok(bounded.parts.length <= 54);
const highRise = buildNativeForgeRecipe({ prompt: "A glass office tower", kind: "building", quality: "high" });
assert.ok(highRise.parts.length > buildNativeForgeRecipe({ prompt: "A glass office tower", kind: "building", quality: "performance" }).parts.length);
assert.match(buildNativeForgeRecipe({ prompt: "A voxel city", kind: "environment" }).style, /voxel/i);
assert.throws(() => buildNativeForgeRecipe({ prompt: "weapon asset", kind: "weapon" }), /does not generate weapon assets/i);
console.log("Native Forge preset tests passed.");
