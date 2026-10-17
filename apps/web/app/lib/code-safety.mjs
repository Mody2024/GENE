/**
 * GENE generated-code safety analysis.
 *
 * Runs on model-generated browser JavaScript BEFORE it is saved. It exists because
 * `new Function(source)` only proves syntax; it cannot see "hazards is undefined",
 * a variable that is declared but never initialised, or a name that is used outside
 * the scope that declares it.
 *
 * This is a conservative lexical analysis, not a full JavaScript parser. It:
 *   1. masks strings, comments, regex literals and template text (positions preserved),
 *   2. auto-repairs the single most common crash: a collection such as `let hazards;`
 *      that is later used as an array,
 *   3. reports identifiers that are used with a member access, index or call but are
 *      never declared anywhere in the project, or are declared only in a scope that
 *      does not contain the use.
 * Static analysis cannot prove a game works; the live preview + repair loop remains the
 * runtime safety net.
 */

const KEYWORDS = new Set((
  "break case catch class const continue debugger default delete do else enum export extends false finally for function " +
  "if import in instanceof let new null of return super switch this throw true try typeof var void while with yield await async " +
  "static get set undefined NaN Infinity arguments eval"
).split(" "));

const REGEX_KEYWORDS = new Set(["return", "typeof", "case", "do", "else", "in", "of", "delete", "void", "throw", "new", "yield", "await"]);
const CONTROL_WORDS = new Set(["if", "for", "while", "switch", "with"]);

const GLOBALS = new Set((
  "window self globalThis document console navigator location history screen performance localStorage sessionStorage indexedDB " +
  "Math JSON Date Object Array String Number Boolean Symbol BigInt Map Set WeakMap WeakSet WeakRef Promise Proxy Reflect Intl Error TypeError RangeError " +
  "SyntaxError ReferenceError EvalError URIError AggregateError RegExp Function ArrayBuffer SharedArrayBuffer DataView Atomics " +
  "Int8Array Uint8Array Uint8ClampedArray Int16Array Uint16Array Int32Array Uint32Array Float32Array Float64Array BigInt64Array BigUint64Array " +
  "parseInt parseFloat isNaN isFinite encodeURIComponent decodeURIComponent encodeURI decodeURI escape unescape structuredClone queueMicrotask " +
  "setTimeout clearTimeout setInterval clearInterval requestAnimationFrame cancelAnimationFrame requestIdleCallback cancelIdleCallback " +
  "alert confirm prompt fetch XMLHttpRequest FormData Headers Request Response URL URLSearchParams Blob File FileReader FileList " +
  "Image ImageData ImageBitmap createImageBitmap OffscreenCanvas Path2D DOMMatrix DOMPoint DOMRect Canvas CanvasRenderingContext2D HTMLCanvasElement " +
  "WebGLRenderingContext WebGL2RenderingContext WebGLBuffer WebGLProgram WebGLShader WebGLTexture " +
  "AudioContext webkitAudioContext OfflineAudioContext AudioBuffer AudioNode GainNode OscillatorNode Audio MediaRecorder SpeechSynthesis SpeechSynthesisUtterance " +
  "Event CustomEvent KeyboardEvent MouseEvent PointerEvent TouchEvent WheelEvent EventTarget AbortController AbortSignal MutationObserver ResizeObserver IntersectionObserver " +
  "Node Element HTMLElement HTMLInputElement HTMLButtonElement SVGElement DocumentFragment CSS getComputedStyle matchMedia innerWidth innerHeight devicePixelRatio " +
  "scrollX scrollY pageXOffset pageYOffset screenX screenY outerWidth outerHeight addEventListener removeEventListener dispatchEvent postMessage parent top frames opener " +
  "TextEncoder TextDecoder atob btoa crypto Worker SharedWorker BroadcastChannel MessageChannel Notification " +
  "GENE3D GENE_SCENE GeneModules GENE_AUDIO GENE_ART __GENE_ASSETS__ __GENE_ART_SVG__ " +
  "module exports require define"
).split(" "));

/** Replace strings, comments, regex literals and template text with spaces, keeping every position. */
export function maskSource(src) {
  const n = src.length;
  const out = new Array(n);
  const tpl = [];
  let i = 0;
  let braceDepth = 0;
  let lastSig = "";
  let lastWord = "";
  const blank = k => (src[k] === "\n" ? "\n" : " ");
  const regexAllowed = () => !lastSig || (lastWord ? REGEX_KEYWORDS.has(lastWord) : "(,=:[!&|?{};+-*%<>~^".includes(lastSig));
  const scanTemplateText = () => {
    while (i < n) {
      if (src[i] === "\\") {
        out[i] = " ";
        i++;
        if (i < n) { out[i] = blank(i); i++; }
        continue;
      }
      if (src[i] === "`") { out[i] = " "; i++; lastSig = "\""; lastWord = ""; return; }
      if (src[i] === "$" && src[i + 1] === "{") {
        out[i] = " "; out[i + 1] = " "; i += 2;
        tpl.push(braceDepth);
        braceDepth++;
        lastSig = "{"; lastWord = "";
        return;
      }
      out[i] = blank(i);
      i++;
    }
  };
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === "/" && d === "/") {
      while (i < n && src[i] !== "\n") { out[i] = " "; i++; }
      continue;
    }
    if (c === "/" && d === "*") {
      out[i] = " "; out[i + 1] = " "; i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) { out[i] = blank(i); i++; }
      if (i < n) { out[i] = " "; out[i + 1] = " "; i += 2; }
      continue;
    }
    if (c === "\"" || c === "'") {
      out[i] = " "; i++;
      while (i < n && src[i] !== c && src[i] !== "\n") {
        if (src[i] === "\\") {
          out[i] = " "; i++;
          if (i < n) { out[i] = blank(i); i++; }
          continue;
        }
        out[i] = " "; i++;
      }
      if (i < n && src[i] === c) { out[i] = " "; i++; }
      lastSig = "\""; lastWord = "";
      continue;
    }
    if (c === "`") {
      out[i] = " "; i++;
      scanTemplateText();
      continue;
    }
    if (c === "/" && regexAllowed()) {
      out[i] = " "; i++;
      let inClass = false;
      while (i < n && src[i] !== "\n") {
        if (src[i] === "\\") {
          out[i] = " "; i++;
          if (i < n) { out[i] = " "; i++; }
          continue;
        }
        if (src[i] === "[") inClass = true;
        else if (src[i] === "]") inClass = false;
        else if (src[i] === "/" && !inClass) break;
        out[i] = " "; i++;
      }
      if (i < n && src[i] === "/") { out[i] = " "; i++; }
      while (i < n && /[a-z]/i.test(src[i])) { out[i] = " "; i++; }
      lastSig = "\""; lastWord = "";
      continue;
    }
    if (/[A-Za-z0-9_$]/.test(c)) {
      let j = i;
      while (j < n && /[\w$]/.test(src[j])) j++;
      const word = src.slice(i, j);
      for (let k = i; k < j; k++) out[k] = src[k];
      lastWord = word; lastSig = word[word.length - 1];
      i = j;
      continue;
    }
    if (c === "{") braceDepth++;
    if (c === "}") {
      braceDepth--;
      if (tpl.length && braceDepth === tpl[tpl.length - 1]) {
        tpl.pop();
        out[i] = " "; i++;
        scanTemplateText();
        continue;
      }
    }
    out[i] = c;
    if (!/\s/.test(c)) { lastSig = c; lastWord = ""; }
    i++;
  }
  return out.join("");
}

const COLLECTION_BASES = [
  "hazards?", "enemies", "bullets", "particles", "platforms", "coins", "obstacles", "projectiles", "pickups", "powerups", "traps", "walls",
  "tiles", "items", "targets", "bricks", "stars", "effects", "lanes", "zombies", "monsters", "orbs", "gems", "spikes", "pipes", "blocks",
  "drops", "shots", "missiles", "explosions", "trails", "sparks", "rocks", "trees", "clouds", "checkpoints", "waves", "entities", "objects",
  "buildings", "cars", "trains", "barriers", "collectibles", "bosses", "powerUps", "decorations", "props", "floaters", "popups", "texts",
  "bombs", "lasers", "mines", "turrets", "towers", "units", "creeps", "balls", "paddles", "snakes", "segments", "fruits", "apples", "rings"
];
const COLLECTION_RE = new RegExp("^(?:\\w*?)(?:" + COLLECTION_BASES.join("|") + ")$", "i");
const ARRAY_USE = "(?:\\.(?:push|pop|shift|unshift|forEach|map|filter|some|every|find|findIndex|reduce|concat|slice|splice|includes|indexOf|length|sort|reverse|flat|fill)\\b|\\[)";

export function isCollectionName(name) {
  return COLLECTION_RE.test(name);
}

function lineOf(src, index) {
  let line = 1;
  for (let i = 0; i < index && i < src.length; i++) if (src[i] === "\n") line++;
  return line;
}

/**
 * Auto-repair: `let hazards;` / `var hazards = null;` where `hazards` is later used as an array becomes
 * `let hazards = [];`. This is the exact shape of the "hazards is undefined" crash. Returns repaired source.
 */
export function repairUninitializedCollections(src) {
  const masked = maskSource(src);
  const fixes = [];
  const declaration = /\b(let|var)\s+([A-Za-z_$][\w$]*(?:\s*=\s*(?:null|undefined))?(?:\s*,\s*[A-Za-z_$][\w$]*(?:\s*=\s*(?:null|undefined))?)*)\s*(?=[;\n])/g;
  const edits = [];
  let match;
  while ((match = declaration.exec(masked))) {
    const listStart = match.index + match[0].indexOf(match[2]);
    const declarator = /([A-Za-z_$][\w$]*)(\s*=\s*(?:null|undefined))?/g;
    let part;
    while ((part = declarator.exec(match[2]))) {
      const name = part[1];
      if (!COLLECTION_RE.test(name)) continue;
      const used = new RegExp("(?<![\\w$.])" + name.replace(/\$/g, "\\$") + "\\s*" + ARRAY_USE).test(masked);
      if (!used) continue;
      const start = listStart + part.index;
      edits.push({ start, end: start + part[0].length, replacement: name + " = []", name });
    }
  }
  if (!edits.length) return { source: src, fixes };
  edits.sort((a, b) => b.start - a.start);
  let result = src;
  for (const edit of edits) {
    result = result.slice(0, edit.start) + edit.replacement + result.slice(edit.end);
    fixes.push("Initialised collection '" + edit.name + "' with [] (it was declared without a value but used as an array).");
  }
  return { source: result, fixes: fixes.reverse() };
}

function matchingClose(masked, openIndex, open, close) {
  let depth = 0;
  for (let i = openIndex; i < masked.length; i++) {
    const c = masked[i];
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function nextSignificant(masked, from) {
  let i = from;
  while (i < masked.length && /\s/.test(masked[i])) i++;
  return i;
}

function prevSignificant(masked, from) {
  let i = from;
  while (i >= 0 && /\s/.test(masked[i])) i--;
  return i;
}

function wordBefore(masked, index) {
  let end = prevSignificant(masked, index - 1);
  if (end < 0) return "";
  let start = end;
  while (start >= 0 && /[\w$]/.test(masked[start])) start--;
  return masked.slice(start + 1, end + 1);
}

function analyzeFile(path, src) {
  const masked = maskSource(src);
  const n = masked.length;

  // Block pairs and function-body markers.
  const pairs = [];
  const stack = [];
  for (let i = 0; i < n; i++) {
    if (masked[i] === "{") stack.push(i);
    else if (masked[i] === "}" && stack.length) pairs.push([stack.pop(), i]);
  }
  while (stack.length) pairs.push([stack.pop(), n]);
  const pairByOpen = new Map(pairs.map(pair => [pair[0], pair]));
  const funcBodies = new Set();
  const innermost = (index, predicate) => {
    let best = null;
    for (const pair of pairs) {
      if (pair[0] < index && index < pair[1] && (!predicate || predicate(pair)) && (!best || pair[0] > best[0])) best = pair;
    }
    return best;
  };

  const globalNames = new Set();
  const declPos = new Set();
  const scoped = new Map();
  const declare = (name, range) => {
    if (!range) { globalNames.add(name); return; }
    if (!scoped.has(name)) scoped.set(name, []);
    scoped.get(name).push(range);
  };
  const identifiers = /(?<![\w$])[A-Za-z_$][\w$]*/g;

  // Function names and class names: treated as visible everywhere (hoisting + sloppy-mode block functions).
  for (const m of masked.matchAll(/\b(?:function\s*\*?|class)\s+([A-Za-z_$][\w$]*)/g)) globalNames.add(m[1]);

  // Parameter groups: functions, methods, arrows and catch clauses.
  for (let i = 0; i < n; i++) {
    if (masked[i] !== "(") continue;
    const close = matchingClose(masked, i, "(", ")");
    if (close < 0) continue;
    const after = nextSignificant(masked, close + 1);
    const before = wordBefore(masked, i);
    let range = null;
    let isFunction = false;
    if (masked.startsWith("=>", after)) {
      isFunction = true;
      const bodyStart = nextSignificant(masked, after + 2);
      if (masked[bodyStart] === "{" && pairByOpen.has(bodyStart)) { funcBodies.add(bodyStart); range = pairByOpen.get(bodyStart); }
      else range = innermost(i);
    } else if (masked[after] === "{" && !CONTROL_WORDS.has(before) && pairByOpen.has(after)) {
      isFunction = true;
      funcBodies.add(after);
      range = pairByOpen.get(after);
      if (before && !KEYWORDS.has(before)) globalNames.add(before); // method or function name
    }
    if (!isFunction) continue;
    const inside = masked.slice(i + 1, close);
    for (const m of inside.matchAll(identifiers)) if (!KEYWORDS.has(m[0])) { declare(m[0], range); declPos.add(i + 1 + m.index); }
  }
  for (const m of masked.matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)\s*=>/g)) {
    const after = nextSignificant(masked, m.index + m[0].length);
    const range = masked[after] === "{" && pairByOpen.has(after) ? pairByOpen.get(after) : innermost(m.index);
    if (masked[after] === "{") funcBodies.add(after);
    declare(m[1], range);
  }

  // let / const / var declarations, including destructuring and comma lists.
  for (const m of masked.matchAll(/(?<![\w$.])(let|const|var)\b/g)) {
    const keyword = m[1];
    const range = keyword === "var"
      ? innermost(m.index, pair => funcBodies.has(pair[0]))
      : innermost(m.index);
    let i = m.index + m[0].length;
    let depth = 0;
    let expectTarget = true;
    while (i < n) {
      const c = masked[i];
      if (depth === 0 && c === ";") break;
      if (expectTarget && (c === "{" || c === "[")) {
        const close = matchingClose(masked, i, c, c === "{" ? "}" : "]");
        if (close < 0) break;
        for (const id of masked.slice(i + 1, close).matchAll(identifiers)) if (!KEYWORDS.has(id[0])) { declare(id[0], range); declPos.add(i + 1 + id.index); }
        i = close + 1;
        expectTarget = false;
        continue;
      }
      if (c === "(" || c === "[" || c === "{") { depth++; i++; continue; }
      if (c === ")" || c === "]" || c === "}") {
        if (depth === 0) break;
        depth--; i++; continue;
      }
      if (depth === 0 && c === ",") { expectTarget = true; i++; continue; }
      if (expectTarget && /[A-Za-z_$]/.test(c)) {
        let j = i;
        while (j < n && /[\w$]/.test(masked[j])) j++;
        const name = masked.slice(i, j);
        if (!KEYWORDS.has(name)) { declare(name, range); declPos.add(i); }
        expectTarget = false;
        i = j;
        continue;
      }
      if (depth === 0 && /[A-Za-z_$]/.test(c) && !/[\w$]/.test(masked[i - 1] || " ")) {
        let j = i;
        while (j < n && /[\w$]/.test(masked[j])) j++;
        const word = masked.slice(i, j);
        if (word === "of" || word === "in") break;
        i = j;
        continue;
      }
      i++;
    }
  }

  // Implicit globals and window.X assignments are valid in classic scripts.
  for (const m of masked.matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)\s*=(?![=>])/g)) if (!KEYWORDS.has(m[1]) && !declPos.has(m.index)) globalNames.add(m[1]);
  for (const m of masked.matchAll(/\b(?:window|globalThis|self)\s*\.\s*([A-Za-z_$][\w$]*)\s*=(?!=)/g)) globalNames.add(m[1]);

  // Uses.
  const uses = [];
  for (const m of masked.matchAll(identifiers)) {
    const name = m[0];
    if (KEYWORDS.has(name)) continue;
    const start = m.index;
    const end = start + name.length;
    const prev = prevSignificant(masked, start - 1);
    const prevChar = prev >= 0 ? masked[prev] : "";
    if (prevChar === "." && !(prev >= 2 && masked[prev - 1] === "." && masked[prev - 2] === ".")) continue; // property access
    const nextIndex = nextSignificant(masked, end);
    const nextChar = masked[nextIndex] || "";
    if (nextChar === ":" && (prevChar === "{" || prevChar === ",")) continue; // object key
    if (wordBefore(masked, start) === "typeof") continue;
    const memberLike = nextChar === "." || nextChar === "[" || nextChar === "(" || (nextChar === "?" && masked[nextIndex + 1] === ".");
    uses.push({ name, index: start, memberLike });
  }
  return { path, src, globalNames, scoped, uses };
}

/**
 * Analyse a whole set of project files. Only call the scope checks with the COMPLETE project;
 * a partial file list would make cross-file globals look undeclared.
 */
export function analyzeProjectScripts(files, options = {}) {
  const jsFiles = files.filter(file => /\.m?js$/i.test(file.path) && typeof file.content === "string");
  const repaired = [];
  const fixes = [];
  for (const file of jsFiles) {
    const result = repairUninitializedCollections(file.content);
    if (result.fixes.length) {
      repaired.push({ path: file.path, content: result.source });
      for (const fix of result.fixes) fixes.push(file.path + ": " + fix);
    }
  }
  const repairedByPath = new Map(repaired.map(file => [file.path, file.content]));
  const errors = [];
  if (options.scopeChecks !== false) {
    const analyses = jsFiles.map(file => analyzeFile(file.path, repairedByPath.get(file.path) ?? file.content));
    const projectGlobals = new Set(GLOBALS);
    for (const analysis of analyses) for (const name of analysis.globalNames) projectGlobals.add(name);
    const seen = new Set();
    for (const analysis of analyses) {
      for (const use of analysis.uses) {
        if (!use.memberLike) continue;
        if (projectGlobals.has(use.name) || /^(?:Gene|GENE|__GENE)/.test(use.name)) continue;
        const ranges = analysis.scoped.get(use.name);
        if (ranges && ranges.some(range => range[0] <= use.index && use.index <= range[1])) continue;
        const kind = ranges ? "outside the scope that declares it" : "never declared";
        const key = analysis.path + ":" + use.name + ":" + kind;
        if (seen.has(key)) continue;
        seen.add(key);
        errors.push({
          path: analysis.path,
          name: use.name,
          line: lineOf(analysis.src, use.index),
          kind: ranges ? "out-of-scope" : "undeclared",
          message: analysis.path + ":" + lineOf(analysis.src, use.index) + " '" + use.name + "' is used but " + kind +
            ". Declare and initialise it (for example const " + use.name + " = [];) at the top of the script before any function reads it."
        });
        if (errors.length >= 8) break;
      }
      if (errors.length >= 8) break;
    }
  }
  return { repaired, fixes, errors };
}
