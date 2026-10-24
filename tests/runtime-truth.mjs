import assert from "node:assert/strict";
import { chromium } from "playwright";
import { probeProject } from "../scripts/runtime-probe.mjs";

const page = body => '<main><canvas id="game-canvas" width="640" height="360" tabindex="0"></canvas>' + body + "</main>";
const CSS = "html,body{margin:0;background:#101820}canvas{display:block;width:640px;height:360px}";
const game = (js, extra = {}) => ({ "game.html": page(""), "game.css": CSS, "game.js": js, ...extra });
const SHEET = "data:image/svg+xml;charset=utf-8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="256" height="64" viewBox="0 0 256 64">' +
  [0, 1, 2, 3].map(i => '<rect x="' + (i * 64 + 8) + '" y="8" width="48" height="48" fill="hsl(' + i * 80 + ',70%,55%)"/><circle cx="' + (i * 64 + 16 + i * 10) + '" cy="32" r="8" fill="#fff"/>').join("") + "</svg>");

const fixtures = {
  working2d: { files: game('const c=document.getElementById("game-canvas"),x=c.getContext("2d");let px=100,t=0;addEventListener("keydown",e=>{if(e.key==="ArrowRight")px+=30;if(e.code==="Space")px-=10});function f(){t++;x.fillStyle="#1d3557";x.fillRect(0,0,640,360);x.fillStyle="#2a9d8f";x.fillRect(0,300,640,60);x.fillStyle="#e9c46a";x.fillRect(px%600,260+Math.sin(t/10)*12,36,40);x.fillStyle="#e63946";x.beginPath();x.arc(500,250+Math.cos(t/9)*20,14,0,7);x.fill();requestAnimationFrame(f)}f();'), expect: "playable" },
  ghost: { files: game('const c=document.getElementById("game-canvas"),x=c.getContext("2d");const a=new AudioContext(),o=a.createOscillator();o.connect(a.destination);o.start();addEventListener("keydown",()=>{});function f(){x.clearRect(0,0,640,360);requestAnimationFrame(f)}f();'), expect: "audio-only-ghost" },
  blank: { files: game('const c=document.getElementById("game-canvas"),x=c.getContext("2d");addEventListener("keydown",()=>{});function f(){x.fillStyle="#000";x.fillRect(0,0,640,360);requestAnimationFrame(f)}f();'), expect: "not-playable", fails: ["visible-content"] },
  crash: { files: game('const c=document.getElementById("game-canvas"),x=c.getContext("2d");x.fillRect(0,0,50,50);hazards.push(1);'), expect: "not-playable", fails: ["no-runtime-errors"] },
  frozen: { files: game('const x=document.getElementById("game-canvas").getContext("2d");x.fillStyle="#264653";x.fillRect(0,0,640,360);x.fillStyle="#e76f51";x.fillRect(100,100,200,120);x.fillStyle="#fff";x.fillRect(320,160,120,90);'), expect: "not-playable", fails: ["input-handlers", "input-response", "scene-alive"] },
  sheetStatic: { files: game('const c=document.getElementById("game-canvas"),x=c.getContext("2d");const i=new Image();i.src="' + SHEET + '";addEventListener("keydown",()=>{});function f(){x.fillStyle="#222";x.fillRect(0,0,640,360);if(i.complete&&i.naturalWidth)x.drawImage(i,100,100,384,96);requestAnimationFrame(f)}f();'), contract: { expectsSpriteAnimation: true }, expect: "not-playable", fails: ["sprite-sheet-sliced"] },
  sheetOneFrame: { files: game('const c=document.getElementById("game-canvas"),x=c.getContext("2d");const i=new Image();i.src="' + SHEET + '";let px=50;addEventListener("keydown",()=>{px+=20});function f(){x.fillStyle="#222";x.fillRect(0,0,640,360);if(i.complete&&i.naturalWidth)x.drawImage(i,0,0,64,64,px,100,96,96);requestAnimationFrame(f)}f();'), contract: { expectsSpriteAnimation: true }, expect: "not-playable", fails: ["sprite-animation"] },
  sheetAnimated: { files: game('const c=document.getElementById("game-canvas"),x=c.getContext("2d");const i=new Image();i.src="' + SHEET + '";let px=50;addEventListener("keydown",e=>{if(e.key==="ArrowRight")px+=20});function f(t){x.fillStyle="#222";x.fillRect(0,0,640,360);if(i.complete&&i.naturalWidth){const n=Math.floor(t/120)%4;x.drawImage(i,n*64,0,64,64,px,100,96,96)}requestAnimationFrame(f)}requestAnimationFrame(f);'), contract: { expectsSpriteAnimation: true }, expect: "playable" },
  textGame: { files: { "game.html": '<main><h1>The Lighthouse</h1><p id="line">You reach the door.</p><button id="go">Open the door</button></main>', "game.css": "body{font:18px sans-serif;padding:24px}", "game.js": 'let n=0;document.getElementById("go").addEventListener("click",()=>{n++;document.getElementById("line").textContent="Scene "+n+": the stairs creak."});' }, contract: { textGame: true, engine: "dom", requiresMotion: false }, expect: "playable" },
  textGameDead: { files: { "game.html": '<main><h1>The Lighthouse</h1><p>You reach the door.</p><button id="go">Open the door</button></main>', "game.css": "", "game.js": 'document.getElementById("go").addEventListener("click",()=>{});' }, contract: { textGame: true, engine: "dom", requiresMotion: false }, expect: "not-playable", fails: ["input-response"] }
};
const GL = (frag, draw = true, clear = true) => game('const c=document.getElementById("game-canvas"),gl=c.getContext("webgl");function sh(t,s){const o=gl.createShader(t);gl.shaderSource(o,s);gl.compileShader(o);return o}const p=gl.createProgram();gl.attachShader(p,sh(gl.VERTEX_SHADER,"attribute vec2 a;uniform float t;void main(){gl_Position=vec4(a*(0.6+0.3*sin(t)),0.,1.);}"));gl.attachShader(p,sh(gl.FRAGMENT_SHADER,"' + frag + '"));gl.linkProgram(p);const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,0,1]),gl.STATIC_DRAW);const l=gl.getAttribLocation(p,"a");addEventListener("keydown",()=>{});function f(ms){' + (clear ? 'gl.viewport(0,0,640,360);gl.clearColor(.1,.2,.3,1);gl.clear(gl.COLOR_BUFFER_BIT);' : "") + 'gl.useProgram(p);gl.uniform1f(gl.getUniformLocation(p,"t"),ms/400);gl.enableVertexAttribArray(l);gl.vertexAttribPointer(l,2,gl.FLOAT,false,0,0);' + (draw ? "gl.drawArrays(gl.TRIANGLES,0,3);" : "") + 'requestAnimationFrame(f)}requestAnimationFrame(f);');
fixtures.webglWorking = { files: GL("precision mediump float;void main(){gl_FragColor=vec4(.9,.4,.1,1.);}"), contract: { engine: "webgl3d" }, expect: "playable" };
fixtures.webglBadShader = { files: GL("precision mediump float;void main(){gl_FragColor=vec4(undeclared,1.);}"), contract: { engine: "webgl3d" }, expect: "not-playable", fails: ["no-runtime-errors"] };
fixtures.webglNoDraw = { files: GL("precision mediump float;void main(){gl_FragColor=vec4(1.);}", false), contract: { engine: "webgl3d" }, expect: "not-playable", fails: ["draw-calls"] };

const only = process.env.GENE_RUNTIME_FIXTURE;
const summary = [];
for (const [name, fixture] of Object.entries(fixtures)) {
  if (only && only !== name) continue;
  const { report, result } = await probeProject({ chromium, files: fixture.files, contract: fixture.contract || {} });
  const failed = result.checks.filter(check => check.status === "fail").map(check => check.id);
  summary.push({ name, verdict: result.verdict, failed, idle: +report.motion.idleDelta.toFixed(4), input: +report.motion.inputDelta.toFixed(4), draws: (report.probe.draw2d || 0) + (report.probe.drawGL || 0), content: +report.visible.contentRatio.toFixed(3) });
  assert.equal(result.verdict, fixture.expect, name + ": expected " + fixture.expect + " but got " + result.verdict + "\n" + JSON.stringify({ failed, reasons: result.reasons, report }, null, 2));
  for (const id of fixture.fails || []) assert.ok(failed.includes(id), name + ": expected failing check " + id + " but failed=" + failed.join(","));
  if (fixture.expect === "playable") assert.deepEqual(failed, [], name + " must pass every check");
}
console.table(summary);
console.log("Runtime truth tests passed in a real browser (" + summary.length + " fixtures: working, ghost, blank, crash, frozen, sprite sheets, WebGL, text games).");
