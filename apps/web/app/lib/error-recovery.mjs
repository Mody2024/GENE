/**
 * Central failure classification for GENE.
 *
 * One ordered rule table decides, for any provider/validation/runtime/network failure:
 *   - what kind of failure it is,
 *   - whether an automatic retry is sensible and how long to wait,
 *   - whether GENE can fix it itself by repairing source ("auto-fix"),
 *   - a short, human headline.
 * It also maps a validation failure to the file(s) that must be repaired. Pure and dependency-free.
 */

const RULES = [
  { kind: "config", re: /KEY_REJECTED|NOT_CONFIGURED|invalid api key|unauthorized|\b40[13]\b/i, retryable: false, autoFix: false, title: "An AI provider key or account setting needs attention" },
  { kind: "provider-unavailable", re: /CREDITS_OR_PAID_ROUTE|insufficient credits|not enough credits|payment required|paid route/i, retryable: false, autoFix: false, title: "No free AI model was available for this request" },
  { kind: "rate-limit", re: /RATE_LIMIT|rate.?limit|resource_exhausted|quota exceeded|\b429\b/i, retryable: true, autoFix: false, title: "An AI provider is rate limited" },
  { kind: "provider-busy", re: /CAPACITY_BUSY|overloaded|high demand|temporarily unavailable|\b503\b|OPENROUTER_FALLBACK_FAILED|GEMINI_API_ERROR/i, retryable: true, autoFix: false, title: "The AI service is busy" },
  { kind: "timeout", re: /timeout|timed out|ETIMEDOUT|\b504\b/i, retryable: true, autoFix: false, title: "The AI request took too long" },
  { kind: "network", re: /failed to fetch|networkerror|network request failed|offline|connection lost|ECONNRESET/i, retryable: true, autoFix: false, title: "The connection to GENE's server dropped" },
  { kind: "bad-output", re: /OUTPUT_TRUNCATED|OUTPUT_INVALID|output limit|malformed JSON|Unexpected token|Unexpected end of JSON/i, retryable: true, autoFix: false, title: "The AI reply was incomplete" },
  { kind: "conflict", re: /discarded this stale result|conflicting files|stale or missing/i, retryable: true, autoFix: false, title: "The project changed while the request was running" },
  { kind: "validation", re: /GENE_VALIDATION_FAILED|GENE_STAGED_BUILD_VALIDATION_FAILED|Build rejected|did not pass final validation|would crash at runtime|unsafe project path/i, retryable: true, autoFix: true, title: "GENE rejected the change to protect your project" },
  { kind: "runtime", re: /runtime error|ReferenceError|TypeError|SyntaxError|is not defined|Cannot read propert|is not a function|render not yet confirmed/i, retryable: true, autoFix: true, title: "The game hit an error while running" }
];

/** Classify a failure from its message, error code and optional HTTP status. */
export function classifyFailure(message, code, status) {
  const text = (String(message || "") + " " + String(code || "")).trim();
  for (const rule of RULES) if (rule.re.test(text)) return { kind: rule.kind, retryable: rule.retryable, autoFix: rule.autoFix, title: rule.title };
  const http = Number(status) || 0;
  if (http === 429) return { kind: "rate-limit", retryable: true, autoFix: false, title: RULES[2].title };
  if (http >= 500) return { kind: "provider-busy", retryable: true, autoFix: false, title: RULES[3].title };
  return { kind: "unknown", retryable: false, autoFix: false, title: "Something went wrong" };
}

/** Delay before retry number `attempt` (1-based: the wait before the 2nd request is attempt 1). */
export function backoffMs(kind, attempt) {
  const step = Math.max(1, Math.min(4, Number(attempt) || 1));
  if (kind === "rate-limit") return 4000 * step;
  if (kind === "provider-busy" || kind === "timeout") return 1500 * step;
  if (kind === "network") return 1000 * step;
  return 500 * step;
}

/** Extra instruction for the model that explains exactly what went wrong last time and how to change approach. */
export function retryGuidance(kind, failure, attempt) {
  const detail = String(failure || "").replace(/\s+/g, " ").trim().slice(0, 800);
  const because = detail ? " The previous attempt failed with: " + detail + "." : "";
  if (kind === "validation" || kind === "runtime") return " FIX THE REJECTED RESULT:" + because + " Correct exactly that problem, keep everything that already works, and re-check every referenced file, id and function before returning.";
  if (kind === "bad-output" || kind === "timeout") return " The previous reply was incomplete or too slow." + because + " Return a smaller but complete implementation with valid JSON.";
  if (kind === "conflict") return " The project changed while you were working. Re-read the current files and apply the change to the latest source." + because;
  return because;
}

/**
 * Which file(s) to repair for a failed final validation. Audio is a cross-file contract (code + spec),
 * so it repairs both. A path named in the message always wins.
 */
export function repairTargetsFor(message, stagePaths = []) {
  const text = String(message || "");
  const named = stagePaths.find(path => text.includes(path));
  if (named) return [named];
  if (/audio|sound|music|sfx|volume|mute|sound effect/i.test(text)) return ["game.js", "game-spec.json"];
  if (/input handlers|no keyboard.*touch.*controller|event handlers.*found/i.test(text)) return ["game.js"];
  if (/spec|title|engine|mechanic|objective|win condition|loss condition|performance budget|genre|controls/i.test(text)) return ["game-spec.json"];
  if (/html|canvas|script|semantic|markup/i.test(text)) return ["game.html"];
  if (/css|style|layout/i.test(text)) return ["game.css"];
  return ["game.js"];
}
