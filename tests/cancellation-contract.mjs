import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../apps/web/app/page.tsx", import.meta.url), "utf8");
const runStart = source.indexOf("const runAgent = useCallback");
const runEnd = source.indexOf("\n  useEffect(() => {\n    if (busy || buildInProgress", runStart);
assert.ok(runStart >= 0 && runEnd > runStart, "runAgent must be present");
const run = source.slice(runStart, runEnd);

assert.match(source, /activeRunControllers = useRef\(new Set<AbortController>\(\)\)/, "active runs need tracked AbortControllers");
assert.match(source, /const stopActiveRun = useCallback\(\(\) => \{[\s\S]*?controller\.abort\(\)/, "Stop must abort active runs");
assert.match(source, /pendingBuildRequests\.current = \[\]/, "Stop must clear queued requests");
assert.match(source, /signal: runController\.signal/g, "provider and helper requests must receive cancellation signals");
assert.ok((run.match(/signal: runController\.signal/g) || []).length >= 5, "all multi-stage request families should be abortable");
assert.match(run, /if \(runController\.signal\.aborted\) throw new DOMException\("Run cancelled", "AbortError"\)/, "cancelled runs must not start new stages");
assert.match(run, /if \(runController\.signal\.aborted\) return/, "abort must not be reported as an AI failure");
assert.match(source, /function startNewProject\([\s\S]*?\{\n    stopActiveRun\(\)/, "starting a new project must cancel old work");
assert.match(source, /aria-label="Stop current AI work" onClick=\{stopActiveRun\}/, "the Stop action must be visible in the workspace");
console.log("GENE cancellation contract tests passed (Stop, queue clearing, request abort, new-project isolation).");
