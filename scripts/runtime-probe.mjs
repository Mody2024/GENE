import { PROBE_INIT_SCRIPT, classifyRuntime } from "../apps/web/app/lib/runtime-diagnostics.mjs";

/**
 * Run a project in a real headless Chromium and report what it actually does.
 * Usage: const { report, result } = await probeProject({ chromium, files, contract });
 * `files` is a { path: source } map in GENE's project layout (game.html, game.css, game.js, extra modules).
 */
const ORIGIN = "http://gene-probe.test";
const TYPES = { html: "text/html", css: "text/css", js: "text/javascript", json: "application/json", svg: "image/svg+xml", png: "image/png" };
const KEYS = ["ArrowRight", "Space", "KeyD", "ArrowUp", "Enter"];

function assemble(files) {
  const html = String(files["game.html"] || "");
  let spec = {};
  try { spec = JSON.parse(files["game-spec.json"] || "{}"); } catch { spec = {}; }
  const modules = Array.isArray(spec.additionalFiles) ? spec.additionalFiles.filter(path => typeof files[path] === "string") : [];
  const css = files["game.css"] !== undefined ? '<link rel="stylesheet" href="game.css">' : "";
  const scripts = [...modules, "game.js"].filter(path => files[path] !== undefined).map(path => '<script src="' + path + '"></script>').join("");
  const body = /<html[\s>]/i.test(html) ? html.replace(/<\/body>/i, scripts + "</body>") : '<!doctype html><html><head><meta charset="utf-8">' + css + "</head><body>" + html + scripts + "</body></html>";
  return body;
}

// Runs inside a blank page: pixel statistics for a PNG screenshot.
const ANALYZE = async b64 => {
  const img = new Image();
  img.src = "data:image/png;base64," + b64;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = Math.min(img.width, 320); c.height = Math.max(1, Math.round(img.height * c.width / img.width));
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  const buckets = new Map();
  for (let i = 0; i < d.length; i += 4) { const k = (d[i] >> 4) << 8 | (d[i + 1] >> 4) << 4 | (d[i + 2] >> 4); buckets.set(k, (buckets.get(k) || 0) + 1); }
  let top = 0; for (const n of buckets.values()) top = Math.max(top, n);
  const total = d.length / 4;
  const G = 24, grid = [];
  for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = Math.floor(gy * c.height / G); y < Math.floor((gy + 1) * c.height / G); y++) for (let x = Math.floor(gx * c.width / G); x < Math.floor((gx + 1) * c.width / G); x++) { const i = (y * c.width + x) * 4; r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
    grid.push(n ? [r / n, g / n, b / n] : [0, 0, 0]);
  }
  return { contentRatio: 1 - top / total, colors: buckets.size, grid };
};
const gridDelta = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) for (let k = 0; k < 3; k++) s += Math.abs(a[i][k] - b[i][k]); return s / (a.length * 3 * 255); };

// Deterministic randomness so two runs of the same game can be compared frame for frame.
const SEED_SCRIPT = "(function(){var s=123456789;Math.random=function(){s|=0;s=s+0x6D2B79F5|0;var t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};})();";

/**
 * The game runs on a fake clock with a seeded Math.random, so a timeline is reproducible. The same timeline is run
 * without input (twice, to measure noise) and with input; any frame difference between them is caused by the input.
 */
export async function probeProject({ chromium, files, contract = {}, launchArgs = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"], settleMs = 900, windowMs = 700 }) {
  const browser = await chromium.launch({ headless: true, ...(process.env.GENE_CHROMIUM_PATH ? { executablePath: process.env.GENE_CHROMIUM_PATH } : {}), args: launchArgs });
  try {
    const context = await browser.newContext({ viewport: { width: 960, height: 600 } });
    await context.addInitScript(SEED_SCRIPT);
    await context.addInitScript(PROBE_INIT_SCRIPT);
    await context.route(ORIGIN + "/**", route => {
      const path = decodeURIComponent(new URL(route.request().url()).pathname.slice(1)) || "index.html";
      const body = path === "index.html" ? assemble(files) : files[path];
      if (body === undefined) return route.fulfill({ status: 404, body: "not found" });
      return route.fulfill({ status: 200, contentType: TYPES[path.split(".").pop()] || "text/plain", body });
    });
    const analyzer = await context.newPage();
    await analyzer.goto("about:blank");
    const analyze = async (page, clip) => analyzer.evaluate(ANALYZE, (await page.screenshot({ type: "png", ...(clip ? { clip } : {}) })).toString("base64"));
    const pageErrors = [];

    async function timeline(withInput) {
      const page = await context.newPage();
      page.on("pageerror", error => pageErrors.push("pageerror: " + error.message));
      page.on("requestfailed", request => { if (request.url().startsWith(ORIGIN)) pageErrors.push("failed to load " + request.url().replace(ORIGIN + "/", "")); });
      await page.clock.install({ time: 0 });
      await page.goto(ORIGIN + "/index.html", { waitUntil: "load" });
      await page.waitForTimeout(250); // let images, fonts and other real-time loads finish before game time advances
      await page.clock.runFor(settleMs);
      // Browser automation registers its own pointer listeners and draws a focus ring on clicked canvases; neither
      // is the game's doing, so capture the game's own listeners first and hide the ring before measuring pixels.
      const loadListeners = await page.evaluate(() => ({ ...((window.__geneProbe && window.__geneProbe.listeners) || {}) }));
      await page.addStyleTag({ content: "canvas:focus,canvas:focus-visible{outline:none !important}" });
      const canvasInfo = await page.evaluate(() => {
        let best = null;
        for (const el of document.querySelectorAll("canvas")) { const r = el.getBoundingClientRect(); const area = r.width * r.height; if (r.width > 8 && r.height > 8 && (!best || area > best.area)) best = { r, area, el }; }
        if (!best) return null;
        return { width: best.el.width, height: best.el.height, cssWidth: Math.round(best.r.width), cssHeight: Math.round(best.r.height), clip: { x: Math.max(0, Math.round(best.r.x)), y: Math.max(0, Math.round(best.r.y)), width: Math.round(best.r.width), height: Math.round(best.r.height) } };
      });
      const clip = canvasInfo ? canvasInfo.clip : undefined;
      const first = await analyze(page, clip);
      await page.clock.runFor(windowMs);
      const second = await analyze(page, clip);
      const domBefore = await page.evaluate(() => ({ text: document.body.innerText || "", html: document.body.innerHTML }));
      if (withInput) {
        // Click the canvas, or the first control of a DOM game, then press the common game keys.
        const target = canvasInfo ? { x: canvasInfo.clip.x + canvasInfo.clip.width / 2, y: canvasInfo.clip.y + canvasInfo.clip.height / 2 } : await page.evaluate(() => {
          const el = document.querySelector("button, input[type=button], input[type=submit], a[href], [role=button]");
          if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        });
        if (target) await page.mouse.click(target.x, target.y).catch(() => {});
        for (const code of KEYS) { await page.keyboard.press(code).catch(() => {}); await page.clock.runFor(60); }
        await page.mouse.move(300, 200).catch(() => {});
        await page.clock.runFor(Math.max(0, windowMs - KEYS.length * 60));
      } else await page.clock.runFor(windowMs);
      const last = await analyze(page, clip);
      const domAfter = await page.evaluate(() => ({ text: document.body.innerText || "", html: document.body.innerHTML }));
      const probe = { ...(await page.evaluate(() => window.__geneProbe || {})), listeners: loadListeners };
      const dom = await page.evaluate(() => ({
        textLength: (document.body.innerText || "").trim().length,
        controls: document.querySelectorAll("button,input,select,textarea,a[href],[role=button],[tabindex]:not(canvas)").length
      }));
      await page.close();
      return { first, second, last, domChanged: domBefore.text !== domAfter.text || domBefore.html !== domAfter.html, canvasInfo, probe, dom };
    }

    const control = await timeline(false);
    const repeat = await timeline(false);
    const played = await timeline(true);
    const report = {
      probe: played.probe, dom: played.dom, pageErrors: [...new Set(pageErrors)],
      canvas: played.canvasInfo,
      visible: { contentRatio: Math.max(control.first.contentRatio, control.second.contentRatio, played.last.contentRatio), colors: Math.max(control.first.colors, control.second.colors, played.last.colors) },
      motion: {
        idleDelta: gridDelta(control.first.grid, control.second.grid),
        noise: gridDelta(control.last.grid, repeat.last.grid),
        inputDelta: gridDelta(control.last.grid, played.last.grid),
        domChanged: played.domChanged
      }
    };
    return { report, result: classifyRuntime(report, contract) };
  } finally {
    await browser.close();
  }
}
