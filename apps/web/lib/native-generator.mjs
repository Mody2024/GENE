const ENGINE_DOCS = {
  canvas2d: [
    { title: "MDN Canvas API", url: "https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API", note: "Canvas rendering, drawing primitives, and animation." },
    { title: "MDN requestAnimationFrame", url: "https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame", note: "Browser animation-loop timing." },
    { title: "MDN Web Audio API", url: "https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API", note: "Procedural sound and audio controls." }
  ],
  webgl3d: [
    { title: "MDN WebGL API", url: "https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API", note: "GPU rendering and graphics pipeline." },
    { title: "WebGL Fundamentals", url: "https://webglfundamentals.org/", note: "Practical shaders, buffers, matrices, and 3D rendering." },
    { title: "MDN Pointer Lock API", url: "https://developer.mozilla.org/en-US/docs/Web/API/Pointer_Lock_API", note: "First-person mouse control, when appropriate." }
  ],
  webapp: [
    { title: "MDN Web Forms", url: "https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Forms", note: "Accessible forms and validation." },
    { title: "MDN Web Storage API", url: "https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API", note: "Local persistence for browser apps." },
    { title: "WAI-ARIA Authoring Practices", url: "https://www.w3.org/WAI/ARIA/apg/", note: "Accessible interaction patterns." }
  ]
};

function text(value, max = 12000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function titleFrom(prompt) {
  return (text(prompt).split(/[.!?\n]/)[0] || "Gene Native Game").slice(0, 72);
}
function esc(value) {
  return String(value).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
}
function pickEngine(input) {
  if (input.kind === "app") return "webapp";
  if (["canvas2d", "webgl3d"].includes(input.engine)) return input.engine;
  return /\b(3d|three.?dimensional|first.?person|third.?person|open.?world|3d world|low.?poly)\b/i.test(input.prompt) ? "webgl3d" : "canvas2d";
}
function projectSpec(title, engine, prompt) {
  const app = engine === "webapp";
  return {
    title,
    kind: app ? "app" : "game",
    engine,
    genre: app ? "productivity app" : /platform|jump/i.test(prompt) ? "platformer" : /horror|mystery|story/i.test(prompt) ? "exploration adventure" : /race|driv/i.test(prompt) ? "arcade driving" : "arcade action",
    summary: text(prompt, 800) || "A native-generated playable project.",
    objective: app ? "Complete the primary workflow and see its result." : "Reach the target score, explore the level, and complete the challenge.",
    winCondition: app ? "The user completes the main workflow." : "Reach the target score or complete the final objective.",
    lossCondition: app ? "The user can recover from invalid input without losing work." : "Health reaches zero; restart to play again.",
    mechanics: app ? ["Persistent local state", "Validated input", "Responsive navigation"] : ["Responsive movement", "Collectibles and scoring", "Hazards and recovery", "Pause and restart"],
    controls: app ? ["Use the form and buttons with mouse, touch, or keyboard."] : ["Move with WASD or arrow keys.", "Use Space to jump or perform the primary action.", "Press P to pause and R to restart."],
    performanceBudget: { targetFps: 60, maxEnemies: app ? 0 : 12, maxObjects: 350, maxParticles: app ? 0 : 90 },
    audio: { enabled: true, implementation: "procedural-web-audio", buses: ["master", "music", "sfx"], mood: /horror|mystery/i.test(prompt) ? "mystery" : "adventure", events: { start: "Start", pickup: "Collect", hit: "Impact", win: "Success", ui: "Interface" } },
    additionalFiles: [],
    nativeGeneration: { modelUsed: false, externalAiUsed: false, strategy: "deterministic-native-template-v1" }
  };
}
function htmlShell(title, engine) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#10151b">
  <title>${esc(title)}</title>
  <link rel="stylesheet" href="game.css">
</head>
<body>
  <main id="game-shell" data-engine="${engine}">
    <header class="topbar"><div><p class="eyebrow">GENE / NATIVE BUILD</p><h1 id="game-title">${esc(title)}</h1></div><div class="hud" aria-live="polite"><span id="score-label">SCORE</span><strong id="score">0</strong><span id="status">READY</span></div></header>
    <section class="stage" aria-label="Game area"><canvas id="game-canvas" aria-label="${esc(title)} play area"></canvas><div id="overlay" class="overlay"><div class="overlay-card"><p class="eyebrow">YOUR WORLD IS READY</p><h2 id="overlay-title">Ready to play?</h2><p id="overlay-copy">Move, explore, collect, and beat your best score.</p><button id="start-button" type="button">Start game</button></div></div></section>
    <footer class="controls"><span id="control-hint">Move: WASD / arrows · Action: Space · Pause: P · Restart: R</span><button id="pause-button" type="button">Pause</button><button id="restart-button" type="button">Restart</button><button id="audio-button" type="button">Sound: on</button></footer>
    <p id="help" class="help">Built without external AI calls. Your progress is stored locally in this browser.</p>
  </main>
  <script src="game.js"></script>
</body>
</html>`;
}
const css = `:root{color-scheme:dark;--bg:#0b1015;--panel:#141d25;--line:#293744;--text:#edf4f7;--muted:#a0b1bb;--accent:#b8e3d0;--accent-ink:#10251e}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(ellipse at 50% -20%,#263b46 0,transparent 55%),var(--bg);color:var(--text);font:15px/1.5 ui-sans-serif,system-ui,-apple-system,sans-serif}button{font:inherit;font-weight:650;border:1px solid var(--line);border-radius:11px;padding:10px 15px;background:#1b2832;color:var(--text);cursor:pointer;transition:transform .15s,border-color .15s}button:hover{border-color:var(--accent);transform:translateY(-1px)}button:focus-visible{outline:3px solid var(--accent);outline-offset:3px}#game-shell{max-width:1180px;margin:0 auto;padding:clamp(12px,3vw,28px)}.topbar{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-bottom:16px}.eyebrow{margin:0 0 4px;color:var(--accent);font-size:10px;font-weight:800;letter-spacing:.18em}h1{font-size:clamp(20px,3vw,32px);letter-spacing:-.04em;margin:0}.hud{display:flex;align-items:center;gap:12px;background:var(--panel);border:1px solid var(--line);border-radius:13px;padding:9px 13px}.hud span{font-size:10px;letter-spacing:.1em;color:var(--muted)}.hud strong{font-size:21px}.stage{position:relative;overflow:hidden;border:1px solid #344754;border-radius:18px;background:#0a1118;box-shadow:0 24px 80px #0005;min-height:300px}canvas{display:block;width:100%;height:min(68vh,650px);min-height:300px;touch-action:none}.overlay{position:absolute;inset:0;display:grid;place-items:center;padding:18px;background:linear-gradient(120deg,#071018aa,#07101855);backdrop-filter:blur(3px)}.overlay.hidden{display:none}.overlay-card{max-width:420px;text-align:center;padding:28px;background:#101a22eF;border:1px solid #ffffff22;border-radius:20px;box-shadow:0 20px 80px #0007}.overlay-card h2{font-size:clamp(24px,4vw,40px);line-height:1.05;letter-spacing:-.04em;margin:8px 0}.overlay-card p:not(.eyebrow){color:var(--muted)}.overlay-card button{margin-top:8px;background:var(--accent);color:var(--accent-ink);border-color:transparent;padding:12px 22px}.controls{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:12px 2px}.controls span{flex:1;min-width:220px;color:var(--muted);font-size:12px}.help{color:#81949f;font-size:11px;margin:4px 2px}@media(max-width:560px){.topbar{align-items:flex-start;flex-direction:column}.hud{width:100%;justify-content:space-between}.controls button{flex:1}.controls span{flex-basis:100%}canvas{height:56vh;min-height:280px}}@media(prefers-reduced-motion:reduce){*{transition:none!important;scroll-behavior:auto!important}}`;

function canvasGameJs(title, prompt) {
  const platformer = /platform|jump|side.?scroll/i.test(prompt);
  const spooky = /horror|mystery|dark|haunt/i.test(prompt);
  const playerColor = spooky ? "#c6d7e2" : "#b8e3d0";
  return `(() => {
"use strict";
const canvas=document.getElementById("game-canvas"),ctx=canvas.getContext("2d");
const scoreEl=document.getElementById("score"),statusEl=document.getElementById("status"),overlay=document.getElementById("overlay"),overlayTitle=document.getElementById("overlay-title"),overlayCopy=document.getElementById("overlay-copy"),startBtn=document.getElementById("start-button"),pauseBtn=document.getElementById("pause-button"),restartBtn=document.getElementById("restart-button"),audioBtn=document.getElementById("audio-button");
const W=960,H=540;let scale=1,score=0,running=false,paused=false,ended=false,last=0,elapsed=0,muted=false,audio=null;
const keys=new Set(),player={x:120,y:360,vx:0,vy:0,r:16,health:3,grounded:false};
let items=[],hazards=[],particles=[],camera=0;
function resize(){const rect=canvas.getBoundingClientRect();const dpr=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.max(1,Math.round(rect.width*dpr));canvas.height=Math.max(1,Math.round(rect.height*dpr));scale=Math.min(canvas.width/W,canvas.height/H);ctx.setTransform(scale,0,0,scale,0,0)}
window.addEventListener("resize",resize);resize();
function sound(freq=440,duration=.08,type="sine"){if(muted)return;try{audio=audio||new(window.AudioContext||window.webkitAudioContext)();if(audio.state==="suspended")audio.resume();const o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(.055,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+duration)}catch{}}
function reset(){score=0;elapsed=0;player.x=120;player.y=360;player.vx=0;player.vy=0;player.health=3;player.grounded=false;camera=0;items=[];hazards=[];particles=[];for(let i=0;i<24;i++)items.push({x:260+i*155,y:${platformer ? "310+(i%3)*-65" : "160+(i%5)*62"},r:9,taken:false});for(let i=0;i<11;i++)hazards.push({x:500+i*300,y:${platformer ? "420" : "300+(i%3)*65"},r:${platformer ? "18" : "16"},phase:i*1.7});scoreEl.textContent="0";statusEl.textContent="READY"}
function start(){if(ended)reset();running=true;paused=false;ended=false;overlay.classList.add("hidden");statusEl.textContent="PLAYING";sound(620,.12);last=performance.now();requestAnimationFrame(loop)}
function finish(win){running=false;ended=true;overlay.classList.remove("hidden");overlayTitle.textContent=win?"Challenge complete!":"Try again";overlayCopy.textContent=win?"You cleared the course. Restart to beat your score.":"You ran out of health. Your next run starts fresh.";startBtn.textContent="Play again";statusEl.textContent=win?"COMPLETE":"GAME OVER";sound(win?760:180,.24,win?"sine":"triangle");}
function pause(){if(!running)return;paused=!paused;statusEl.textContent=paused?"PAUSED":"PLAYING";pauseBtn.textContent=paused?"Resume":"Pause";if(!paused){last=performance.now();requestAnimationFrame(loop)}}
function update(dt){elapsed+=dt;const left=keys.has("ArrowLeft")||keys.has("a"),right=keys.has("ArrowRight")||keys.has("d"),up=keys.has("ArrowUp")||keys.has("w"),down=keys.has("ArrowDown")||keys.has("s");
player.vx+=(Number(right)-Number(left))*1500*dt;player.vx*=Math.pow(.001,dt);player.vx=Math.max(-270,Math.min(270,player.vx));
${platformer ? "if((up||keys.has(' '))&&player.grounded){player.vy=-560;player.grounded=false;sound(420,.08)}player.vy+=1300*dt;player.y+=player.vy*dt;player.grounded=false;if(player.y+player.r>=420){player.y=420-player.r;player.vy=0;player.grounded=true}if(player.y<20){player.y=20;player.vy=0}" : "player.vy+=(Number(down)-Number(up))*1000*dt;player.vy*=Math.pow(.003,dt);player.vy=Math.max(-230,Math.min(230,player.vy));player.y+=player.vy*dt;player.y=Math.max(65,Math.min(H-55,player.y));"}
player.x+=player.vx*dt;player.x=Math.max(32,Math.min(340,player.x));camera+=Math.max(0,player.vx)*dt*.8;
for(const item of items){if(item.taken)continue;const ix=item.x-camera,iy=item.y;if(Math.hypot(player.x-ix,player.y-iy)<player.r+item.r){item.taken=true;score+=10;scoreEl.textContent=String(score);sound(820,.07);for(let j=0;j<8;j++)particles.push({x:ix,y:iy,vx:(Math.random()-.5)*170,vy:(Math.random()-.5)*170,life:.45})}}
for(const h of hazards){const hx=h.x-camera;if(hx< -50||hx>W+50)continue;const hy=h.y+${platformer ? "0" : "Math.sin(elapsed*1.5+h.phase)*26"};if(Math.hypot(player.x-hx,player.y-hy)<player.r+h.r){player.health--;h.x+=180;player.vx=-player.vx*.6;player.vy=-220;sound(140,.15,"triangle");if(player.health<=0){finish(false);return}}}
for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt}particles=particles.filter(p=>p.life>0);
if(score>=120){finish(true);return}if(player.x+camera>3300){finish(true);return}
}
function draw(){const g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,"${spooky ? "#101b2c" : "#132c3a"}");g.addColorStop(1,"${spooky ? "#251b2a" : "#1a463f"}");ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
for(let i=0;i<40;i++){const x=((i*173-camera*.18)%1100+1100)%1100;const y=(i*79)%330;ctx.fillStyle=i%4===0?"#d7e7e755":"#9bb6c422";ctx.fillRect(x,y,2,2)}
ctx.fillStyle="${spooky ? "#3b3446" : "#244c49"}";for(let i=0;i<14;i++){const x=((i*120-camera*.4)%1200+1200)%1200-60;ctx.beginPath();ctx.moveTo(x,420);ctx.lineTo(x+55,240+(i%3)*28);ctx.lineTo(x+110,420);ctx.fill()}
ctx.fillStyle="${platformer ? "#304b43" : "#1b3039"}";ctx.fillRect(0,420,W,120);ctx.fillStyle="#91c9ad";ctx.fillRect(0,420,W,3);
${platformer ? "for(let i=0;i<18;i++){const x=((i*145-camera*.8)%1250+1250)%1250-30;const y=350-(i%3)*62;ctx.fillStyle='#355e55';ctx.fillRect(x,y,94,12);ctx.fillStyle='#8bc4a7';ctx.fillRect(x,y,94,3)}" : ""}
for(const item of items){if(item.taken)continue;const x=item.x-camera;if(x< -30||x>W+30)continue;ctx.save();ctx.translate(x,item.y);ctx.rotate(elapsed*1.5);ctx.fillStyle="#f6d58b";ctx.shadowColor="#f6d58b";ctx.shadowBlur=14;ctx.beginPath();ctx.moveTo(0,-10);ctx.lineTo(8,0);ctx.lineTo(0,10);ctx.lineTo(-8,0);ctx.closePath();ctx.fill();ctx.restore()}
for(const h of hazards){const x=h.x-camera;if(x< -50||x>W+50)continue;ctx.fillStyle="${spooky ? "#c77888" : "#ef927e"}";ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=10;ctx.beginPath();ctx.arc(x,h.y+${platformer ? "0" : "Math.sin(elapsed*1.5+h.phase)*26"},h.r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0}
ctx.fillStyle="${playerColor}";ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=16;ctx.beginPath();ctx.arc(player.x,player.y,player.r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.fillStyle="#14251f";ctx.beginPath();ctx.arc(player.x+5,player.y-3,3,0,Math.PI*2);ctx.fill();
ctx.fillStyle="#e5edf0";ctx.font="700 12px system-ui";ctx.fillText("HEALTH "+ "♥ ".repeat(Math.max(0,player.health)),20,28);ctx.fillStyle="#a8c0ca";ctx.fillText("GOAL 120",W-92,28);
for(const p of particles){ctx.globalAlpha=Math.max(0,p.life*2);ctx.fillStyle="#f6d58b";ctx.fillRect(p.x,p.y,3,3)}ctx.globalAlpha=1;
}
function loop(now){if(!running||paused)return;const dt=Math.min(.033,Math.max(0,(now-last)/1000));last=now;update(dt);draw();if(running&&!paused)requestAnimationFrame(loop)}
window.addEventListener("keydown",e=>{const key=e.key.toLowerCase();if(["arrowup","arrowdown","arrowleft","arrowright"," "].includes(key))e.preventDefault();keys.add(key);if(key==="p")pause();if(key==="r"){reset();draw();if(running){running=false;start()}}if(!running&&key==="enter")start()});
window.addEventListener("keyup",e=>keys.delete(e.key.toLowerCase()));
let pointer=null;canvas.addEventListener("pointerdown",e=>{pointer=e.clientX;canvas.setPointerCapture?.(e.pointerId);if(!running)start()});canvas.addEventListener("pointermove",e=>{if(pointer!==null){const delta=e.clientX-pointer;keys.delete("a");keys.delete("d");if(delta>4)keys.add("d");if(delta< -4)keys.add("a");pointer=e.clientX}});canvas.addEventListener("pointerup",()=>{pointer=null;keys.delete("a");keys.delete("d")});
startBtn.addEventListener("click",start);pauseBtn.addEventListener("click",pause);restartBtn.addEventListener("click",()=>{running=false;reset();draw();start()});audioBtn.addEventListener("click",()=>{muted=!muted;audioBtn.textContent="Sound: "+(muted?"off":"on");if(!muted)sound(600,.06)});
reset();draw();
})();`;
}
function webglGameJs() {
  return `(() => {"use strict";
const canvas=document.getElementById("game-canvas"),gl=canvas.getContext("webgl",{antialias:true,alpha:false});
const overlay=document.getElementById("overlay"),startBtn=document.getElementById("start-button"),scoreEl=document.getElementById("score"),status=document.getElementById("status"),pauseBtn=document.getElementById("pause-button"),restartBtn=document.getElementById("restart-button"),audioBtn=document.getElementById("audio-button");
if(!gl){document.getElementById("overlay-title").textContent="WebGL unavailable";document.getElementById("overlay-copy").textContent="This browser or device does not support WebGL. Try a WebGL-enabled browser.";return}
const vs="attribute vec3 p;attribute vec3 c;uniform mat4 mvp;varying vec3 v;void main(){v=c;gl_Position=mvp*vec4(p,1.0);}";
const fs="precision mediump float;varying vec3 v;void main(){gl_FragColor=vec4(v,1.0);}";
function shader(type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s}
const program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,vs));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fs));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));gl.useProgram(program);
const verts=[],colors=[];const faces=[[[0,0,1],[1,0,0]],[[0,0,-1],[0.2,0.5,0.9]],[[0,1,0],[0.5,0.9,0.7]],[[0,-1,0],[0.8,0.6,0.3]],[[1,0,0],[0.9,0.4,0.3]],[[-1,0,0],[0.7,0.8,0.9]]];
const corners=[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]];
const quads=[[4,5,6,7],[1,0,3,2],[3,7,6,2],[0,1,5,4],[5,1,2,6],[0,4,7,3]];
for(let f=0;f<quads.length;f++){const q=quads[f],ids=[q[0],q[1],q[2],q[0],q[2],q[3]],color=faces[f][1];for(const id of ids){verts.push(...corners[id]);colors.push(...color)}}
const vb=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,vb);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(verts),gl.STATIC_DRAW);const p=gl.getAttribLocation(program,"p");gl.enableVertexAttribArray(p);gl.vertexAttribPointer(p,3,gl.FLOAT,false,0,0);
const cb=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,cb);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(colors),gl.STATIC_DRAW);const c=gl.getAttribLocation(program,"c");gl.enableVertexAttribArray(c);gl.vertexAttribPointer(c,3,gl.FLOAT,false,0,0);
function mul(a,b){const o=new Float32Array(16);for(let r=0;r<4;r++)for(let col=0;col<4;col++)o[col*4+r]=a[r]*b[col*4]+a[4+r]*b[col*4+1]+a[8+r]*b[col*4+2]+a[12+r]*b[col*4+3];return o}
function perspective(fovy,aspect,near,far){const f=1/Math.tan(fovy/2),nf=1/(near-far);return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)*nf,-1,0,0,2*far*near*nf,0])}
function identity(){return new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1])}
function rotateY(a){const c=Math.cos(a),s=Math.sin(a);return new Float32Array([c,0,-s,0,0,1,0,0,s,0,c,0,0,0,0,1])}
function rotateX(a){const c=Math.cos(a),s=Math.sin(a);return new Float32Array([1,0,0,0,0,c,s,0,0,-s,c,0,0,0,0,1])}
function translate(z){const m=identity();m[14]=z;return m}
let running=false,paused=false,angle=0,score=0,last=0,keys=new Set(),muted=false,audio=null;
function beep(){if(muted)return;try{audio=audio||new(window.AudioContext||window.webkitAudioContext)();const o=audio.createOscillator(),g=audio.createGain();o.frequency.value=540;g.gain.value=.04;o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+.08)}catch{}}
function resize(){const d=Math.min(window.devicePixelRatio||1,2);const w=canvas.clientWidth,h=canvas.clientHeight;if(canvas.width!==Math.round(w*d)||canvas.height!==Math.round(h*d)){canvas.width=Math.round(w*d);canvas.height=Math.round(h*d)}gl.viewport(0,0,canvas.width,canvas.height)}
function draw(now){resize();gl.enable(gl.DEPTH_TEST);gl.clearColor(.035,.07,.105,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);const a=angle+(keys.has("arrowleft")||keys.has("a")?-.7:0)+((keys.has("arrowright")||keys.has("d") ? .7 : 0));let m=mul(rotateY(a),rotateX(Math.sin(now*.0005)*.25));m=mul(translate(-4.8),m);m=mul(perspective(Math.PI/3,canvas.width/Math.max(1,canvas.height),.1,100),m);gl.uniformMatrix4fv(gl.getUniformLocation(program,"mvp"),false,m);gl.drawArrays(gl.TRIANGLES,0,verts.length/3);gl.uniformMatrix4fv(gl.getUniformLocation(program,"mvp"),false,mul(perspective(Math.PI/3,canvas.width/Math.max(1,canvas.height),.1,100),mul(translate(-7.5),mul(rotateY(-a*.6),rotateX(.3)))));gl.drawArrays(gl.TRIANGLES,0,verts.length/3)}
function loop(now){if(!running||paused)return;const dt=Math.min(.05,(now-last)/1000||0);last=now;angle+=dt*.55;score+=dt;scoreEl.textContent=String(Math.floor(score*10));draw(now);requestAnimationFrame(loop)}
function start(){running=true;paused=false;overlay.classList.add("hidden");status.textContent="EXPLORING";last=performance.now();beep();requestAnimationFrame(loop)}
function pause(){if(!running)return;paused=!paused;status.textContent=paused?"PAUSED":"EXPLORING";pauseBtn.textContent=paused?"Resume":"Pause";if(!paused){last=performance.now();requestAnimationFrame(loop)}}
window.addEventListener("resize",resize);window.addEventListener("keydown",e=>{keys.add(e.key.toLowerCase());if(e.key.toLowerCase()==="p")pause()});window.addEventListener("keyup",e=>keys.delete(e.key.toLowerCase()));canvas.addEventListener("pointermove",e=>{if(e.buttons)angle+=(e.movementX||0)*.008});startBtn.addEventListener("click",start);pauseBtn.addEventListener("click",pause);restartBtn.addEventListener("click",()=>{angle=0;score=0;scoreEl.textContent="0";if(!running)start()});audioBtn.addEventListener("click",()=>{muted=!muted;audioBtn.textContent="Sound: "+(muted?"off":"on");if(!muted)beep()});draw(0);
})();`;
}
function appJs(title) {
  return `(() => {"use strict";const form=document.getElementById("task-form"),input=document.getElementById("task-input"),list=document.getElementById("task-list"),count=document.getElementById("task-count"),filter=document.getElementById("task-filter");let tasks=[];try{tasks=JSON.parse(localStorage.getItem("gene-native-tasks")||"[]")}catch{}function save(){localStorage.setItem("gene-native-tasks",JSON.stringify(tasks));render()}function render(){list.innerHTML="";const shown=tasks.filter(t=>filter.value==="all"||(filter.value==="open"&&!t.done)||(filter.value==="done"&&t.done));for(const task of shown){const li=document.createElement("li");li.className=task.done?"done":"";const check=document.createElement("input");check.type="checkbox";check.checked=task.done;check.setAttribute("aria-label","Complete "+task.text);check.addEventListener("change",()=>{task.done=check.checked;save()});const label=document.createElement("span");label.textContent=task.text;const del=document.createElement("button");del.type="button";del.textContent="Delete";del.addEventListener("click",()=>{tasks=tasks.filter(t=>t.id!==task.id);save()});li.append(check,label,del);list.append(li)}count.textContent=tasks.filter(t=>!t.done).length+" remaining · "+tasks.length+" total"}form.addEventListener("submit",e=>{e.preventDefault();const value=input.value.trim();if(!value){input.focus();return}tasks.unshift({id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),text:value.slice(0,180),done:false});input.value="";save();input.focus()});filter.addEventListener("change",render);render()})();`;
}
function appHtml(title) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><link rel="stylesheet" href="game.css"></head><body><main class="app"><header><p class="eyebrow">GENE / NATIVE APP</p><h1>${esc(title)}</h1><p class="sub">A calm, local-first workspace. Your items stay in this browser.</p></header><section class="panel"><form id="task-form"><label for="task-input">What do you want to track?</label><div class="entry"><input id="task-input" maxlength="180" placeholder="Add a task or idea…" required><button type="submit">Add item</button></div></form><div class="list-head"><strong id="task-count">0 remaining</strong><label>Show <select id="task-filter"><option value="all">All items</option><option value="open">Open</option><option value="done">Completed</option></select></label></div><ul id="task-list"></ul></section><p class="help">No account or external service required. Data is saved in this browser.</p></main><script src="game.js"></script></body></html>`;
}
const appCss = `:root{color-scheme:light;--ink:#17232a;--muted:#667780;--line:#dce5e8;--accent:#176b58;--bg:#f3f7f6}*{box-sizing:border-box}body{margin:0;background:linear-gradient(145deg,#edf5f1,#f8faf9 60%);color:var(--ink);font:15px/1.5 ui-sans-serif,system-ui,sans-serif}.app{width:min(760px,calc(100% - 32px));margin:clamp(28px,8vh,90px) auto}.eyebrow{font-size:10px;letter-spacing:.18em;color:var(--accent);font-weight:800;margin:0 0 8px}h1{font-size:clamp(30px,5vw,48px);letter-spacing:-.05em;margin:0}.sub{color:var(--muted);margin:8px 0 26px}.panel{background:#fff;border:1px solid var(--line);border-radius:20px;padding:clamp(16px,4vw,28px);box-shadow:0 18px 60px #29473a0a}label{font-weight:650;font-size:13px}.entry{display:flex;gap:8px;margin-top:8px}input,select,button{font:inherit;border:1px solid var(--line);border-radius:10px;padding:11px 12px}input{flex:1;min-width:0}button{background:var(--accent);border-color:var(--accent);color:#fff;font-weight:700;cursor:pointer}button:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #7bc4ae;outline-offset:2px}.list-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:24px;padding-top:18px;border-top:1px solid var(--line)}.list-head label{display:flex;align-items:center;gap:7px}ul{list-style:none;padding:0;margin:12px 0 0}li{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid #edf1f2}li input{flex:0 0 auto;width:17px;height:17px;accent-color:var(--accent)}li span{flex:1;overflow-wrap:anywhere}li.done span{color:#81908a;text-decoration:line-through}li button{background:transparent;color:#68777c;border-color:var(--line);padding:6px 9px;font-size:12px}.help{font-size:12px;color:var(--muted);margin-top:16px}@media(max-width:480px){.entry{flex-direction:column}.list-head{align-items:flex-start;flex-direction:column}}`;

export function createNativeResult(input = {}) {
  const prompt = text(input.message || input.prompt);
  if (!prompt) throw new TypeError("Enter a game or app idea first.");
  const kind = input.project?.kind === "app" || input.kind === "app" ? "app" : "game";
  const engine = pickEngine({ kind, engine: input.project?.preferredEngine || input.project?.plan?.engine || input.engine, prompt });
  const projectName = text(input.project?.name);
  const title = titleFrom(input.project?.plan?.title || (projectName && projectName !== "New project" ? projectName : "") || input.project?.initialPrompt || prompt);
  const operation = text(input.operation || "build");
  const references = ENGINE_DOCS[engine];
  const plan = {
    title, kind, engine,
    summary: "Native-only build plan for: " + prompt.slice(0, 700),
    tasks: kind === "app"
      ? ["Define the main user flow and data contract", "Build responsive semantic UI", "Wire validation and visible state changes", "Persist state locally", "Run source and interaction checks"]
      : ["Establish the playable core loop and controls", "Implement responsive rendering and game state", "Add score, hazards, recovery, and restart", "Connect audio feedback and controls", "Run source checks and manual gameplay review"],
    mechanics: kind === "app" ? ["Responsive UI", "Form validation", "Local persistence", "Accessible interactions"] : ["Movement", "Scoring", "Hazards", "Pause and restart", "Procedural audio"],
    performanceBudget: { targetFps: 60, maxEnemies: kind === "app" ? 0 : 12, maxObjects: 350, maxParticles: kind === "app" ? 0 : 90 },
    references,
    research: { mode: "source-index", externalAiUsed: false, searchedLiveWeb: false, note: "These are curated official/reference sources, not live search results. Use the included search links for live web research." }
  };
  if (operation === "research") {
    const q = encodeURIComponent(prompt);
    return { reply: "Native research mode: no AI API was called. Here are engine-specific references and direct live-search links. Live results are opened in your browser; this response does not claim to have read them.", files: [], plan, complete: true, needsUserDecision: false, research: { sources: references, searches: [
      { title: "Search the web", url: "https://www.google.com/search?q=" + q },
      { title: "Search GitHub", url: "https://github.com/search?q=" + q + "&type=code" },
      { title: "Search MDN", url: "https://developer.mozilla.org/en-US/search?q=" + q }
    ] } };
  }
  if (operation === "interview") {
    return { reply: "Native mode is active. This deterministic starter asks for your highest-impact choices before building.", question: { id: "native-core-loop", text: "What should the player do most of the time? Choose the main gameplay loop, then Gene will create a playable first build.", why: "The core loop affects movement, goals, level design, and the test plan.", choices: ["Explore and collect", "Fight enemies", "Platform and jump", "Solve puzzles", "Drive or run", "Manage/build"], recommended: "Explore and collect", step: 1, total: 1 }, files: [], plan: null, complete: false, needsUserDecision: true };
  }
  if (operation === "plan" || operation === "enhancePrompt") {
    return { reply: "Created a native, rule-based plan without external AI calls. This is structured planning, not neural-model reasoning.", files: [], plan, complete: true, needsUserDecision: false, references };
  }
  if (operation === "chat") {
    const memory = Array.isArray(input.history) ? input.history.slice(-8).map(item => text(item?.content || item?.text, 500)).filter(Boolean) : [];
    return { reply: "Gene Native mode is running without an external AI model. I can currently use deterministic planning, build the playable starter, and attach engine references. Your request was: " + prompt.slice(0, 1200) + (memory.length ? "\nRecent conversation context: " + memory.join(" | ").slice(0, 900) : ""), files: [], plan, complete: true, needsUserDecision: false, references };
  }
  const spec = projectSpec(title, engine, prompt);
  const files = engine === "webapp"
    ? [
        { path: "game.html", content: appHtml(title) },
        { path: "game.css", content: appCss },
        { path: "game.js", content: appJs(title) },
        { path: "game-spec.json", content: JSON.stringify({ ...spec, features: ["Add and delete items", "Mark items complete", "Filter by status", "Persist data in local storage"], routes: ["Main workspace"], userFlows: ["Add item", "Complete item", "Delete item", "Filter items"] }, null, 2) }
      ]
    : [
        { path: "game.html", content: htmlShell(title, engine) },
        { path: "game.css", content: css },
        { path: "game.js", content: engine === "webgl3d" ? webglGameJs() : canvasGameJs(title, prompt) },
        { path: "game-spec.json", content: JSON.stringify(spec, null, 2) }
      ];
  return {
    reply: "Native-only starter generated for " + title + ". No third-party AI provider was called. This is a playable foundation, not a finished high-end game: the current native generator uses deterministic templates rather than a trained capable language model. Run validation and gameplay tests, then iterate.",
    files,
    plan: { ...plan, nativeGeneration: { modelUsed: false, externalAiUsed: false, strategy: "deterministic-native-template-v1" } },
    complete: true,
    needsUserDecision: false,
    references,
    nativeGeneration: { modelUsed: false, externalAiUsed: false, qualityLevel: "playable-starter" }
  };
}

export function nativeSearchLinks(query) {
  const q = encodeURIComponent(text(query, 500));
  return [
    { title: "Web search", url: "https://www.google.com/search?q=" + q },
    { title: "GitHub code search", url: "https://github.com/search?q=" + q + "&type=code" },
    { title: "MDN documentation search", url: "https://developer.mozilla.org/en-US/search?q=" + q }
  ];
}
