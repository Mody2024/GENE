import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const page = readFileSync(new URL("../apps/web/app/page.tsx", import.meta.url), "utf8");
assert.match(page, /const persistRun = \(run: BuildRun, previewStatus: "booting" \| "stale" \| "error"/, "source validation/build checkpoints cannot set gameplay-verified status");
assert.match(page, /livingPreview: \{ status: previewStatus[\s\S]{0,260}canContinuePlaying: false/, "a build checkpoint must not claim the game is playable before runtime verification");
assert.match(page, /livingPreview: \{ status: "rendered"[\s\S]{0,260}Verify player controls, interaction, and the core gameplay loop/, "a visible render is explicitly not the same as verified gameplay");
assert.match(page, /state === "rendered"/, "runtime render telemetry remains the separate preview-state transition");
console.log("Runtime verification contract passed (build/source checks cannot masquerade as gameplay verification).");
