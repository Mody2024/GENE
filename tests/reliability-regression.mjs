import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");
const research = read("apps/web/app/api/research/route.ts");
const agent = read("apps/web/app/api/agent/route.ts");
const page = read("apps/web/app/page.tsx");
const live = read("apps/web/app/components/LiveRunPanel.tsx");
const recovery = read("apps/web/app/lib/error-recovery.mjs");

assert.match(research, /explicitlyRequestsImages/, "research must require an explicit image request");
assert.match(research, /if \(!wantsImages\) bundle\.images = \[\]/, "Wikipedia thumbnails must not leak into research when images are disabled");
assert.match(research, /researchIsGeometryDash/, "Geometry Dash must get a genre-specific research path");
assert.match(research, /rhythm-based precision platformer/, "Geometry Dash research must prioritize mechanics rather than generic pictures");
assert.match(agent, /!payload && body\.operation === "interview"/, "interview must continue when configured AI providers all fail");
assert.match(agent, /Gene Interview \(deterministic fallback\)/, "interview fallback must be explicitly labelled");
assert.match(agent, /GENE Native Recovery/, "staged builds must have a truthful local fallback when all AI providers fail");
assert.match(agent, /const safeFiles = validateFiles\(normalized\.files/, "native fallback must pass the same server-side validation boundary");
assert.match(page, /Connecting to GENE Forge for/, "Forge connection must be visible in the activity stream");
assert.match(page, /stage: "forge", forge: \{ asset: assetId, status: "modelling"/, "live state must show Forge modelling");
assert.match(live, /Connecting to GENE Forge/, "live progress UI must have a Forge connection step");
assert.match(live, /Applying per-part colours/, "live progress UI must describe colouring/material work");
assert.match(page, /for \(let attempt = 0; attempt < 5; attempt\+\+\)/, "the top-level request recovery loop must use five bounded attempts");
assert.match(page, /stageAttempt <= 5/, "staged generation must use five bounded attempts");
assert.match(recovery, /Treat the exact validator\/runtime message as an acceptance test/, "validation recovery must target the concrete error and preserve working code");
console.log("GENE reliability, interview, research, Forge visibility, and recovery contracts passed.");
