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
  const visual = await gameFrame.locator("#game-canvas").evaluate(async canvas => {
    const node = canvas;
    const deadline = performance.now() + 4_000;
    let colored = 0;
    while (performance.now() < deadline) {
      const ctx = node.getContext("2d");
      if (!ctx) throw new Error("Canvas 2D context is unavailable");
      const pixels = ctx.getImageData(0, 0, node.width, node.height).data;
      colored = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i + 3] > 0 && (pixels[i] > 20 || pixels[i + 1] > 20 || pixels[i + 2] > 20)) colored++;
      }
      if (colored > 5000) break;
      await new Promise(resolve => requestAnimationFrame(() => resolve()));
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

  // Verify local couch multiplayer routes keyboard input to the correct player only.
  const multiplayerFixture = {
    ...fixture,
    id: "playwright-local-multiplayer",
    name: "Playwright Local Multiplayer",
    initialPrompt: "A 2-player local multiplayer arena with independent WASD and arrow-key controls.",
    plan: {
      ...fixture.plan,
      title: "Playwright Local Multiplayer",
      tasks: ["Render two players", "Route independent controls", "Keep both players visible"],
      mechanics: ["Two independent player states", "WASD for player one", "Arrow keys for player two"]
    },
    files: {
      "game.html": '<main class="game-shell"><canvas id="game-canvas" width="800" height="480" tabindex="0" aria-label="Local multiplayer test arena"></canvas><div class="game-hud"><b>LOCAL MULTIPLAYER</b><span>PLAYER 1 · WASD</span><span>PLAYER 2 · ARROWS</span></div></main>',
      "game.css": '.game-shell{position:relative;width:100vw;height:100vh;background:#101827;color:white;font:14px Arial}#game-canvas{width:100%;height:100%;display:block;outline:none}.game-hud{position:absolute;top:16px;left:16px;right:16px;display:flex;gap:24px;pointer-events:none}',
      "game.js": '(function(){const c=document.getElementById("game-canvas"),ctx=c.getContext("2d");const p=[{x:220,y:240,color:"#6de5b1"},{x:580,y:240,color:"#ffb86c"}];window.__geneLocalMultiState={players:p.map(q=>({x:q.x,y:q.y})),frames:0};function draw(){ctx.fillStyle="#101827";ctx.fillRect(0,0,c.width,c.height);ctx.strokeStyle="#26384b";for(let x=0;x<c.width;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,c.height);ctx.stroke()}for(let y=0;y<c.height;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(c.width,y);ctx.stroke()}p.forEach((q,i)=>{ctx.fillStyle=q.color;ctx.beginPath();ctx.arc(q.x,q.y,20,0,Math.PI*2);ctx.fill();ctx.fillStyle="#fff";ctx.font="bold 12px Arial";ctx.fillText("P"+(i+1),q.x-8,q.y+4)});window.__geneLocalMultiState={players:p.map(q=>({x:q.x,y:q.y})),frames:window.__geneLocalMultiState.frames+1};requestAnimationFrame(draw)}window.addEventListener("keydown",e=>{const k=e.key.toLowerCase();if(["w","a","s","d","arrowup","arrowleft","arrowdown","arrowright"].includes(k))e.preventDefault();if(k==="w")p[0].y-=12;if(k==="s")p[0].y+=12;if(k==="a")p[0].x-=12;if(k==="d")p[0].x+=12;if(k==="arrowup")p[1].y-=12;if(k==="arrowdown")p[1].y+=12;if(k==="arrowleft")p[1].x-=12;if(k==="arrowright")p[1].x+=12;p.forEach(q=>{q.x=Math.max(22,Math.min(778,q.x));q.y=Math.max(22,Math.min(458,q.y))})});draw()})();',
      "game-spec.json": JSON.stringify({title:"Playwright Local Multiplayer",genre:"local multiplayer arena",engine:"canvas2d",mechanics:["Independent player states","Shared arena"],controls:["Player 1: WASD","Player 2: Arrow keys"],objective:"Verify two players can move independently.",winCondition:"Both player input paths are active.",lossCondition:"This fixture tests input routing only.",performanceBudget:{targetFps:60,maxEnemies:0,maxObjects:2,maxParticles:0}},null,2)
    }
  };
  const multiPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  multiPage.on("pageerror", error => fatalErrors.push("multiplayer: " + error.message));
  await multiPage.addInitScript(({ project, storageKey, activeKey }) => {
    if (window.top !== window.self) return;
    localStorage.setItem(storageKey, JSON.stringify([project]));
    localStorage.setItem(activeKey, project.id);
  }, { project: multiplayerFixture, storageKey: "gene.projects.v1", activeKey: "gene.active-project.v1" });
  await multiPage.goto(baseURL, { waitUntil: "domcontentloaded", timeout: 30000 });
  const multiFrame = multiPage.frameLocator('iframe[title="GENE live game preview"]');
  await multiFrame.locator("#game-canvas").waitFor({ timeout: 10000 });
  await multiFrame.locator("#game-canvas").click();
  await multiFrame.locator("#game-canvas").evaluate(canvas => canvas.focus());
  const multiBefore = await multiFrame.locator("body").evaluate(() => window.__geneLocalMultiState.players);
  await multiFrame.locator("body").evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "d", bubbles: true })));
  await multiPage.waitForTimeout(40); // allow the animation loop to publish its next state snapshot
  const afterP1 = await multiFrame.locator("body").evaluate(() => window.__geneLocalMultiState.players);
  assert.ok(afterP1[0].x > multiBefore[0].x && afterP1[1].x === multiBefore[1].x, "Player 1 input must not move Player 2");
  await multiFrame.locator("body").evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })));
  await multiPage.waitForTimeout(40);
  const afterP2 = await multiFrame.locator("body").evaluate(() => window.__geneLocalMultiState.players);
  assert.ok(afterP2[1].x < afterP1[1].x && afterP2[0].x === afterP1[0].x, "Player 2 input must not move Player 1");
  assert.equal(await multiFrame.locator("#game-canvas").evaluate(canvas => canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data.length), 800 * 480 * 4, "multiplayer arena renders a full canvas");
  await multiPage.close();

  const themeBefore = await page.locator("html").getAttribute("data-theme");
  await page.getByTitle("Switch theme").click();
  const themeAfter = await page.locator("html").getAttribute("data-theme");
  assert.notEqual(themeAfter, themeBefore, "theme switch responds to user input");
  await page.locator('.rail button[title="Plan & tasks"]').click();
  await page.getByRole("heading", { name: "Plan & tasks" }).waitFor({ timeout: 5000 });
  await page.getByRole("button", { name: "Run build checks" }).click();
  await page.getByText("JavaScript syntax", { exact: true }).waitFor({ timeout: 5000 });
  await page.getByText("A visible render signal does not prove every mechanic works. Play the game and test movement, collisions, objectives, and restart behavior before sharing it.", { exact: true }).waitFor({ timeout: 5000 });
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
      "game-spec.json": JSON.stringify({ title:"Playwright WebGL Smoke", genre:"3D rendering smoke test", engine:"webgl3d", mechanics:["WebGL shader","GPU buffer","Animated triangle"], controls:["Any key"], objective:"Continuously draw a visible WebGL primitive.", winCondition:"At least 10 WebGL frames have been submitted.", lossCondition:"A WebGL context or shader fails.", performanceBudget:{targetFps:60,maxEnemies:0,maxObjects:12,maxParticles:0} }, null, 2),
      "assets/crate/model.obj": "v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3",
      "assets/crate/model.mtl": "newmtl crate\nKd 0.7 0.3 0.1",
      "assets/crate/asset.json": JSON.stringify({name:"Smoke crate",kind:"prop"})
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
  const runtimeAssets = await webglFrame.locator("body").evaluate(() => window.__GENE_ASSETS__ || {});
  assert.equal(runtimeAssets["assets/crate/model.obj"], "v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3", "live preview exposes real OBJ geometry to the game runtime");
  assert.equal(runtimeAssets["assets/crate/model.mtl"], "newmtl crate\nKd 0.7 0.3 0.1", "live preview exposes matching MTL materials");
  const parsedAssets = await webglFrame.locator("body").evaluate(() => ({ mesh: window.GENE3D.parseOBJ("assets/crate/model.obj"), materials: window.GENE3D.parseMTL("assets/crate/model.mtl") }));
  assert.equal(parsedAssets.mesh.length, 1, "OBJ parser returns one material group");
  assert.equal(parsedAssets.mesh[0].vertexCount, 3, "OBJ parser triangulates faces into three real vertices");
  assert.equal(parsedAssets.mesh[0].positions.length, 18, "OBJ parser returns positions and computed normals for each triangle vertex");
  assert.deepEqual(parsedAssets.materials.crate.kd, [0.7, 0.3, 0.1], "MTL parser preserves diffuse material colors");
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
  await samplePage.addInitScript(({ project, storageKey, activeKey }) => { if (window.top !== window.self) return; localStorage.setItem(storageKey, JSON.stringify([project])); localStorage.setItem(activeKey, project.id); }, { project: emptyProject, storageKey: "gene.projects.v1", activeKey: "gene.active-project.v1" });
  await samplePage.goto(baseURL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await samplePage.getByRole("button", { name: /Try playable demo/i }).click();
  const sampleFrame = samplePage.frameLocator('iframe[title="GENE live game preview"]');
  await sampleFrame.locator("#game-canvas").waitFor({ timeout: 10_000 });
  await samplePage.setViewportSize({ width: 390, height: 844 });
  await samplePage.waitForTimeout(250);
  await samplePage.getByTitle("Open live preview").click();
  await samplePage.locator(".preview-panel.expanded").waitFor({ state: "visible", timeout: 5_000 });
  await sampleFrame.locator("#start-button").click();
  await sampleFrame.locator("#game-message").waitFor({ state: "hidden", timeout: 5_000 });
  const startedState = await sampleFrame.locator("body").evaluate(() => new Promise(resolve => {
    const deadline = performance.now() + 1_500;
    function check() {
      const state = window.__geneStarterDebug;
      if (state?.started || performance.now() >= deadline) return resolve(state);
      requestAnimationFrame(check);
    }
    check();
  }));
  assert.ok(startedState?.started, "starter start button should transition the game into its running state; state=" + JSON.stringify(startedState));
  const sampleBefore = startedState.x;
  const rightControl = sampleFrame.locator('[data-dir="right"]');
  await rightControl.waitFor({ state: "visible", timeout: 5_000 });
  const rightBox = await rightControl.boundingBox();
  assert.ok(rightBox, "mobile right-direction control should have a visible hit area");
  await samplePage.mouse.move(rightBox.x + rightBox.width / 2, rightBox.y + rightBox.height / 2);
  await samplePage.mouse.down();
  await samplePage.waitForTimeout(350);
  await samplePage.mouse.up();
  const sampleAfter = await sampleFrame.locator("body").evaluate(() => window.__geneStarterDebug?.x);
  const sampleDebug = await sampleFrame.locator("body").evaluate(() => window.__geneStarterDebug);
  assert.ok(typeof sampleBefore === "number" && typeof sampleAfter === "number" && sampleAfter > sampleBefore, "built-in starter's on-screen movement control should move the player; before=" + sampleBefore + "; after=" + sampleAfter + "; debug=" + JSON.stringify(sampleDebug));
  const overlayVisible = !(await sampleFrame.locator("#game-message").evaluate(el => el.classList.contains("hidden")));
  if (overlayVisible) {
    await sampleFrame.locator("#start-button").click();
    await sampleFrame.locator("#game-message").waitFor({ state: "hidden", timeout: 5_000 });
  }
  const beforeGamepad = await sampleFrame.locator("body").evaluate(() => window.__geneStarterDebug?.x);
  await sampleFrame.locator("body").evaluate(() => {
    const buttons = Array.from({ length: 16 }, (_, index) => ({ pressed: index === 0 }));
    window.__geneTestGamepads = [{ id: "GENE smoke controller", mapping: "standard", axes: [1, 0], buttons, connected: true }];
    if (typeof window.__genePollGamepad !== "function") throw new Error("starter controller poll hook missing");
    window.__genePollGamepad();
    if (typeof window.__geneTestStep !== "function") throw new Error("starter deterministic update hook missing");
    window.__geneTestStep(0.32);
  });
  await samplePage.waitForTimeout(320);
  const afterGamepad = await sampleFrame.locator("body").evaluate(() => ({ x: window.__geneStarterDebug?.x, controller: window.__geneControllerStatus }));
  assert.ok(typeof beforeGamepad === "number" && typeof afterGamepad.x === "number" && afterGamepad.x > beforeGamepad, "Gamepad API analog input should move the starter player; before=" + beforeGamepad + "; after=" + JSON.stringify(afterGamepad));
  assert.equal(afterGamepad.controller?.connected, true, "starter reports a connected gamepad honestly");
  const starterInfo = await sampleFrame.locator("body").evaluate(() => ({ cores: document.getElementById("core-count")?.textContent, canvas: Boolean(document.getElementById("game-canvas")) }));
  assert.ok(starterInfo.canvas && starterInfo.cores?.includes("7"), "starter loads its real game HUD and seven-core objective");
  assert.equal(fatalErrors.length, 0, "the page and game iframe should not emit JavaScript errors: " + fatalErrors.join(" | "));
  await samplePage.close();

  const mobilePage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobilePage.addInitScript(({ project, storageKey, activeKey }) => {
    if (window.top !== window.self) return;
    localStorage.setItem(storageKey, JSON.stringify([project]));
    localStorage.setItem(activeKey, project.id);
  }, { project: fixture, storageKey: "gene.projects.v1", activeKey: "gene.active-project.v1" });
  await mobilePage.goto(baseURL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await mobilePage.getByTitle("Open live preview").click();
  await mobilePage.locator(".preview-panel.expanded").waitFor({ state: "visible", timeout: 5000 });
  await mobilePage.locator('iframe[title="GENE live game preview"]').waitFor({ timeout: 5000 });
  assert.equal(await mobilePage.getByTitle("Close expanded preview").isVisible(), true, "mobile users can open and close the live game preview");
  await mobilePage.close();

  // Verify a generated web app is rendered as a scrollable DOM and its controls work.
  const appFixture = {
    ...fixture,
    id: "playwright-app-smoke",
    name: "Playwright App Smoke",
    kind: "app",
    initialPrompt: "A tiny project tracker app with an add-task interaction.",
    mode: "build",
    plan: {
      title: "Playwright App Smoke",
      summary: "A DOM application fixture for app rendering and interaction tests.",
      kind: "app",
      engine: "webapp",
      tasks: ["Render dashboard", "Add a task", "Show the new task"],
      mechanics: ["DOM-based interface", "Add task interaction"],
      performanceBudget: { targetFps: 60, maxEnemies: 0, maxObjects: 100, maxParticles: 0 }
    },
    files: {
      "game.html": '<main class="app"><header><h1>Project Tracker</h1></header><form id="task-form"><label for="task-input">New task</label><input id="task-input" autocomplete="off"><button type="submit" id="add-task">Add task</button></form><ul id="task-list"></ul></main>',
      "game.css": 'body{margin:0;background:#f3f6f9;color:#16202a;font:16px Arial,sans-serif}.app{max-width:900px;margin:auto;padding:32px}input,button{font:inherit;padding:10px;margin:4px}',
      "game.js": '(function(){const form=document.getElementById("task-form"),input=document.getElementById("task-input"),list=document.getElementById("task-list");window.__geneAppSmoke={booted:true,submissions:0};form.addEventListener("submit",function(e){e.preventDefault();window.__geneAppSmoke.submissions++;const value=input.value.trim();if(!value)return;const li=document.createElement("li");li.textContent=value;list.appendChild(li);input.value="";});})();',
      "game-spec.json": JSON.stringify({title:"Project Tracker",kind:"app",engine:"webapp",summary:"A tiny project tracker for app preview testing.",features:["Add a task"],routes:["/"],userFlows:["Enter a task and add it to the list"],performanceBudget:{targetFps:60,maxEnemies:0,maxObjects:100,maxParticles:0}},null,2)
    },
    activeFile: "game.js"
  };
  const appPage = await browser.newPage({ viewport: { width: 1280, height: 820 } });
  const appErrors = [];
  appPage.on("pageerror", error => appErrors.push(error.message));
  await appPage.addInitScript(({project, storageKey, activeKey}) => {
    if (window.top !== window.self) return;
    localStorage.setItem(storageKey, JSON.stringify([project]));
    localStorage.setItem(activeKey, project.id);
  }, {project: appFixture, storageKey: "gene.projects.v1", activeKey: "gene.active-project.v1"});
  await appPage.goto(baseURL, {waitUntil:"domcontentloaded", timeout:30000});
  const appFrame = appPage.frameLocator('iframe[title="GENE live game preview"]');
  await appFrame.getByRole("heading", {name:"Project Tracker"}).waitFor({timeout:10000});
  const appBoot = await appFrame.locator("body").evaluate(() => ({ debug: window.__geneAppSmoke || null, form: Boolean(document.getElementById("task-form")) }));
  assert.ok(appBoot.debug?.booted && appBoot.form, "app script should boot and find its form: " + JSON.stringify(appBoot));
  await appFrame.locator("#task-input").fill("Ship the first app");
  await appFrame.locator("#add-task").click();
  const appInteraction = await appFrame.locator("body").evaluate(() => ({ debug: window.__geneAppSmoke || null, tasks: Array.from(document.querySelectorAll("#task-list li")).map(item => item.textContent) }));
  assert.ok(appInteraction.debug?.submissions === 1 && appInteraction.tasks.includes("Ship the first app"), "web app preview should handle its submit event: " + JSON.stringify(appInteraction));
  const appRuntime = await appFrame.locator("body").getAttribute("data-gene-project-kind");
  assert.equal(appRuntime, "app", "web app preview receives an app-specific runtime shell");
  assert.equal(appErrors.length, 0, "the app preview should not emit JavaScript errors: " + appErrors.join(" | "));
  await appPage.close();

  console.log("Playwright browser smoke passed: 2D render + keyboard gameplay, app DOM rendering and working form, UI/theme + build checks, WebGL rendering, built-in playable starter, and mobile preview access.");
} finally {
  await browser.close();
}
