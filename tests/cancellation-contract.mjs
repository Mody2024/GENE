import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../apps/web/app/page.tsx", import.meta.url), "utf8");
const runStart = source.indexOf("const runAgent = useCallback");
const runEnd = source.indexOf("\n  useEffect(() => {\n    if (busy || buildInProgress", runStart);
assert.ok(runStart >= 0 && runEnd > runStart, "runAgent must be present");
const run = source.slice(runStart, runEnd);
const route = readFileSync(new URL("../apps/web/app/api/agent/route.ts", import.meta.url), "utf8");
const providers = readFileSync(new URL("../apps/web/app/lib/providers.ts", import.meta.url), "utf8");

assert.match(source, /activeRunControllers = useRef\(new Set<AbortController>\(\)\)/, "active runs need tracked AbortControllers");
assert.match(source, /const stopActiveRun = useCallback\(\(\) => \{[\s\S]*?controller\.abort\(\)/, "Stop must abort active runs");
assert.match(source, /pendingBuildRequests\.current = \[\]/, "Stop must clear queued requests");
assert.match(run, /const runFetch = \(input: RequestInfo \| URL, init\?: RequestInit\) => \{[\s\S]*?return fetch\(input, \{ \.\.\.init, signal: runController\.signal \}\)/, "all requests must share the active run AbortSignal");
assert.ok((run.match(/\brunFetch\(/g) || []).length >= 7, "every multi-stage request must use the cancellable fetch wrapper");
assert.match(run, /if \(runController\.signal\.aborted\) return/, "abort must not be reported as an AI failure");
assert.match(source, /function startNewProject\([\s\S]*?\{\n    stopActiveRun\(\)/, "starting a new project must cancel old work");
assert.match(source, /aria-label="Stop current AI work" onClick=\{stopActiveRun\}/, "the Stop action must be visible in the workspace");
assert.match(route, /AbortSignal\.any\(\[request\.signal, AbortSignal\.timeout/, "Gemini calls must combine client cancellation with bounded timeouts");
assert.ok(route.includes("signal: request.signal"), "alternate provider and review chains must receive client cancellation");
assert.match(providers, /options\.signal \? AbortSignal\.any\(\[options\.signal, AbortSignal\.timeout/, "alternate provider calls must abort their upstream HTTP requests");
assert.match(providers, /if \(options\.signal\?\.aborted\) throw/, "provider retries must stop instead of swallowing cancellation");

console.log("GENE cancellation contract tests passed (Stop, queue clearing, request abort, new-project isolation).");
