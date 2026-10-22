const PALETTES = [
  ["#0c1727", "#16465a", "#48d5b5", "#f6d38a"],
  ["#24172e", "#703d68", "#ffad86", "#ffd7aa"],
  ["#15251e", "#2d6b50", "#a7db91", "#f1e4b8"],
  ["#172036", "#405a90", "#8ecaff", "#f6d56a"],
  ["#2b1e19", "#875338", "#f0b66d", "#f7e1b6"],
  ["#151b28", "#424d6d", "#ff806f", "#e8eeff"]
];

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
function hashText(value) {
  let hash = 2166136261;
  for (const char of String(value || "")) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
function wrapTitle(value) {
  const words = String(value || "New project").trim().split(/\s+/).filter(Boolean);
  const rows = [];
  let row = "";
  for (const word of words) {
    const next = row ? row + " " + word : word;
    if (next.length > 22 && row) {
      rows.push(row);
      row = word;
    } else row = next;
  }
  if (row) rows.push(row);
  if (rows.length > 2) rows.splice(2, rows.length - 2);
  return rows.length ? rows : ["New project"];
}
function findPalette(seed) {
  return PALETTES[hashText(seed) % PALETTES.length];
}

function projectFontFamily(files) {
  const css = Object.entries(files || {}).filter(([path, content]) => /\\.css$/i.test(path) && typeof content === "string").map(([, content]) => content).join("\\n").slice(0, 500_000);
  const match = css.match(/font-family\\s*:\\s*([^;{}]+)/i);
  if (!match) return "system-ui,Segoe UI,Arial,sans-serif";
  const first = match[1].split(",")[0].trim().replace(/^["']|["']$/g, "");
  return /^[\\w\\s-]{1,48}$/.test(first) ? first + ",system-ui,Segoe UI,Arial,sans-serif" : "system-ui,Segoe UI,Arial,sans-serif";
}

function safeProjectSvg(source) {
  let svg = String(source || "").slice(0, 400_000).trim();
  if (!/^<svg\b/i.test(svg)) return "";
  svg = svg
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<foreignObject\b[\s\S]*?<\/foreignObject\s*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(["']).*?\1/gi, "")
    .replace(/\s(?:href|src)\s*=\s*(["'])https?:[^"']*\1/gi, "")
    .replace(/url\(\s*(["']?)https?:[^)]*\)/gi, "none");
  return svg;
}

function characterManifest(files) {
  const entries = Object.entries(files || {});
  for (const [path, source] of entries) {
    if (!/\.json$/i.test(path) || !path.startsWith("assets/")) continue;
    try {
      const data = JSON.parse(String(source));
      const kind = String(data?.kind || data?.asset?.kind || data?.recipe?.kind || "").toLowerCase();
      const name = String(data?.name || data?.asset?.name || data?.recipe?.name || "").toLowerCase();
      if (kind === "character" || /\b(player|hero|character|avatar|skeleton|npc)\b/.test(name)) {
        const dir = path.slice(0, path.lastIndexOf("/"));
        return { dir, name, kind, entries };
      }
    } catch {}
  }
  return null;
}

function renderObjCharacter(objSource, mtlSource, box = { x: 330, y: 54, w: 170, h: 196 }) {
  const vertices = [];
  const faces = [];
  const materialColors = new Map();
  let currentMaterial = "#b9c8c2";
  let materialName = "";
  for (const line of String(mtlSource || "").split(/\r?\n/)) {
    const m = line.trim().match(/^newmtl\s+(.+)$/);
    if (m) { materialName = m[1].trim(); continue; }
    const kd = line.trim().match(/^Kd\s+([0-9.eE+-]+)\s+([0-9.eE+-]+)\s+([0-9.eE+-]+)/);
    if (kd && materialName) {
      const rgb = kd.slice(1).map(value => Math.max(0, Math.min(255, Math.round(Number(value) * 255))));
      materialColors.set(materialName, "#" + rgb.map(value => value.toString(16).padStart(2, "0")).join(""));
    }
  }
  for (const line of String(objSource || "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("v ")) {
      const values = trimmed.slice(2).trim().split(/\s+/).slice(0, 3).map(Number);
      if (values.length === 3 && values.every(Number.isFinite)) vertices.push(values);
      if (vertices.length > 6000) return "";
    } else if (trimmed.startsWith("usemtl ")) {
      const name = trimmed.slice(7).trim();
      currentMaterial = materialColors.get(name) || currentMaterial;
    } else if (trimmed.startsWith("f ")) {
      const indices = trimmed.slice(2).trim().split(/\s+/).map(token => {
        const raw = Number(token.split("/")[0]);
        return raw < 0 ? vertices.length + raw : raw - 1;
      });
      if (indices.length >= 3 && indices.every(index => Number.isInteger(index) && index >= 0 && index < vertices.length)) {
        for (let i = 1; i < indices.length - 1; i++) faces.push({ indices: [indices[0], indices[i], indices[i + 1]], color: currentMaterial });
      }
      if (faces.length > 12_000) return "";
    }
  }
  if (vertices.length < 3 || !faces.length) return "";
  const projected = vertices.map(([x, y, z]) => [x - z * 0.72, -y + (x + z) * 0.22]);
  const xs = projected.map(point => point[0]), ys = projected.map(point => point[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const width = Math.max(0.01, maxX - minX), height = Math.max(0.01, maxY - minY);
  const scale = Math.min(box.w / width, box.h / height) * 0.88;
  const offsetX = box.x + (box.w - width * scale) / 2;
  const offsetY = box.y + (box.h - height * scale) / 2;
  const polygons = faces.map(face => {
    const points = face.indices.map(index => {
      const point = projected[index];
      return (offsetX + (point[0] - minX) * scale).toFixed(2) + "," + (offsetY + (point[1] - minY) * scale).toFixed(2);
    }).join(" ");
    return '<polygon points="' + points + '" fill="' + face.color + '" stroke="#17201d" stroke-opacity=".24" stroke-width=".55" stroke-linejoin="round"/>';
  }).join("");
  return '<g data-gene-cover-character="obj">' + polygons + "</g>";
}

function renderProjectCharacter(files) {
  const projectFiles = files && typeof files === "object" ? files : {};
  const manifest = characterManifest(projectFiles);
  const entries = Object.entries(projectFiles);
  if (manifest) {
    const basename = manifest.name && /character|hero|player|avatar|skeleton|npc/.test(manifest.name) ? manifest.name : "asset";
    const spritePaths = [manifest.dir + "/sprite.svg", manifest.dir + "/" + basename + ".svg", manifest.dir + "/character.svg", manifest.dir + "/hero.svg", manifest.dir + "/player.svg"];
    for (const spritePath of spritePaths) {
      const sprite = safeProjectSvg(projectFiles[spritePath]);
      if (sprite) {
        const data = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(sprite);
        return '<image data-gene-cover-character="sprite" x="324" y="48" width="190" height="205" preserveAspectRatio="xMidYMid meet" href="' + data + '"/>';
      }
    }
    const objPaths = [manifest.dir + "/model.obj", manifest.dir + "/" + basename + ".obj", manifest.dir + "/character.obj", manifest.dir + "/hero.obj", manifest.dir + "/player.obj"];
    for (const objPath of objPaths) {
      const obj = projectFiles[objPath];
      if (typeof obj === "string") return renderObjCharacter(obj, projectFiles[objPath.replace(/\\.obj$/i, ".mtl")] || projectFiles[manifest.dir + "/model.mtl"] || "", { x: 330, y: 52, w: 175, h: 202 });
    }
  }
  const spriteEntry = entries.find(([path, source]) => /(?:character|hero|player|skeleton|avatar)[^/]*\.svg$/i.test(path) && safeProjectSvg(source));
  if (spriteEntry) {
    const data = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(safeProjectSvg(spriteEntry[1]));
    return '<image data-gene-cover-character="sprite" x="324" y="48" width="190" height="205" preserveAspectRatio="xMidYMid meet" href="' + data + '"/>';
  }
  return "";
}

/**
 * Credit-free deterministic project-cover artwork. It uses project-owned character
 * sprites or OBJ meshes when available, then falls back to local vector art. No image
 * generation model or external asset request is used.
 */
export function createProjectCoverSvg(input = {}) {
  const name = String(input.name || input.title || "New project").trim().slice(0, 80) || "New project";
  const prompt = String(input.prompt || input.initialPrompt || "").slice(0, 3000);
  const engine = String(input.engine || input.preferredEngine || input.plan?.engine || "auto");
  const kind = input.kind === "app" || engine === "webapp" ? "app" : "game";
  const source = (name + " " + prompt + " " + engine).toLowerCase();
  const palette = findPalette(source);
  const fontFamily = projectFontFamily(input.files);
  const bg1 = palette[0], bg2 = palette[1], accent = palette[2], highlight = palette[3];
  const is3d = engine === "webgl3d" || /3d|three dimensional|first person|third person|open world|simulation|racing|driving/i.test(source);
  const theme = /skeleton|bones|undead/i.test(source) ? "skeleton"
    : /space|rocket|planet|alien|galaxy/i.test(source) ? "space"
    : /forest|woods|tree|nature|garden/i.test(source) ? "forest"
    : /desert|egypt|pyramid|sand/i.test(source) ? "desert"
    : /city|urban|building|street|rooftop/i.test(source) ? "city"
    : /racing|car|truck|driving|vehicle/i.test(source) ? "racing"
    : /horror|haunted|ghost|monster|zombie/i.test(source) ? "horror"
    : /text.?based|visual novel|dialogue|detective|story|interactive fiction/i.test(source) ? "story"
    : "adventure";
  const titleLines = wrapTitle(name);
  const titleMarkup = titleLines.map((line, index) => '<tspan x="32" dy="' + (index === 0 ? "0" : "29") + '">' + escapeXml(line) + "</tspan>").join("");
  const mode = kind === "app" ? (/website|portfolio|landing page|site/.test(source) ? "WEBSITE" : "WEB APP") : theme === "story" ? "STORY GAME" : (is3d ? "3D GAME" : "2D GAME");
  let art = "";
  if (kind === "app") {
    art = '<rect x="56" y="48" width="390" height="188" rx="14" fill="#f9fbff" opacity=".96"/>' +
      '<rect x="56" y="48" width="390" height="30" rx="14" fill="#e6edf6"/><circle cx="74" cy="63" r="4" fill="' + accent + '"/><circle cx="88" cy="63" r="4" fill="' + highlight + '"/><circle cx="102" cy="63" r="4" fill="#d2a0a9"/>' +
      '<rect x="76" y="96" width="100" height="9" rx="4" fill="' + bg2 + '"/><rect x="76" y="113" width="146" height="5" rx="2" fill="#b9c5d3"/>' +
      '<rect x="76" y="139" width="98" height="70" rx="8" fill="' + accent + '" opacity=".20"/><rect x="186" y="139" width="98" height="70" rx="8" fill="' + highlight + '" opacity=".34"/><rect x="296" y="139" width="128" height="70" rx="8" fill="' + bg2 + '" opacity=".14"/>' +
      '<path d="M91 190 L111 171 L130 180 L153 151" fill="none" stroke="' + bg2 + '" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><rect x="200" y="174" width="13" height="21" rx="3" fill="' + accent + '"/><rect x="219" y="159" width="13" height="36" rx="3" fill="' + bg2 + '"/><rect x="238" y="148" width="13" height="47" rx="3" fill="' + highlight + '"/>' +
      '<rect x="365" y="94" width="60" height="18" rx="9" fill="' + accent + '"/><rect x="76" y="224" width="390" height="10" rx="5" fill="' + bg2 + '" opacity=".12"/>';
  } else if (theme === "space") {
    art = '<circle cx="378" cy="119" r="60" fill="' + accent + '" opacity=".88"/><ellipse cx="378" cy="119" rx="90" ry="20" fill="none" stroke="' + highlight + '" stroke-width="7" transform="rotate(-18 378 119)"/>' +
      '<path d="M88 224 L132 122 L176 224 Z" fill="' + bg2 + '" opacity=".9"/><path d="M104 224 L132 164 L159 224 Z" fill="' + accent + '"/>' +
      '<g fill="#fff" opacity=".8"><circle cx="82" cy="65" r="2"/><circle cx="201" cy="58" r="2"/><circle cx="263" cy="96" r="1.5"/><circle cx="475" cy="58" r="2"/><circle cx="505" cy="181" r="1.5"/><circle cx="278" cy="175" r="2"/><circle cx="438" cy="214" r="1.5"/></g>' +
      '<path d="M251 172 L283 150 L324 173 L314 186 L274 183 Z" fill="' + highlight + '"/><circle cx="288" cy="171" r="6" fill="' + bg2 + '"/><path d="M267 184 L252 199 L281 187 M309 185 L328 198 L310 181" fill="none" stroke="' + accent + '" stroke-width="5" stroke-linecap="round"/>';
  } else if (theme === "forest") {
    art = '<path d="M0 210 Q85 164 170 206 T340 193 T560 205 L560 266 L0 266 Z" fill="' + bg2 + '"/><path d="M0 232 Q120 198 230 235 T560 224 L560 268 L0 268 Z" fill="' + accent + '" opacity=".52"/>' +
      '<g fill="' + bg2 + '"><path d="M78 216 L115 112 L152 216 Z"/><path d="M127 216 L164 92 L201 216 Z"/><path d="M411 220 L450 105 L489 220 Z"/><path d="M451 220 L486 130 L521 220 Z"/></g>' +
      '<g fill="' + accent + '"><path d="M91 164 L115 112 L139 164 Z"/><path d="M142 152 L164 92 L186 152 Z"/><path d="M426 170 L450 105 L474 170 Z"/></g><rect x="0" y="252" width="560" height="26" fill="' + bg1 + '" opacity=".5"/>';
  } else if (theme === "desert") {
    art = '<path d="M0 192 Q110 128 224 194 T450 184 T560 190 L560 270 L0 270 Z" fill="' + highlight + '" opacity=".66"/><path d="M0 226 Q120 180 250 223 T560 218 L560 272 L0 272 Z" fill="' + accent + '" opacity=".6"/>' +
      '<path d="M352 217 L408 126 L464 217 Z" fill="' + bg2 + '"/><path d="M408 126 L436 217 L464 217 Z" fill="' + bg1 + '" opacity=".5"/><path d="M70 224 L104 184 L138 224 Z" fill="' + bg2 + '" opacity=".7"/>' +
      '<circle cx="437" cy="73" r="25" fill="' + highlight + '"/><path d="M0 253 Q140 239 282 258 T560 248" stroke="' + bg2 + '" stroke-width="3" opacity=".35" fill="none"/>';
  } else if (theme === "city") {
    art = '<g fill="' + bg2 + '"><rect x="28" y="112" width="65" height="145" rx="4"/><rect x="103" y="79" width="72" height="178" rx="4"/><rect x="186" y="128" width="58" height="129" rx="4"/><rect x="375" y="105" width="65" height="152" rx="4"/><rect x="448" y="71" width="77" height="186" rx="4"/></g>' +
      '<g fill="' + highlight + '" opacity=".75">' + Array.from({length:24},(_,i)=>'<rect x="' + (39+(i%5)*12 + (i>11?345:0)) + '" y="' + (126+Math.floor(i/5)*23) + '" width="5" height="8" rx="1"/>').join("") + '</g>' +
      '<path d="M0 250 L560 230 L560 280 L0 280 Z" fill="' + bg1 + '"/><path d="M245 280 L270 245 L296 245 L322 280 Z" fill="' + bg2 + '" opacity=".85"/><path d="M278 253 L282 253 M290 266 L294 266" stroke="' + highlight + '" stroke-width="3"/>';
  } else if (theme === "racing") {
    art = '<path d="M160 260 L240 92 L320 92 L400 260 Z" fill="' + bg1 + '" opacity=".94"/><path d="M240 260 L267 100 L293 100 L320 260 Z" fill="' + bg2 + '"/><path d="M278 130 L282 130 M274 164 L286 164 M269 202 L291 202" stroke="' + highlight + '" stroke-width="4" stroke-linecap="round"/>' +
      '<path d="M235 200 L258 180 L302 180 L326 201 L319 225 L242 225 Z" fill="' + accent + '"/><rect x="260" y="183" width="38" height="16" rx="5" fill="' + highlight + '"/><circle cx="253" cy="224" r="10" fill="' + bg1 + '"/><circle cx="311" cy="224" r="10" fill="' + bg1 + '"/>';
  } else if (theme === "skeleton") {
    art = '<path d="M0 230 Q140 199 280 230 T560 220 L560 278 L0 278 Z" fill="' + bg2 + '" opacity=".6"/>' +
      '<circle cx="281" cy="112" r="32" fill="#f4f1df"/><circle cx="269" cy="110" r="6" fill="' + bg1 + '"/><circle cx="293" cy="110" r="6" fill="' + bg1 + '"/><path d="M272 127 L281 119 L290 127 L281 134 Z" fill="' + bg1 + '"/><path d="M267 137 Q281 144 295 137" fill="none" stroke="' + bg1 + '" stroke-width="3"/>' +
      '<rect x="262" y="148" width="38" height="52" rx="13" fill="#f4f1df"/><path d="M263 160 L299 160 M263 172 L299 172 M263 184 L299 184" stroke="' + bg1 + '" stroke-width="2"/>' +
      '<path d="M262 154 L235 184 L226 210 M300 154 L324 184 L335 207 M270 197 L259 229 L257 245 M291 197 L306 228 L311 245" stroke="#f4f1df" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" fill="none"/><circle cx="225" cy="212" r="6" fill="' + highlight + '"/><circle cx="337" cy="209" r="6" fill="' + highlight + '"/>';
  } else if (theme === "horror") {
    art = '<path d="M0 245 L55 210 L100 245 L158 185 L218 245 L290 208 L340 245 L410 174 L490 245 L560 220 L560 282 L0 282 Z" fill="' + bg2 + '"/>' +
      '<g fill="' + bg1 + '"><path d="M80 244 L80 160 L108 132 L136 160 L136 244 Z"/><path d="M414 244 L414 177 L436 151 L458 177 L458 244 Z"/></g><g fill="' + accent + '" opacity=".8"><circle cx="104" cy="176" r="4"/><circle cx="120" cy="176" r="4"/><circle cx="430" cy="190" r="3"/><circle cx="442" cy="190" r="3"/></g>';
  } else if (theme === "story") {
    art = '<rect x="124" y="64" width="316" height="174" rx="16" fill="#f5efe2"/><path d="M282 67 L282 236" stroke="' + bg2 + '" stroke-width="3" opacity=".5"/><path d="M145 97 L258 97 M145 114 L248 114 M145 131 L255 131 M306 97 L418 97 M306 114 L406 114 M306 131 L420 131" stroke="' + bg2 + '" stroke-width="4" stroke-linecap="round" opacity=".35"/>' +
      '<circle cx="194" cy="184" r="23" fill="' + accent + '"/><path d="M162 225 Q194 185 226 225" fill="' + bg2 + '"/><rect x="308" y="160" width="107" height="23" rx="10" fill="' + accent + '" opacity=".8"/><rect x="308" y="192" width="76" height="12" rx="6" fill="' + bg2 + '" opacity=".5"/>';
  } else {
    art = '<path d="M0 235 L70 206 L133 225 L206 177 L283 218 L352 187 L431 222 L493 198 L560 224 L560 280 L0 280 Z" fill="' + bg2 + '"/>' +
      '<path d="M0 252 L560 238 L560 280 L0 280 Z" fill="' + bg1 + '" opacity=".8"/><path d="M35 244 L106 240 L128 246 L58 252 Z" fill="' + accent + '" opacity=".65"/>' +
      '<g transform="translate(335 122)"><path d="M-42 47 L-23 13 L20 13 L42 47 Z" fill="' + accent + '"/><rect x="-22" y="20" width="44" height="13" rx="5" fill="' + highlight + '"/><circle cx="-23" cy="48" r="9" fill="' + bg1 + '"/><circle cx="23" cy="48" r="9" fill="' + bg1 + '"/></g>' +
      '<g fill="' + highlight + '"><rect x="80" y="190" width="34" height="34" rx="3" transform="rotate(15 97 207)"/><rect x="440" y="146" width="28" height="28" rx="3" transform="rotate(20 454 160)"/></g>';
  }
  const characterMarkup = renderProjectCharacter(input.files);
  if (characterMarkup) art += characterMarkup;
  const titleY = titleLines.length > 1 ? 299 : 320;
  return '<svg xmlns="http://www.w3.org/2000/svg" width="560" height="360" viewBox="0 0 560 360" role="img" aria-label="' + escapeXml(name) + ' cover" data-gene-cover="local-v1">' +
    '<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + bg1 + '"/><stop offset="1" stop-color="' + bg2 + '"/></linearGradient><linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + bg1 + '" stop-opacity="0"/><stop offset="1" stop-color="' + bg1 + '" stop-opacity=".97"/></linearGradient></defs>' +
    '<rect width="560" height="360" fill="url(#bg)"/>' +
    '<circle cx="70" cy="60" r="95" fill="' + accent + '" opacity=".10"/><circle cx="512" cy="42" r="112" fill="' + highlight + '" opacity=".08"/>' +
    '<g opacity=".12" stroke="#ffffff" stroke-width="1"><path d="M0 40 H560 M0 80 H560 M0 120 H560 M0 160 H560 M0 200 H560 M0 240 H560"/><path d="M40 0 V280 M80 0 V280 M120 0 V280 M160 0 V280 M200 0 V280 M240 0 V280 M280 0 V280 M320 0 V280 M360 0 V280 M400 0 V280 M440 0 V280 M480 0 V280 M520 0 V280"/></g>' +
    art + '<rect x="0" y="260" width="560" height="100" fill="url(#shade)"/>' +
    '<text x="32" y="' + titleY + '" font-family="' + escapeXml(fontFamily) + '" font-size="26" font-weight="750" fill="#ffffff" letter-spacing="-.6">' + titleMarkup + '</text>' +
    '<rect x="32" y="337" width="' + Math.max(84, mode.length * 7 + 24) + '" height="15" rx="7" fill="' + accent + '" opacity=".92"/><text x="44" y="348" font-family="' + escapeXml(fontFamily) + '" font-size="8" font-weight="800" letter-spacing="1.15" fill="' + bg1 + '">' + escapeXml(mode) + '</text>' +
    '<text x="526" y="348" text-anchor="end" font-family="system-ui,Segoe UI,Arial,sans-serif" font-size="8" fill="#ffffff" opacity=".8">GENE · LOCAL COVER</text>' +
    '</svg>';
}

export function projectCoverDataUrl(project) {
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(createProjectCoverSvg(project));
}
