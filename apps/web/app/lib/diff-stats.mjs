/**
 * Real line-level change statistics between two project snapshots.
 * Used to show the user exactly which files an edit touched and how many lines were added/removed.
 * Pure and dependency-free. Exact (LCS-based) for normal files, with a safe multiset fallback for huge ones.
 */

function splitLines(text) {
  const value = String(text ?? "").replace(/\r?\n$/, "");
  return value === "" ? [] : value.split(/\r?\n/);
}

/** Added/removed line counts between two strings. */
export function diffLines(before, after) {
  const a = splitLines(before);
  const b = splitLines(after);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA -= 1; endB -= 1; }
  const x = a.slice(start, endA);
  const y = b.slice(start, endB);
  if (!x.length || !y.length) return { added: y.length, removed: x.length };
  if (x.length * y.length > 4_000_000) {
    // Too large for an exact LCS: compare as multisets (order-insensitive, still a sound lower bound on changes).
    const counts = new Map();
    for (const line of x) counts.set(line, (counts.get(line) || 0) + 1);
    let common = 0;
    for (const line of y) {
      const left = counts.get(line) || 0;
      if (left > 0) { counts.set(line, left - 1); common += 1; }
    }
    return { added: y.length - common, removed: x.length - common };
  }
  let previous = new Uint32Array(y.length + 1);
  let current = new Uint32Array(y.length + 1);
  for (let i = 1; i <= x.length; i += 1) {
    for (let j = 1; j <= y.length; j += 1) {
      current[j] = x[i - 1] === y[j - 1] ? previous[j - 1] + 1 : Math.max(previous[j], current[j - 1]);
    }
    const swap = previous; previous = current; current = swap;
    current.fill(0);
  }
  const lcs = previous[y.length];
  return { added: y.length - lcs, removed: x.length - lcs };
}

/**
 * Summarise what changed between two {path: content} maps.
 * `paths` limits the report to files the request touched; without it every differing path is reported.
 */
export function summarizeChanges(before, after, paths) {
  const old = before && typeof before === "object" ? before : {};
  const next = after && typeof after === "object" ? after : {};
  const candidates = Array.isArray(paths) && paths.length ? Array.from(new Set(paths)) : Array.from(new Set([...Object.keys(old), ...Object.keys(next)]));
  const changes = [];
  for (const path of candidates.sort()) {
    const had = Object.prototype.hasOwnProperty.call(old, path);
    const has = Object.prototype.hasOwnProperty.call(next, path);
    if (!had && !has) continue;
    if (had && has && old[path] === next[path]) continue;
    const status = !had ? "added" : !has ? "removed" : "modified";
    const stats = diffLines(had ? old[path] : "", has ? next[path] : "");
    changes.push({ path, status, added: stats.added, removed: stats.removed });
  }
  return changes;
}

/** Short human text such as "game.js +34 −8 · game.css +4". */
export function describeChanges(changes, limit = 4) {
  if (!Array.isArray(changes) || !changes.length) return "";
  const parts = changes.slice(0, limit).map(change => change.path + " " + (change.status === "removed" ? "removed" : "+" + change.added + " −" + change.removed));
  return parts.join(" · ") + (changes.length > limit ? " · +" + (changes.length - limit) + " more" : "");
}
