import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseURL = process.env.GENE_TEST_BASE_URL || "http://127.0.0.1:3000";
const projectId = "playwright-smoke-project";
const fixture = {
  id: projectId,
  name: "Playwright Canvas Runner",
  initialPrompt: "A compact original 2D arcade runner used to verify a real game render and input loop.",
  mode: "build",
  thinking: "balanced",
  messages: [{
    id: "assistant-welcome",
    role: "assistant",
    content: "This fixture exercises the real generated source preview.",
    createdAt: new Date().toISOString()
  }],
  answers: {},
  question: null,
  plan: {
    title: "Playwright Canvas Runner",
    summary: "A small game fixture used for end-to-end canvas, input, and UI smoke testing.",
    engine: "canvas2d",
    tasks: ["Render world", "Move player", "Collect tokens", "Win and restart"],
    mechanics: ["Arrow-key movement", "Token pickup", "Scoring"],
    performanceBudget: { targetFps: 60, maxEnemies: 4, maxObjects: 40, maxParticles: 8 }
  },
  files: {
    "game.html": '<main class="game-shell"><canvas id="game-canvas" width="800" height="480" tabindex="0" aria-label="Runner game canvas"></canvas><div class="game-hud"><b>OUTPOST RUN</b><span>Score <strong id="score-value">0</strong></span></div><div class="game-controls">ARROWS / WASD MOVE · COLLECT THE GOLD ORBS</div></main>',
    "game.css": '.game-shell{position:relative;width:100vw;height:100vh;overflow:hidden;background:#151e2b;color:#fff;font:12px Arial,sans-serif}#game-canvas{display:block;width:100%;height:100%;outline:none}.game-hud{position:absolute;left:18px;top:15px;right:18px;display:flex;justify-content:space-between;letter-spacing:.08em;text-shadow:0 2px 6px #000}.game-hud b{color:#a4e6cb}.game-controls{position:absolute;left:18px;bottom:14px;font-size:10px;letter-spacing:.1em;color:#d6e0e9}',
    "game.js": '(function(){const canvas=document.getElementById("game-canvas");if(!canvas)throw new Error("canvas missing");const ctx=canvas.getContext("2d");if(!ctx)throw new Error("2d context missing");const s={x:85,y:325,score:0,frame:0};const coins=[{x:240,y:270},{x:355,y:190},{x:515,y:295},{x:670,y:225}];function draw(){s.frame++;ctx.fillStyle="#142133";ctx.fillRect(0,0,canvas.width,canvas.height);const grad=ctx.createLinearGradient(0,0,0,480);grad.addColorStop(0,"#1d3552");grad.addColorStop(1,"#0b101b");ctx.fillStyle=grad;ctx.fillRect(0,0,800,480);ctx.fillStyle="#29445a";for(let i=0;i<8;i++){const x=i*120;ctx.beginPath();ctx.moveTo(x,360);ctx.lineTo(x+60,180+(i%3)*32);ctx.lineTo(x+130,360);ctx.fill()}ctx.fillStyle="#365d54";ctx.fillRect(0,365,800,115);ctx.fillStyle="#6b9c7c";ctx.fillRect(0,365,800,4);for(const coin of coins){if(coin.collected)continue;ctx.beginPath();ctx.fillStyle="#ffcf76";ctx.arc(coin.x,coin.y,11+Math.sin(s.frame*.06+coin.x)*2,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.strokeStyle="#fff0bf";ctx.lineWidth=2;ctx.arc(coin.x,coin.y,5,0,Math.PI*2);ctx.stroke();if(Math.abs(s.x-coin.x)<23&&Math.abs(s.y-coin.y)<28){coin.collected=true;s.score+=1;document.getElementById("score-value").textContent=String(s.score)}}ctx.fillStyle="#a6e8cb";ctx.fillRect(s.x-11,s.y-25,22,25);ctx.fillStyle="#effff7";ctx.fillRect(s.x-6,s.y-32,12,9);ctx.fillStyle="#101a24";ctx.fillRect(s.x+2,s.y-29,3,3);ctx.fillStyle="#c8d7e1";ctx.font="12px Arial";ctx.fillText("COLLECT THE ORBS",580,36);window.__geneSmokeState={playerX:s.x,frame:s.frame,score:s.score};requestAnimationFrame(draw)}function move(dx,dy){s.x=Math.max(18,Math.min(782,s.x+dx));s.y=Math.max(85,Math.min(355,s.y+dy));}window.addEventListener("keydown",function(e){const k=e.key.toLowerCase();if(["arrowleft","arrowright","arrowup","arrowdown"," "].includes(k))e.preventDefault();if(k==="arrowright"||k==="d")move(18,0);if(k==="arrowleft"||k==="a")move(-18,0);if(k==="arrowup"||k==="w"||k===" ")move(0,-18);if(k==="arrowdown"||k==="s")move(0,18);});draw()})();',
    "game-spec.json": JSON.stringify({
      title: "Playwright Canvas Runner",
      genre: "arcade runner",
      engine: "canvas2d",
      mechanics: ["Arrow-key movement", "Collectible orbs", "Score increases on collection"],
      controls: ["Arrow keys or WASD"],
      objective: "Collect all four gold orbs in the outpost.",
      winCondition: "All four orbs are collected.",
      lossCondition: "This smoke fixture has no damage/loss state; press restart by reloading the page.",
      performanceBudget: { targetFps: 60, maxEnemies: 0, maxObjects: 40, maxParticles: 8 }
    }, null, 2)
  },
  versions: [],
  activeFile: "game.js",
  references: [],
  updatedAt: new Date().toISOString()
};

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const fatalErrors = [];
  page.on("pageerror", error => fatalErrors.push(error.message));
  await page.addInitScript(({ project, storageKey, activeKey }) => {
    if (window.top !== window.self) return;
    localStorage.setItem(storageKey, JSON.stringify([project]));
    localStorage.setItem(activeKey, project.id);
  }, { project: fixture, storageKey: "gene.projects.v1", activeKey: "gene.active-project.v1" });
  const response = await page.goto(baseURL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  assert.ok(response && response.ok(), "GENE web workspace must respond successfully");
  const gameFrame = page.frameLocator('iframe[title="GENE live game preview"]');
  await gameFrame.locator("#game-canvas").waitFor({ timeout: 10_000 });
  await page.getByText("Visible render signal").first().waitFor({ timeout: 10_000 });
  const visual = await gameFrame.locator("#game-canvas").evaluate(canvas => {
    const node = canvas;
    const ctx = node.getContext("2d");
    const pixels = ctx.getImageData(0, 0, node.width, node.height).data;
    let colored = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] > 0 && (pixels[i] > 20 || pixels[i + 1] > 20 || pixels[i + 2] > 20)) colored++;
    }
    return { width: node.width, height: node.height, coloredPixels: colored };
  });
  assert.equal(visual.width, 800, "game canvas has the requested internal width");
  assert.ok(visual.coloredPixels > 5000, "actual generated source paints a visible scene rather than a blank canvas");

  const beforeX = await gameFrame.locator("body").evaluate(() => window.__geneSmokeState?.playerX);
  await gameFrame.locator("#game-canvas").click();
  await gameFrame.locator("#game-canvas").evaluate(canvas => canvas.focus());
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(100);
  const afterX = await gameFrame.locator("body").evaluate(() => window.__geneSmokeState?.playerX);
  assert.ok(typeof beforeX === "number" && typeof afterX === "number" && afterX > beforeX, "keyboard input changes the actual game's player position");

  const themeBefore = await page.locator("html").getAttribute("data-theme");
  await page.getByTitle("Switch theme").click();
  const themeAfter = await page.locator("html").getAttribute("data-theme");
  assert.notEqual(themeAfter, themeBefore, "theme switch responds to user input");
  await page.locator('.rail button[title="Files"]').click();
  await page.getByRole("heading", { name: "Project files" }).waitFor({ timeout: 5000 });
  assert.equal(fatalErrors.length, 0, "the page and game iframe should not emit JavaScript errors: " + fatalErrors.join(" | "));

  const webglProject = {
    ...fixture,
    id: "playwright-webgl-smoke",
    name: "Playwright WebGL Smoke",
    initialPrompt: "A minimal self-contained WebGL render used to test the real 3D canvas path.",
    plan: { ...fixture.plan, title: "Playwright WebGL Smoke", engine: "webgl3d" },
    files: {
      "game.html": '<main class="game-shell"><canvas id="game-canvas" width="800" height="480" tabindex="0"></canvas><div class="game-hud"><b>WEBGL RENDER TEST</b></div></main>',
      "game.css": '.game-shell{width:100vw;height:100vh;background:#101522}#game-canvas{width:100%;height:100%;display:block}.game-hud{position:absolute;top:12px;left:14px;color:#fff;font:12px Arial}',
      "game.js": "(function(){window.__geneWebGLSmoke={stage:\"entered\"};try{const c=document.getElementById(\"game-canvas\");if(!c)throw new Error(\"canvas missing\");const gl=c.getContext(\"webgl\",{alpha:false,antialias:false});if(!gl)throw new Error(\"WebGL context unavailable\");window.__geneWebGLSmoke={stage:\"context\",version:gl.getParameter(gl.VERSION)};const vs=gl.createShader(gl.VERTEX_SHADER);gl.shaderSource(vs,\"attribute vec2 aPosition;void main(){gl_Position=vec4(aPosition,0.0,1.0);}\");gl.compileShader(vs);if(!gl.getShaderParameter(vs,gl.COMPILE_STATUS))throw new Error(\"vertex shader: \"+gl.getShaderInfoLog(vs));window.__geneWebGLSmoke={stage:\"vertex\"};const fs=gl.createShader(gl.FRAGMENT_SHADER);gl.shaderSource(fs,\"precision mediump float;void main(){gl_FragColor=vec4(0.2,0.72,0.48,1.0);}\");gl.compileShader(fs);if(!gl.getShaderParameter(fs,gl.COMPILE_STATUS))throw new Error(\"fragment shader: \"+gl.getShaderInfoLog(fs));window.__geneWebGLSmoke={stage:\"fragment\"};const program=gl.createProgram();gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(\"program link: \"+gl.getProgramInfoLog(program));gl.useProgram(program);window.__geneWebGLSmoke={stage:\"program\"};const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-0.65,-0.55,0.65,-0.55,0,0.66]),gl.STATIC_DRAW);const loc=gl.getAttribLocation(program,\"aPosition\");if(loc<0)throw new Error(\"position attribute missing\");gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);let draws=0;function frame(){try{gl.viewport(0,0,c.width,c.height);gl.clearColor(0.035,0.05,0.085,1);gl.clear(gl.COLOR_BUFFER_BIT);gl.drawArrays(gl.TRIANGLES,0,3);gl.finish();window.__geneWebGLSmoke={stage:\"drawing\",draws:++draws,version:gl.getParameter(gl.VERSION)};requestAnimationFrame(frame)}catch(e){window.__geneWebGLSmoke={stage:\"frame-error\",message:String(e)};throw e}}requestAnimationFrame(frame)}catch(e){window.__geneWebGLSmoke={stage:\"error\",message:String(e),stack:e&&e.stack};throw e}})()",
      "game-spec.json": JSON.stringify({ title:"Playwright WebGL Smoke", genre:"3D rendering smoke test", engine:"webgl3d", mechanics:["WebGL shader","GPU buffer","Animated triangle"], controls:["Any key"], objective:"Continuously draw a visible WebGL primitive.", winCondition:"At least 10 WebGL frames have been submitted.", lossCondition:"A WebGL context or shader fails.", performanceBudget:{targetFps:60,maxEnemies:0,maxObjects:12,maxParticles:0} }, null, 2)
    }
  };
  const webglPage = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  const webglErrors = [];
  webglPage.on("pageerror", error => webglErrors.push(error.message));
  await webglPage.addInitScript(({ project, storageKey, activeKey }) => {
    if (window.top !== window.self) return;
    localStorage.setItem(storageKey, JSON.stringify([project]));
    localStorage.setItem(activeKey, project.id);
  }, { project: webglProject, storageKey: "gene.projects.v1", activeKey: "gene.active-project.v1" });
  await webglPage.goto(baseURL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  const webglFrame = webglPage.frameLocator('iframe[title="GENE live game preview"]');
  await webglFrame.locator("#game-canvas").waitFor({ timeout: 10_000 });
  await webglPage.waitForTimeout(2_500);
  console.log("WebGL preview status:", await webglPage.locator(".preview-title small").textContent());
  const drawState = await webglFrame.locator("body").evaluate(() => window.__geneWebGLSmoke);
  const runtimeDetails = await webglFrame.locator("body").evaluate(body => ({ engine: body.getAttribute("data-gene-engine"), spec: body.getAttribute("data-gene-spec"), hasCanvas: Boolean(body.querySelector("canvas")) }));
  assert.ok(drawState && drawState.draws >= 10, "3D runtime must compile shaders and submit repeated WebGL geometry draws; state=" + JSON.stringify(drawState) + "; runtime=" + JSON.stringify(runtimeDetails) + "; status=" + await webglPage.locator(".preview-title small").textContent());
  assert.ok(String(drawState.version || "").toLowerCase().includes("webgl"), "3D runtime has a real WebGL context");
  assert.equal(webglErrors.length, 0, "the WebGL project should not emit JavaScript errors: " + webglErrors.join(" | "));
  await webglPage.close();

  // Check the first complete starter game with no Gemini API key configured.
  const samplePage = await browser.newPage({ viewport: { width: 1280, height: 820 } });
  samplePage.on("pageerror", error => fatalErrors.push("starter: " + error.message));
  const emptyProject = { ...fixture, id: "playwright-empty-start", name: "Empty starter", initialPrompt: "", mode: "plan", plan: null, files: {}, versions: [], activeFile: "game.js", messages: [{ id: "hello", role: "assistant", content: "Test", createdAt: new Date().toISOString() }] };
  await samplePage.addInitScript(({ project, storageKey, activeKey }) => { localStorage.setItem(storageKey, JSON.stringify([project])); localStorage.setItem(activeKey, project.id); }, { project: emptyProject, storageKey: "gene.projects.v1", activeKey: "gene.active-project.v1" });
  await samplePage.goto(baseURL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await samplePage.getByRole("button", { name: /Try playable demo/i }).click();
  const sampleFrame = samplePage.frameLocator('iframe[title="GENE live game preview"]');
  await sampleFrame.locator("#game-canvas").waitFor({ timeout: 10_000 });
  await samplePage.getByText("Visible render signal").first().waitFor({ timeout: 10_000 });
  await sampleFrame.locator("#start-button").click();
  const sampleBefore = await sampleFrame.locator("body").evaluate(() => window.__geneStarterDebug?.x);
  await sampleFrame.locator("#game-canvas").click();
  await sampleFrame.locator("#game-canvas").evaluate(canvas => {
    canvas.focus();
    canvas.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
  });
  await samplePage.waitForTimeout(250);
  await sampleFrame.locator("#game-canvas").evaluate(canvas => canvas.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowRight", bubbles: true })));
  const sampleAfter = await sampleFrame.locator("body").evaluate(() => window.__geneStarterDebug?.x);
  const sampleDebug = await sampleFrame.locator("body").evaluate(() => window.__geneStarterDebug);
  assert.ok(typeof sampleBefore === "number" && typeof sampleAfter === "number" && sampleAfter > sampleBefore, "built-in starter starts and responds to keyboard movement; before=" + sampleBefore + "; after=" + sampleAfter + "; debug=" + JSON.stringify(sampleDebug));
  const starterInfo = await sampleFrame.locator("body").evaluate(() => ({ cores: document.getElementById("core-count")?.textContent, canvas: Boolean(document.getElementById("game-canvas")) }));
  assert.ok(starterInfo.canvas && starterInfo.cores?.includes("7"), "starter loads its real game HUD and seven-core objective");
  assert.equal(fatalErrors.length, 0, "the page and game iframe should not emit JavaScript errors: " + fatalErrors.join(" | "));
  await samplePage.close();
  console.log("Playwright browser smoke passed: 2D render + keyboard gameplay, UI/theme controls, WebGL rendering, and the no-key playable starter game.");
} finally {
  await browser.close();
}
