const PALETTES = {
  city: ["#d7c6a5", "#b9c0c5", "#e7e1d3", "#4b6574", "#343d46", "#6e9b88"],
  character: ["#e9d9bd", "#3d5368", "#a7b7ad", "#d7a86e", "#4a4240", "#e5e7eb"],
  nature: ["#587b55", "#86a96f", "#a7bb8c", "#74624c", "#d5bd8b", "#4d6a4c"],
  ui: ["#f4f0e8", "#d8d0c2", "#34434b", "#6e9b88", "#d7a86e", "#ffffff"]
};
const esc = value => String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[char]));
const safeKind = new Set(["character", "tileset", "ui", "background", "icon"]);
const safeQuality = new Set(["performance", "standard", "high"]);
function paletteFor(kind, prompt) {
  const text = prompt.toLowerCase();
  if (/forest|nature|grass|tree/.test(text)) return PALETTES.nature;
  if (/city|street|urban|building|road/.test(text)) return PALETTES.city;
  if (kind === "ui" || kind === "icon") return PALETTES.ui;
  return PALETTES.character;
}
function characterSvg(p) {
  const bone = /skeleton|bone|undead/.test(p.prompt.toLowerCase()) ? "#e8e1ce" : p.colors[0];
  const clothes = p.colors[1], accent = p.colors[3], dark = "#34383b";
  const frames = [];
  for (let i = 0; i < 4; i++) {
    const swing = [0, 1, 0, -1][i] * 7;
    const x = i * 128;
    frames.push(`<g transform="translate(${x} 0)">
      <ellipse cx="64" cy="115" rx="24" ry="5" fill="#000000" opacity=".13"/>
      <path d="M53 79 L48 ${103+swing} L56 ${103+swing} L64 83 M75 79 L80 ${103-swing} L72 ${103-swing} L64 83" fill="none" stroke="${bone}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M52 51 Q64 45 76 51 L81 78 Q64 87 47 78 Z" fill="${clothes}" stroke="${dark}" stroke-width="2"/>
      <path d="M52 55 L42 ${72+swing} M76 55 L86 ${72-swing}" stroke="${bone}" stroke-width="7" stroke-linecap="round"/>
      <circle cx="64" cy="32" r="17" fill="${bone}" stroke="${dark}" stroke-width="2"/>
      <circle cx="58" cy="31" r="2.5" fill="${dark}"/><circle cx="70" cy="31" r="2.5" fill="${dark}"/>
      <path d="M58 39 Q64 43 70 39" fill="none" stroke="${dark}" stroke-width="2" stroke-linecap="round"/>
      <path d="M52 60 L76 60" stroke="${accent}" stroke-width="4" stroke-linecap="round"/>
      <path d="M47 ${103+swing} l-2 5 h15 l-2-5 M80 ${103-swing} l-2 5 h15 l-2-5" fill="${dark}"/>
    </g>`);
  }
  return { width: 512, height: 128, viewBox: "0 0 512 128", body: frames.join(""), frameWidth: 128, frameHeight: 128, frames: 4, frameNames: ["idle", "walk-left", "walk-center", "walk-right"] };
}
function tilesetSvg(p) {
  const c = p.colors, text = p.prompt.toLowerCase();
  const tile = 96, items = [];
  const isCity = /city|street|road|urban/.test(text);
  const ground = isCity ? c[1] : c[5], detail = isCity ? c[4] : c[2];
  items.push(`<g transform="translate(0 0)"><rect width="96" height="96" fill="${ground}"/><path d="M0 72 L96 72" stroke="${detail}" stroke-width="3"/><path d="M16 0 V96 M80 0 V96" stroke="${detail}" stroke-width="2" opacity=".45"/><circle cx="22" cy="24" r="3" fill="${c[3]}"/><circle cx="68" cy="48" r="2" fill="${c[3]}"/></g>`);
  items.push(`<g transform="translate(96 0)"><rect width="96" height="96" fill="${isCity ? "#555b60" : c[0]}"/><path d="M0 48 H96" stroke="${isCity ? "#f4e7b0" : c[3]}" stroke-width="4" stroke-dasharray="13 9"/><path d="M0 3 H96 M0 93 H96" stroke="#ffffff" stroke-width="3" opacity=".65"/></g>`);
  items.push(`<g transform="translate(192 0)"><rect width="96" height="96" fill="${c[0]}"/><path d="M0 0 H96 V96 H0 Z" fill="none" stroke="${detail}" stroke-width="6"/><path d="M0 32 H96 M0 64 H96 M32 0 V96 M64 0 V96" stroke="${detail}" stroke-width="2" opacity=".6"/></g>`);
  items.push(`<g transform="translate(288 0)"><rect width="96" height="96" fill="${c[2]}"/><path d="M0 16 H96 M0 48 H96 M0 80 H96" stroke="${c[1]}" stroke-width="4"/><path d="M20 0 V96 M52 0 V96 M84 0 V96" stroke="${detail}" stroke-width="3" opacity=".6"/></g>`);
  return { width: 384, height: 96, viewBox: "0 0 384 96", body: items.join(""), frameWidth: tile, frameHeight: tile, frames: 4, frameNames: ["ground", "road", "wall", "sidewalk"] };
}
function uiSvg(p) {
  const c = p.colors;
  return { width: 512, height: 192, viewBox: "0 0 512 192", frameWidth: 160, frameHeight: 56, frames: 3, frameNames: ["panel", "button", "button-hover"], body:
    `<g transform="translate(8 8)"><rect width="152" height="176" rx="16" fill="${c[0]}" stroke="${c[2]}" stroke-width="4"/><rect x="12" y="12" width="128" height="26" rx="7" fill="${c[3]}"/><rect x="12" y="48" width="128" height="8" rx="4" fill="${c[1]}"/><rect x="12" y="64" width="90" height="8" rx="4" fill="${c[1]}"/><rect x="12" y="88" width="128" height="48" rx="10" fill="${c[2]}"/><rect x="12" y="144" width="128" height="20" rx="6" fill="${c[3]}"/></g>
    <g transform="translate(184 24)"><rect width="144" height="56" rx="12" fill="${c[3]}" stroke="${c[2]}" stroke-width="3"/><path d="M22 28 H122" stroke="${c[5]}" stroke-width="4" stroke-linecap="round"/></g>
    <g transform="translate(352 24)"><rect width="144" height="56" rx="12" fill="${c[4]}" stroke="${c[2]}" stroke-width="3"/><path d="M22 28 H122" stroke="${c[5]}" stroke-width="4" stroke-linecap="round"/></g>` };
}
function backgroundSvg(p) {
  const c = p.colors, text = p.prompt.toLowerCase(), night = /night|dark|evening/.test(text);
  const sky = night ? "#263849" : "#b9d8df", ground = /forest|nature/.test(text) ? "#587b55" : "#d4d0c5";
  const buildings = [];
  for (let i = 0; i < 10; i++) {
    const x = i * 52, h = 42 + ((i * 29) % 78);
    buildings.push(`<rect x="${x}" y="${150-h}" width="46" height="${h}" fill="${c[i%5]}" opacity=".9"/>`);
    for (let y = 160-h; y < 145; y += 18) buildings.push(`<rect x="${x+8}" y="${y}" width="7" height="9" fill="${night ? "#f3d78b" : "#e8e6dc"}" opacity=".8"/>`);
  }
  return { width: 512, height: 192, viewBox: "0 0 512 192", frameWidth: 512, frameHeight: 192, frames: 1, frameNames: ["background"], body: `<rect width="512" height="192" fill="${sky}"/><circle cx="420" cy="34" r="18" fill="${night ? "#e8e1ce" : "#f5d28b"}"/><path d="M0 105 Q110 64 210 104 T512 95 V192 H0 Z" fill="${night ? "#344f56" : "#91b9a0"}"/>${buildings.join("")}<rect y="150" width="512" height="42" fill="${ground}"/>` };
}
function iconSvg(p) {
  const c = p.colors;
  return { width: 128, height: 128, viewBox: "0 0 128 128", frameWidth: 128, frameHeight: 128, frames: 1, frameNames: ["icon"], body: `<rect x="5" y="5" width="118" height="118" rx="28" fill="${c[0]}" stroke="${c[2]}" stroke-width="5"/><path d="M28 75 L50 36 L73 75 Z" fill="${c[3]}" stroke="${c[2]}" stroke-width="4" stroke-linejoin="round"/><circle cx="82" cy="45" r="15" fill="${c[4]}" stroke="${c[2]}" stroke-width="4"/><path d="M30 91 H98" stroke="${c[2]}" stroke-width="7" stroke-linecap="round"/>` };
}
export function buildNative2DAsset({ prompt = "", kind = "character", quality = "standard", style = "stylized" } = {}) {
  const cleanPrompt = String(prompt).replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);
  if (!safeKind.has(kind)) throw new Error("Unsupported 2D asset kind. Use character, tileset, ui, background, or icon.");
  const safeLevel = safeQuality.has(quality) ? quality : "standard";
  const colors = paletteFor(kind, cleanPrompt);
  const params = { prompt: cleanPrompt, colors, style: String(style).slice(0, 80) };
  const built = kind === "character" ? characterSvg(params) : kind === "tileset" ? tilesetSvg(params) : kind === "ui" ? uiSvg(params) : kind === "background" ? backgroundSvg(params) : iconSvg(params);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${built.width}" height="${built.height}" viewBox="${built.viewBox}" role="img" aria-label="${esc(cleanPrompt || kind)}"><title>${esc(cleanPrompt || "GENE " + kind)}</title><desc>Procedurally generated, self-contained 2D game asset sheet. No external resources or scripts.</desc>${built.body}</svg>`;
  // Export each atlas cell as a separately loadable SVG as well as retaining the source sheet.
  // The viewBox crops the original vector geometry without rasterizing or duplicating its design.
  const frameFiles = {};
  if (built.frames > 1 && built.frameWidth > 0 && built.frameHeight > 0) {
    for (let index = 0; index < built.frames; index++) {
      const x = (index % Math.max(1, Math.floor(built.width / built.frameWidth))) * built.frameWidth;
      const y = Math.floor(index / Math.max(1, Math.floor(built.width / built.frameWidth))) * built.frameHeight;
      const name = String(index).padStart(2, "0");
      frameFiles["frame-" + name + ".svg"] = `<svg xmlns="http://www.w3.org/2000/svg" width="${built.frameWidth}" height="${built.frameHeight}" viewBox="${x} ${y} ${built.frameWidth} ${built.frameHeight}"><title>${esc((built.frameNames[index] || kind) + " frame " + index)}</title>${built.body}</svg>`;
    }
  }
  const animationClips = kind === "character" ? [
    { name: "idle", frames: [0], frameDurationMs: 220, loop: true },
    { name: "walk", frames: [0, 1, 2, 3], frameDurationMs: 110, loop: true },
    { name: "move-left", frames: [1, 2, 3, 0], frameDurationMs: 110, loop: true },
    { name: "move-right", frames: [3, 2, 1, 0], frameDurationMs: 110, loop: true }
  ] : [];
  const partCount = (svg.match(/<rect|<path|<circle|<ellipse|<g\b/g) || []).length;
  const warnings = [];
  if (cleanPrompt.length < 3) warnings.push({ code: "GENERIC_BRIEF", severity: "info", message: "A short prompt produced a generic procedural asset; add visual details for a more tailored result." });
  if (kind === "character") warnings.push({ code: "NO_SKELETON_RIG", severity: "info", message: "This is a 2D sprite sheet, not a skeletal animation rig; frame names are suggested animation labels." });
  const report = { version: 1, scope: "procedural-2d-structural", status: warnings.some(w => w.severity === "warning") ? "review-recommended" : "structurally-clean", score: Math.max(60, 100 - warnings.length * 10), width: built.width, height: built.height, frameWidth: built.frameWidth, frameHeight: built.frameHeight, frames: built.frames, partCount, svgBytes: Buffer.byteLength(svg), warnings };
  return {
    format: "gene-forge-2d-v1",
    name: (cleanPrompt || "GENE " + kind).slice(0, 80),
    kind, style: params.style, quality: safeLevel,
    mimeType: "image/svg+xml",
    svg,
    manifest: { format: "gene-forge-2d-v1", kind, width: built.width, height: built.height, frameWidth: built.frameWidth, frameHeight: built.frameHeight, frames: built.frames, frameNames: built.frameNames, frameFiles: Object.keys(frameFiles), animationClips, frameRate: kind === "character" ? 9 : 0, origin: "top-left", animation: kind === "character" ? "frame-strip-with-cropped-frames; not rigged" : "static", palette: colors, prompt: cleanPrompt, source: "GENE native procedural 2D generator" },
    frameFiles,
    qualityReport: report
  };
}
