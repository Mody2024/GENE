import assert from "node:assert/strict";
import { chromium } from "playwright";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const baseURL = (process.env.GENE_TEST_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
if (process.env.GENE_LIVE_GENERATION !== "1") {
  console.log("Live AI generation smoke skipped. Set GENE_LIVE_GENERATION=1 to run one real generation request.");
  process.exit(0);
}

const healthResponse = await fetch(baseURL + "/api/health", { signal: AbortSignal.timeout(10_000) });
assert.equal(healthResponse.status, 200, "GENE health endpoint must respond");
const health = await healthResponse.json();
if (!health.aiConfigured) {
  console.log("Live AI generation smoke skipped: this environment has no configured AI provider.");
  process.exit(0);
}

const scenarios = {
  "signal-garden": {
    name: scenario.name,
    prompt: "Build a compact original 2D browser game called Signal Garden. Move with arrow keys or WASD, collect five glowing seeds, avoid moving shadow-orbs, show a score, win/lose states and restart."
  },
  "tiny-platformer": {
    name: "Tiny Platformer",
    prompt: "Build a compact original 2D platformer called Tiny Platformer. Use arrow keys or WASD to move and jump across three platforms, collect five coins, avoid two moving hazards, reach a finish flag, and include score, win/lose states and restart."
  },
  "orbit-puzzle": {
    name: "Orbit Puzzle",
    prompt: "Build a compact original 2D puzzle game called Orbit Puzzle. Use arrow keys to rotate a small orbital maze, guide a glowing core to its goal, avoid timed blockers, show clear instructions, moves counter, success state and restart."
  }
};

if (process.env.GENE_PLAYGROUND_ALL === "1") {
  const scriptPath = fileURLToPath(import.meta.url);
  for (const scenario of Object.keys(scenarios)) {
    console.log("\\n=== GENE playground scenario: " + scenario + " ===");
    const child = spawnSync(process.execPath, [scriptPath], {
      stdio: "inherit",
      env: { ...process.env, GENE_PLAYGROUND_ALL: "0", GENE_LIVE_SCENARIO: scenario }
    });
    if (child.error) throw child.error;
    if (child.status !== 0) process.exit(child.status ?? 1);
  }
  console.log("\\nGENE live playground passed all three generation scenarios.");
  process.exit(0);
}

const scenarioName = process.env.GENE_LIVE_SCENARIO || "signal-garden";
const scenario = scenarios[scenarioName];
if (!scenario) throw new Error("Unknown GENE_LIVE_SCENARIO: " + scenarioName);
const prompt = scenario.prompt + " Use original Canvas 2D art, responsive controls, no external assets or network, and keep the complete source compact and runnable.";
const response = await fetch(baseURL + "/api/agent", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  signal: AbortSignal.timeout(65_000),
  body: JSON.stringify({
    operation: "build",
    mode: "build",
    thinking: "fast",
    message: prompt,
    project: {
      id: "gene-live-generation-" + scenarioName,
      kind: "game",
      mode: "build",
      preferredEngine: "canvas2d",
      projectIntent: "game-2d",
      name: "Signal Garden",
      initialPrompt: prompt,
      files: {},
      messages: [],
      answers: {},
      references: [],
      versions: [],
      plan: null
    }
  })
});
const payload = await response.json().catch(() => null);
if (!response.ok || !payload?.ok || !Array.isArray(payload.result?.files)) {
  throw new Error("Live generation failed (HTTP " + response.status + "): " + String(payload?.error?.message || "invalid response").slice(0, 1800));
}
const files = Object.fromEntries(payload.result.files.map(file => [file.path, file.content]));
for (const required of ["game.html", "game.css", "game.js", "game-spec.json"]) {
  assert.equal(typeof files[required], "string", "generation must return " + required);
  assert.ok(files[required].length > 0, required + " must not be empty");
}
new Function(files["game.js"]);
const spec = JSON.parse(files["game-spec.json"]);
assert.equal(spec.engine, "canvas2d", "the requested 2D engine must be preserved");

let html = files["game.html"];
html = html.replace(/<script\b[^>]*src=["'][^"']*game\.js[^"']*["'][^>]*>\s*<\/script\s*>/gi, "");
html = html.replace(/<link\b[^>]*href=["'][^"']*game\.css[^"']*["'][^>]*>/gi, "");
if (/<\/head\s*>/i.test(html)) html = html.replace(/<\/head\s*>/i, "<style>" + files["game.css"] + "</style></head>");
else html = "<style>" + files["game.css"] + "</style>" + html;
const safeJs = files["game.js"].replace(/<\/script/gi, "<\\/script");
const scriptTag = "<script>" + safeJs + "</script>";
if (/<\/body\s*>/i.test(html)) html = html.replace(/<\/body\s*>/i, scriptTag + "</body>");
else html += scriptTag;

const browser = await chromium.launch({
  headless: true,
  ...(process.env.GENE_CHROMIUM_PATH ? { executablePath: process.env.GENE_CHROMIUM_PATH } : {}),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 15_000 });
  await page.waitForTimeout(1_200);
  const evidence = await page.evaluate(() => {
    const canvases = [...document.querySelectorAll("canvas")].filter(node => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    let coloredPixels = 0;
    for (const canvas of canvases) {
      try {
        const ctx = canvas.getContext("2d");
        if (!ctx || !canvas.width || !canvas.height) continue;
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        for (let i = 0; i < data.length; i += 16) {
          if (data[i + 3] > 0 && (data[i] > 12 || data[i + 1] > 12 || data[i + 2] > 12)) coloredPixels++;
        }
      } catch {}
    }
    return {
      canvasCount: canvases.length,
      coloredPixels,
      interactiveCount: document.querySelectorAll("button, input, [role=button]").length,
      bodyText: (document.body?.innerText || "").trim().slice(0, 300)
    };
  });
  assert.ok(evidence.canvasCount > 0 || evidence.interactiveCount > 0, "generated game must render a canvas or real interactive DOM");
  assert.ok(evidence.coloredPixels > 200 || evidence.interactiveCount > 0 || evidence.bodyText.length > 20, "generated game must show visible scene pixels or meaningful UI");
  assert.deepEqual(pageErrors, [], "generated game must not throw browser runtime errors");
  console.log(JSON.stringify({
    ok: true,
    provider: payload.aiMode,
    model: payload.model,
    scenario: scenarioName,
    title: spec.title,
    files: Object.fromEntries(Object.entries(files).map(([path, content]) => [path, content.length])),
    browserEvidence: evidence,
    note: "This is a generated prototype smoke test, not proof of full-game completeness."
  }, null, 2));
} finally {
  await browser.close();
}
