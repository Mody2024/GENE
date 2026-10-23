import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
const baseURL = process.env.GENE_TEST_BASE_URL || "http://127.0.0.1:3000";
const out = process.env.GENE_PLAYGROUND_OUT || "artifacts/gene-playground";
await mkdir(out, { recursive: true });
const results = [];
const startedAt = new Date().toISOString();
const browser = await chromium.launch({ headless: true, ...(process.env.GENE_CHROMIUM_PATH ? { executablePath: process.env.GENE_CHROMIUM_PATH } : {}), args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const runner = {
 id:"gene-playground-runner", name:"GENE Playground Runner", initialPrompt:"2D arcade runner QA fixture", mode:"build", thinking:"balanced",
 messages:[{id:"qa",role:"assistant",content:"Automated QA fixture",createdAt:new Date().toISOString()}], answers:{}, question:null,
 plan:{title:"QA Runner",summary:"Render, input and animation regression fixture",engine:"canvas2d",tasks:["Render","Move","Score"],mechanics:["Keyboard input","Score"],performanceBudget:{targetFps:60,maxEnemies:2,maxObjects:20,maxParticles:4}},
 files:{
 "game.html":'<main><canvas id="game-canvas" width="800" height="480" tabindex="0" aria-label="QA game canvas"></canvas><b id="score-value">0</b></main>',
 "game.css":'html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#142133;color:white}canvas{display:block;width:100%;height:100%;outline:none}b{position:absolute;top:12px;left:12px}',
 "game.js":'(function(){const c=document.getElementById("game-canvas"),x=c.getContext("2d"),p={x:90,y:300,frames:0,score:0};function draw(){p.frames++;x.fillStyle="#142133";x.fillRect(0,0,800,480);x.fillStyle="#3e785c";x.fillRect(0,365,800,115);x.fillStyle="#ffcf76";x.beginPath();x.arc(300,280,13,0,Math.PI*2);x.fill();x.fillStyle="#a6e8cb";x.fillRect(p.x-10,p.y-24,20,24);window.__genePlayground={...p};requestAnimationFrame(draw)}window.addEventListener("keydown",e=>{if(e.key==="ArrowRight"||e.key==="d")p.x+=18;if(e.key==="ArrowLeft"||e.key==="a")p.x-=18;if(e.key==="ArrowUp"||e.key==="w")p.y-=18;if(e.key==="ArrowDown"||e.key==="s")p.y+=18});draw()})();',
 "game-spec.json":JSON.stringify({title:"QA Runner",engine:"canvas2d",mechanics:["Keyboard movement"],controls:["Arrow keys or WASD"],performanceBudget:{targetFps:60,maxEnemies:2,maxObjects:20,maxParticles:4}},null,2)
 }, versions:[],activeFile:"game.js",references:[],updatedAt:new Date().toISOString()
};
const app={...runner,id:"gene-playground-app",name:"GENE Playground Task App",kind:"app",plan:{...runner.plan,title:"QA Task App",kind:"app",engine:"webapp"},files:{
 "game.html":'<main><h1>Task Board</h1><form id="task-form"><label for="task-input">Task</label><input id="task-input"><button type="submit">Add task</button></form><ul id="task-list"></ul></main>',
 "game.css":'body{font:16px Arial;background:#f3f6f8;color:#17202a;padding:24px}input,button{font:inherit;padding:8px}',
 "game.js":'(function(){const f=document.getElementById("task-form"),i=document.getElementById("task-input"),l=document.getElementById("task-list");window.__genePlaygroundApp={booted:true,submissions:0};f.addEventListener("submit",e=>{e.preventDefault();if(!i.value.trim())return;const li=document.createElement("li");li.textContent=i.value.trim();l.appendChild(li);i.value="";window.__genePlaygroundApp.submissions++})})();',
 "game-spec.json":JSON.stringify({title:"QA Task App",kind:"app",engine:"webapp",features:["Add task"]},null,2)
}};
async function seed(page, project){await page.addInitScript(value=>{if(window.top!==window.self)return;localStorage.setItem("gene.projects.v1",JSON.stringify([value]));localStorage.setItem("gene.active-project.v1",value.id)},project)}
const modular={...runner,id:"gene-playground-modular",name:"GENE Multi-file Modular Game",plan:{...runner.plan,title:"Modular Game",summary:"Verify independent modules and declared load order",engine:"canvas2d"},files:{
 "game.html":'<main><h1>Modular Systems</h1><p id="module-status">Loading</p><button id="gain">Collect</button><output id="score">0</output><canvas id="game-canvas" width="320" height="180"></canvas></main>',
 "game.css":'body{font:16px Arial;padding:20px;background:#17212b;color:white}button{padding:8px}canvas{display:block;background:#243847}',
 "src/systems/score-system.js":'window.GeneModules=window.GeneModules||{};window.GeneModules["score-system"]={create(){let value=0;return {add(n){value+=n;return value},get(){return value}}}};',
 "src/player/collector.js":'window.GeneModules=window.GeneModules||{};window.GeneModules.collector={wire(score){document.getElementById("gain").addEventListener("click",()=>{document.getElementById("score").textContent=String(score.add(1))})}};',
 "game.js":'(function(){const modules=window.GeneModules;if(!modules||!modules["score-system"]||!modules.collector){document.getElementById("module-status").textContent="MODULE ERROR";return}const score=modules["score-system"].create();modules.collector.wire(score);document.getElementById("module-status").textContent="Modules ready";const c=document.getElementById("game-canvas"),x=c.getContext("2d");x.fillStyle="#6cc6a1";x.fillRect(24,24,72,72);window.__geneModular={ready:true,modules:Object.keys(modules)};})();',
 "game-spec.json":JSON.stringify({title:"Modular Game",engine:"canvas2d",additionalFiles:["src/systems/score-system.js","src/player/collector.js"],mechanics:["Independent systems","Collect score"]},null,2)
}};

async function save(status,error){await writeFile(out+"/report.json",JSON.stringify({startedAt,finishedAt:new Date().toISOString(),baseURL,status,results,...(error?{fatalError:String(error.stack||error)}:{})},null,2))}
async function test(name,fn){const r={name,status:"passed",startedAt:new Date().toISOString()};try{r.details=await fn()}catch(e){r.status="failed";r.error=String(e.stack||e);throw e}finally{r.finishedAt=new Date().toISOString();results.push(r);await save(r.status==="failed"?"failed":"running")}}
try {
 await test("2D game rendering and keyboard gameplay",async()=>{
  const p=await browser.newPage({viewport:{width:1365,height:850}}),errors=[];
  p.on("pageerror",e=>errors.push("pageerror: "+e.message+"\\n"+String(e.stack||"")));p.on("console",m=>{if(m.type()==="error")errors.push("console: "+m.text())});
  try {await seed(p,runner);const res=await p.goto(baseURL,{waitUntil:"domcontentloaded",timeout:30000});assert.ok(res?.ok(),"workspace HTTP response");const f=p.frameLocator('iframe[title="GENE live game preview"]');await f.locator("#game-canvas").waitFor({timeout:10000});const before=await f.locator("body").evaluate(()=>window.__genePlayground);assert.ok(before?.frames>0,"animation loop started");const pixels=await f.locator("#game-canvas").evaluate(c=>{const d=c.getContext("2d").getImageData(0,0,c.width,c.height).data;let n=0;for(let i=0;i<d.length;i+=4)if(d[i+3]>0&&(d[i]>20||d[i+1]>20||d[i+2]>20))n++;return {width:c.width,height:c.height,colored:n}});assert.equal(pixels.width,800);assert.ok(pixels.colored>10000,"not a blank canvas");await f.locator("#game-canvas").click();await f.locator("#game-canvas").evaluate(c=>c.focus());await p.keyboard.press("ArrowRight");await p.waitForTimeout(120);const after=await f.locator("body").evaluate(()=>window.__genePlayground);assert.ok(after.x>before.x,"keyboard moves player");assert.ok(after.frames>before.frames,"frame loop keeps running");await p.screenshot({path:out+"/game-preview.png",fullPage:true});assert.deepEqual(errors,[],"no page/console errors");return {pixels,before,after,screenshot:"game-preview.png",errors};}
  catch(e){await p.screenshot({path:out+"/game-preview-failure.png",fullPage:true}).catch(()=>{});throw e}finally{await p.close()}
 });
 await test("Multi-file game module order, isolation and interaction",async()=>{
  const p=await browser.newPage({viewport:{width:1100,height:760}}),errors=[];
  p.on("pageerror",e=>errors.push("pageerror: "+e.message));p.on("console",m=>{if(m.type()==="error")errors.push("console: "+m.text())});
  try{await seed(p,modular);const res=await p.goto(baseURL,{waitUntil:"domcontentloaded",timeout:30000});assert.ok(res?.ok(),"workspace HTTP response");const f=p.frameLocator('iframe[title="GENE live game preview"]');await f.getByText("Modules ready").waitFor({timeout:10000});const state=await f.locator("body").evaluate(()=>window.__geneModular);assert.equal(state?.ready,true,"all modules loaded before bootstrap");assert.ok(state.modules.includes("score-system")&&state.modules.includes("collector"),"module APIs remain isolated and accessible");await f.getByRole("button",{name:"Collect"}).click();assert.equal(await f.locator("#score").textContent(),"1","module function changes live gameplay state");await f.getByRole("button",{name:"Collect"}).click();assert.equal(await f.locator("#score").textContent(),"2");assert.deepEqual(errors,[],"no browser errors");await p.screenshot({path:out+"/modular-game-preview.png",fullPage:true});return {moduleOrder:["src/systems/score-system.js","src/player/collector.js","game.js"],state,score:await f.locator("#score").textContent(),screenshot:"modular-game-preview.png",errors};}
  catch(e){await p.screenshot({path:out+"/modular-game-preview-failure.png",fullPage:true}).catch(()=>{});throw e}finally{await p.close()}
 });
 await test("Web app rendering and form interaction",async()=>{
  const p=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];p.on("pageerror",e=>errors.push(e.message));p.on("console",m=>{if(m.type()==="error")errors.push(m.text())});
  try{await seed(p,app);const res=await p.goto(baseURL,{waitUntil:"domcontentloaded",timeout:30000});assert.ok(res?.ok());const f=p.frameLocator('iframe[title="GENE live game preview"]');await f.getByRole("heading",{name:"Task Board"}).waitFor({timeout:10000});await f.locator("#task-input").fill("Verify gameplay");await f.getByRole("button",{name:"Add task"}).click();assert.equal(await f.locator("#task-list li").first().textContent(),"Verify gameplay");const state=await f.locator("body").evaluate(()=>window.__genePlaygroundApp);assert.deepEqual(state,{booted:true,submissions:1});await p.screenshot({path:out+"/webapp-preview.png",fullPage:true});assert.deepEqual(errors,[]);return {state,screenshot:"webapp-preview.png",errors};}
  catch(e){await p.screenshot({path:out+"/webapp-preview-failure.png",fullPage:true}).catch(()=>{});throw e}finally{await p.close()}
 });
 await test("Mobile preview can be opened",async()=>{const p=await browser.newPage({viewport:{width:390,height:844}});try{await seed(p,runner);const res=await p.goto(baseURL,{waitUntil:"domcontentloaded",timeout:30000});assert.ok(res?.ok());await p.locator(".mobile-preview-button").click();await p.locator(".preview-panel.expanded").waitFor({state:"visible",timeout:5000});await p.locator('iframe[title="GENE live game preview"]').waitFor({timeout:5000});await p.screenshot({path:out+"/mobile-preview.png",fullPage:true});return {viewport:"390x844",previewOpened:true,screenshot:"mobile-preview.png"}}catch(e){await p.screenshot({path:out+"/mobile-preview-failure.png",fullPage:true}).catch(()=>{});throw e}finally{await p.close()}});
 await save("passed");console.log(JSON.stringify({status:"passed",results},null,2));
} catch(e){await save("failed",e);console.error(JSON.stringify({status:"failed",results,error:String(e.stack||e)},null,2));process.exitCode=1} finally{await browser.close()}
