import assert from "node:assert/strict";
import { classifyFailure, backoffMs, retryDecision, sanitizeFailureDetail, retryGuidance, repairTargetsFor } from "../apps/web/app/lib/error-recovery.mjs";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");
const research = read("apps/web/app/api/research/route.ts");
const agent = read("apps/web/app/api/agent/route.ts");
const page = read("apps/web/app/page.tsx");
const live = read("apps/web/app/components/LiveRunPanel.tsx");
const recovery = read("apps/web/app/lib/error-recovery.mjs");

assert.match(research, /body\?\.images !== false/, "visual research should run by default unless explicitly disabled");
assert.match(research, /planVisualReferenceQueries/, "visual research must query distinct design categories");
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

assert.equal(classifyFailure("invalid api key", "", 503).kind, "config", "permanent key failures must outrank generic server status");
assert.equal(classifyFailure("provider says unavailable", "", 401).retryable, false, "401 must never be automatically retried");
assert.equal(classifyFailure("anything", "", 429).kind, "rate-limit", "HTTP status must classify rate limits");
assert.equal(classifyFailure("anything", "", 504).kind, "timeout", "HTTP gateway timeouts must classify as timeouts");
assert.equal(classifyFailure("anything", "", 409).kind, "conflict", "HTTP conflicts must be detected");
assert.equal(classifyFailure("unknown failure", "", 400).retryable, false, "unknown client errors must not trigger unsafe retries");
assert.equal(retryDecision("temporary unavailable", "", 503, 0, 3).retry, true, "transient failures should retry within budget");
assert.equal(retryDecision("temporary unavailable", "", 503, 3, 3).retry, false, "retry budget must stop retries");
assert.equal(retryDecision("invalid api key", "", 401, 0, 3).retry, false, "configuration errors must not retry");
assert.equal(retryDecision("rate limit", "", 429, 0, 3).delayMs, backoffMs("rate-limit", 1), "retry decisions must expose their backoff delay");
assert.match(sanitizeFailureDetail("key=AIzaABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890"), /redacted/i, "credential-like values must be redacted");
assert.ok(sanitizeFailureDetail("x".repeat(2000)).length <= 800, "failure detail must be bounded");
assert.match(retryGuidance("config", "invalid api key", 1), /Do not retry this provider automatically/i, "configuration failures must guide away from retry loops");
assert.deepEqual(repairTargetsFor("apps/web/app/page.tsx crashed", ["apps/web/app/page.tsx", "game.js"]), ["apps/web/app/page.tsx"], "explicit file paths must take priority for repair");

console.log("GENE reliability, interview, research, Forge visibility, and recovery contracts passed.");
