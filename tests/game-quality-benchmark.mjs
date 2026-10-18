import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseURL = (process.env.GENE_TEST_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const out = process.env.GENE_QUALITY_OUT || "artifacts/gene-quality";
const browser = await chromium.launch({
  headless: true,
  ...(process.env.GENE_CHROMIUM_PATH ? { executablePath: process.env.GENE_CHROMIUM_PATH } : {}),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
});
const project = {
  id: "gene-quality-lifecycle-fixture",
  name: "Quality Lifecycle Fixture",
  kind: "game",
  mode: "build",
  initialPrompt: "Deterministic QA fixture for gameplay lifecycle, input and mobile layout",
  messages: [],
  answers: {},
  question: null,
  references: [],
  versions: [],
  plan: {
    title: "Quality Lifecycle Fixture",
    summary: "Exercise input, score, pause, win/loss, restart and mobile layout",
    engine: "canvas2d",
    tasks: ["Move", "Collect", "Pause", "Win or lose", "Restart"],
    mechanics: ["Keyboard movement", "Touch controls", "Score", "Win/loss states", "Pause and restart"],
    performanceBudget: { targetFps: 60, maxEnemies: 2, maxObjects: 20, maxParticles: 4 }
  },
  files: {
    "game.html": '<main><canvas id="game-canvas" width="800" height="480" tabindex="0" aria-label="QA game canvas"></canvas><b id="score-value">0</b><output id="game-status">PLAYING</output><button id="pause">Pause</button><button id="restart">Restart</button><button id="touch-left" aria-label="Move left">←</button><button id="touch-right" aria-label="Move right">→</button><button id="touch-action">Collect</button></main>',
    "game.css": 'html,body{margin:0;width:100%;min-height:100%;overflow:auto;background:#142133;color:white}canvas{display:block;width:min(100%,800px);height:auto;aspect-ratio:5/3;outline:none}b{position:absolute;top:12px;left:12px}button{position:relative;z-index:2;min-height:40px;touch-action:manipulation}',
    "game.js": '(function(){const c=document.getElementById("game-canvas"),x=c.getContext("2d"),scoreNode=document.getElementById("score-value"),statusNode=document.getElementById("game-status"),p={x:90,y:300,frames:0,score:0,lives:3,paused:false,phase:"playing"};function sync(){scoreNode.textContent=String(p.score);statusNode.textContent=p.phase.toUpperCase()+(p.paused?" · PAUSED":"")}function reset(){p.x=90;p.y=300;p.score=0;p.lives=3;p.paused=false;p.phase="playing";sync()}function move(dx,dy){if(p.phase!=="playing"||p.paused)return;p.x=Math.max(10,Math.min(790,p.x+dx));p.y=Math.max(30,Math.min(355,p.y+dy))}function collect(){if(p.phase!=="playing"||p.paused)return;p.score++;if(p.score>=3)p.phase="won";sync()}function draw(){p.frames++;x.fillStyle="#142133";x.fillRect(0,0,800,480);x.fillStyle="#3e785c";x.fillRect(0,365,800,115);x.fillStyle="#ffcf76";x.beginPath();x.arc(300,280,13,0,Math.PI*2);x.fill();x.fillStyle="#a6e8cb";x.fillRect(p.x-10,p.y-24,20,24);if(p.phase!=="playing"||p.paused){x.fillStyle="#ffffff";x.font="28px sans-serif";x.fillText(p.paused?"PAUSED":p.phase.toUpperCase(),330,100)}window.__geneQuality={...p,reset,collect,debugLose(){p.phase="lost";sync()}};requestAnimationFrame(draw)}window.addEventListener("keydown",e=>{if(e.key==="ArrowRight"||e.key==="d")move(18,0);if(e.key==="ArrowLeft"||e.key==="a")move(-18,0);if(e.key==="ArrowUp"||e.key==="w")move(0,-18);if(e.key==="ArrowDown"||e.key==="s")move(0,18);if(e.key===" "){e.preventDefault();collect()}if(e.key.toLowerCase()==="p"){p.paused=!p.paused;sync()}if(e.key.toLowerCase()==="r")reset()});document.getElementById("pause").addEventListener("click",()=>{p.paused=!p.paused;sync()});document.getElementById("restart").addEventListener("click",reset);document.getElementById("touch-left").addEventListener("click",()=>move(-18,0));document.getElementById("touch-right").addEventListener("click",()=>move(18,0));document.getElementById("touch-action").addEventListener("click",collect);sync();draw()})();',
    "game-spec.json": JSON.stringify({ title: "Quality Lifecycle Fixture", genre: "arcade", engine: "canvas2d", controls: ["Arrow keys or WASD", "Touch controls", "P pauses", "R restarts"], mechanics: ["Movement", "Score", "Win/loss", "Pause", "Restart"], objective: "Collect three tokens", winCondition: "Score reaches three", lossCondition: "Debug-triggered loss for QA", additionalFiles: [] }, null, 2)
  },
  activeFile: "game.js",
  updatedAt: new Date().toISOString()
};

async function seed(page) {
  await page.addInitScript(value => {
    if (window.top !== window.self) return;
    localStorage.setItem("gene.projects.v1", JSON.stringify([value]));
    localStorage.setItem("gene.active-project.v1", value.id);
  }, project);
}
const report = { startedAt: new Date().toISOString(), baseURL, checks: [] };
async function check(name, fn) {
  const entry = { name, status: "passed" };
  try { entry.details = await fn(); }
  catch (error) { entry.status = "failed"; entry.error = String(error.stack || error); throw error; }
  finally { report.checks.push(entry); }
}
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  try {
    await seed(page);
    const response = await page.goto(baseURL, { waitUntil: "domcontentloaded", timeout: 30000 });
    assert.ok(response?.ok(), "GENE workspace must load");
    const game = page.frameLocator('iframe[title="GENE live game preview"]');
    await game.locator("#game-canvas").waitFor({ timeout: 10000 });
    await check("Canvas rendering and keyboard input", async () => {
      const before = await game.locator("body").evaluate(() => window.__geneQuality);
      const pixels = await game.locator("#game-canvas").evaluate(canvas => {
        const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
        let colored = 0;
        for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 0 && (data[i] > 20 || data[i + 1] > 20 || data[i + 2] > 20)) colored++;
        return { width: canvas.width, height: canvas.height, colored };
      });
      assert.ok(pixels.colored > 10000, "canvas must contain visible gameplay pixels");
      await game.locator("#game-canvas").click();
      await game.locator("#game-canvas").evaluate(canvas => canvas.focus());
      await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(100);
      const after = await game.locator("body").evaluate(() => window.__geneQuality);
      assert.ok(after.x > before.x, "keyboard input must move the player");
      return { pixels, beforeX: before.x, afterX: after.x };
    });
    await check("Score, pause, win, loss and restart lifecycle", async () => {
      await game.locator("#touch-action").click();
      assert.equal(await game.locator("#score-value").textContent(), "1");
      await game.locator("#pause").click();
      assert.match(await game.locator("#game-status").textContent(), /PAUSED/);
      const paused = await game.locator("body").evaluate(() => window.__geneQuality);
      await game.locator("#touch-right").click();
      const stillPaused = await game.locator("body").evaluate(() => window.__geneQuality);
      assert.equal(stillPaused.x, paused.x, "movement must stop while paused");
      await game.locator("#pause").click();
      await game.locator("#touch-action").click();
      await game.locator("#touch-action").click();
      assert.match(await game.locator("#game-status").textContent(), /WON/);
      await game.locator("#game-canvas").evaluate(canvas => window.__geneQuality.debugLose());
      assert.match(await game.locator("#game-status").textContent(), /LOST/);
      await game.locator("#restart").click();
      assert.equal(await game.locator("#score-value").textContent(), "0");
      assert.match(await game.locator("#game-status").textContent(), /PLAYING/);
      assert.deepEqual(errors, [], "lifecycle interactions must not throw browser errors");
      return { scoreReset: true, pauseBlocksMovement: true, win: true, loss: true, restart: true, errors };
    });
    await page.screenshot({ path: out + "-desktop.png", fullPage: true }).catch(() => {});
  } finally { await page.close(); }

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  try {
    await seed(mobile);
    const response = await mobile.goto(baseURL, { waitUntil: "domcontentloaded", timeout: 30000 });
    assert.ok(response?.ok(), "GENE workspace must load on mobile");
    await mobile.locator(".mobile-preview-button").click();
    await mobile.locator(".preview-panel.expanded").waitFor({ state: "visible", timeout: 5000 });
    await mobile.locator('iframe[title="GENE live game preview"]').waitFor({ timeout: 5000 });
    const layout = await mobile.evaluate(() => ({ viewportWidth: document.documentElement.clientWidth, documentWidth: document.documentElement.scrollWidth }));
    assert.ok(layout.documentWidth <= layout.viewportWidth + 2, "mobile workspace must not overflow horizontally");
    report.checks.push({ name: "Mobile preview and workspace layout", status: "passed", details: layout });
    await mobile.screenshot({ path: out + "-mobile.png", fullPage: true }).catch(() => {});
  } finally { await mobile.close(); }
  report.status = "passed";
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  report.status = "failed";
  report.error = String(error.stack || error);
  console.error(JSON.stringify(report, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
