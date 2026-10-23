import assert from "node:assert/strict";
import { analyzeForgeRecipe } from "../apps/web/lib/forge-quality.mjs";

const part = (name, position = [0, 0.5, 0], extra = {}) => ({
  name, shape: "box", position, scale: [1, 1, 1], rotation: [0, 0, 0],
  color: "#aabbcc", surface: "matte", ...extra
});
const clean = analyzeForgeRecipe({ parts: [part("base")] });
assert.equal(clean.scope, "structural-only");
assert.equal(clean.status, "structurally-clean");
assert.equal(clean.partCount, 1);
assert.equal(clean.estimatedTriangles, 12);
assert.deepEqual(clean.bounds.size, [1, 1, 1]);
assert.equal(clean.warnings.length, 0);

const duplicates = analyzeForgeRecipe({ parts: [
  part("wheel"), part("wheel"), part("wheel", [3, 0.5, 0])
] });
assert.ok(duplicates.warnings.some(w => w.code === "DUPLICATE_PART_NAMES"));
assert.ok(duplicates.warnings.some(w => w.code === "IDENTICAL_PARTS"));
assert.equal(duplicates.status, "review-recommended");

const floating = analyzeForgeRecipe({ parts: [part("floating", [0, 4, 0])] });
assert.ok(floating.warnings.some(w => w.code === "POSSIBLE_FLOATING_ASSET"));
const oversized = analyzeForgeRecipe({ parts: [part("long", [0, 0.5, 0], { scale: [40, 1, 1] })] });
assert.ok(oversized.warnings.some(w => w.code === "LARGE_WORLD_BOUNDS"));

const rotated = analyzeForgeRecipe({ parts: [
  part("beam", [0, 0.5, 0], { scale: [4, 0.2, 0.2], rotation: [0, 0, 45] })
] });
assert.ok(rotated.bounds.size[0] > 2.8, "bounds should account for rotation");
assert.ok(rotated.bounds.size[1] > 2.8, "rotated beam should expand its world-space bounds");

const palette = analyzeForgeRecipe({ parts: Array.from({ length: 14 }, (_, i) =>
  part("color-" + i, [i * 0.5, 0.5, 0], { color: "#" + i.toString(16).padStart(6, "0") })
) });
assert.ok(palette.warnings.some(w => w.code === "PALETTE_FRAGMENTATION"));
assert.ok(palette.score >= 0 && palette.score <= 100);
console.log("Forge structural QA tests passed (bounds, rotation, duplicates, palette, and honest QA scope).");

const empty = analyzeForgeRecipe({ parts: [] });
assert.equal(empty.status, "invalid", "an empty recipe must not be reported as a clean asset");
assert.ok(empty.warnings.some(w => w.code === "EMPTY_ASSET"));
const malformed = analyzeForgeRecipe({ parts: [
  part("bad-shape", [0, 0.5, 0], { shape: "magicMesh" }),
  part("bad-transform", [0, 0.5], { scale: [1, 1, 1] }),
  part("zero-scale", [0, 0.5, 0], { scale: [1, 0, 1] })
] });
assert.equal(malformed.status, "invalid", "unknown shapes and unusable transforms must fail structural QA");
assert.ok(malformed.warnings.some(w => w.code === "UNSUPPORTED_SHAPE"));
assert.ok(malformed.warnings.some(w => w.code === "INVALID_TRANSFORM"));
assert.ok(malformed.warnings.some(w => w.code === "DEGENERATE_SCALE"));
assert.ok(malformed.score < 100, "structural errors must affect the quality score");
