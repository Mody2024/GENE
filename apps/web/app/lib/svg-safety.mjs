/**
 * Whitelist SVG sanitizer for AI-generated illustrations.
 *
 * Generated art is saved as assets/art/<name>.svg and later drawn through <img>/data URLs or inlined in
 * web apps, so it must contain only drawing primitives: no scripts, event handlers, foreign content,
 * external images or remote references. The SVG is REBUILT from an element/attribute whitelist rather
 * than patched with deny-list regexes.
 */

const ELEMENTS = new Set((
  "svg g defs linearGradient radialGradient stop path rect circle ellipse line polyline polygon text tspan clipPath mask pattern symbol use title desc " +
  "filter feGaussianBlur feOffset feBlend feColorMatrix feComposite feFlood feMerge feMergeNode feMorphology feTurbulence feDisplacementMap feDropShadow style"
).split(" ").map(name => name.toLowerCase()));

const MAX_BYTES = 120_000;
const MAX_ELEMENTS = 1_800;

function cleanStyle(value) {
  const lower = value.toLowerCase();
  if (/expression\s*\(|javascript:|@import|behavior\s*:|-moz-binding/.test(lower)) return null;
  if (/url\s*\(\s*["']?\s*(?!#)/.test(lower)) return null;
  return value;
}

function parseAttributes(raw) {
  const attrs = [];
  const pattern = /([A-Za-z_:][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let match;
  while ((match = pattern.exec(raw))) {
    const name = match[1];
    const value = match[3] !== undefined ? match[3] : match[4];
    attrs.push([name, value]);
  }
  return attrs;
}

function safeAttribute(name, value) {
  const lower = name.toLowerCase();
  if (lower.startsWith("on")) return null;
  if (lower === "href" || lower === "xlink:href") return /^\s*#[\w.-]+\s*$/.test(value) ? value.trim() : null;
  if (lower === "style") return cleanStyle(value);
  if (lower === "src" || lower === "action" || lower === "formaction") return null;
  if (/javascript:|data:text\/html|vbscript:/i.test(value)) return null;
  if (/url\s*\(\s*["']?\s*(?!#)/i.test(value)) return null;
  return value;
}

const escapeAttr = value => value.replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);)/gi, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/**
 * Returns { ok:true, svg, bytes, elements } or { ok:false, error }.
 * Accepts raw model output that may contain markdown fences or surrounding prose.
 */
export function sanitizeSvg(input) {
  let source = String(input || "");
  if (!source.trim()) return { ok: false, error: "The model returned no SVG." };
  const start = source.search(/<svg[\s>]/i);
  const end = source.toLowerCase().lastIndexOf("</svg>");
  if (start < 0 || end < 0 || end < start) return { ok: false, error: "No complete <svg> element was found." };
  source = source.slice(start, end + 6);
  source = source
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_whole, body) => body)
    .replace(/<\?[\s\S]*?\?>/g, "")
    .replace(/<!DOCTYPE[\s\S]*?>/gi, "")
    .replace(/<!ENTITY[\s\S]*?>/gi, "");
  if (source.length > MAX_BYTES) return { ok: false, error: "The SVG is larger than " + Math.round(MAX_BYTES / 1000) + " KB. Ask for a simpler illustration." };

  const tagPattern = /<(\/?)([A-Za-z][\w:-]*)([^>]*?)(\/?)>/g;
  let out = "";
  let cursor = 0;
  let elements = 0;
  let shapes = 0;
  let depth = 0;
  let skipDepth = 0; // >0 while inside a removed element's subtree
  const skipStack = [];
  let sawRoot = false;
  let match;
  while ((match = tagPattern.exec(source))) {
    const text = source.slice(cursor, match.index);
    cursor = match.index + match[0].length;
    const closing = match[1] === "/";
    const rawName = match[2];
    const name = rawName.toLowerCase();
    const selfClosing = match[4] === "/";
    const allowed = ELEMENTS.has(name);
    if (skipDepth > 0) {
      if (!selfClosing) {
        if (closing) skipDepth--;
        else skipDepth++;
      }
      continue;
    }
    if (!allowed) {
      if (!closing && !selfClosing) skipDepth = 1;
      continue;
    }
    // Text content is only meaningful inside text, tspan, title, desc and style.
    if (text.trim() && /(?:^|\s)(?:text|tspan|title|desc)\b/.test(skipStack.join(" ")) === false) {
      // handled below through the open-tag stack
    }
    if (closing) {
      out += text.replace(/[<>]/g, "") + "</" + rawName + ">";
      depth = Math.max(0, depth - 1);
      skipStack.pop();
      continue;
    }
    elements++;
    if (elements > MAX_ELEMENTS) return { ok: false, error: "The SVG has too many elements. Ask for a simpler illustration." };
    if (!sawRoot) {
      if (name !== "svg") return { ok: false, error: "The root element must be <svg>." };
      sawRoot = true;
    }
    if (/^(?:path|rect|circle|ellipse|line|polyline|polygon|text)$/.test(name)) shapes++;
    const attrs = parseAttributes(match[3]);
    let rebuilt = "<" + rawName;
    let hasXmlns = false;
    for (const [attrName, attrValue] of attrs) {
      if (attrName.toLowerCase() === "xmlns") hasXmlns = true;
      if (name === "style" && attrName.toLowerCase() === "type") continue;
      const safe = safeAttribute(attrName, attrValue);
      if (safe === null) continue;
      rebuilt += " " + attrName + "=\"" + escapeAttr(safe) + "\"";
    }
    if (name === "svg" && depth === 0) {
      if (!hasXmlns) rebuilt += " xmlns=\"http://www.w3.org/2000/svg\"";
      if (!attrs.some(([attrName]) => attrName.toLowerCase() === "viewbox")) {
        const width = Number((attrs.find(([attrName]) => attrName.toLowerCase() === "width") || [])[1]);
        const height = Number((attrs.find(([attrName]) => attrName.toLowerCase() === "height") || [])[1]);
        rebuilt += " viewBox=\"0 0 " + (Number.isFinite(width) && width > 0 ? width : 128) + " " + (Number.isFinite(height) && height > 0 ? height : 128) + "\"";
      }
    }
    rebuilt += selfClosing ? "/>" : ">";
    out += text.replace(/[<>]/g, "") + rebuilt;
    if (!selfClosing) { depth++; skipStack.push(name); }
  }
  // Content inside <style> must not smuggle remote loads.
  out = out.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (whole, css) => cleanStyle(css) === null ? "" : whole);
  if (!sawRoot || !/<\/svg>\s*$/i.test(out.trim())) return { ok: false, error: "The SVG was cut off or malformed." };
  if (shapes < 2) return { ok: false, error: "The SVG has almost no drawable shapes." };
  return { ok: true, svg: out.trim(), bytes: out.length, elements, shapes };
}

/** Safe asset file name: lowercase letters, digits, dash and underscore only. */
export function safeArtName(value, fallback = "art") {
  const cleaned = String(value || "").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return cleaned || fallback;
}
