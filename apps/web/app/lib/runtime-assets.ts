import { buildRuntimeKitScript } from "./runtime-kit.mjs";

export const MAX_RUNTIME_ASSET_BYTES = 1_500_000;
/** Illustration SVGs live at assets/art/<name>.svg and are exposed to the game as window.GENE_ART. */
export const RUNTIME_ART_PATH = /^assets\/(?:art\/[a-zA-Z0-9_-]+\.svg|[a-zA-Z0-9_-]+\/sprite\.svg|forge2d\/(?:character|tileset|background)\.svg)$/i;

/**
 * Exposes saved GENE Forge text assets and a small dependency-free OBJ/MTL
 * parser to the isolated game iframe. This is not a rigging or animation
 * system; it turns generated static mesh files into usable WebGL geometry.
 */
export function buildRuntimeAssetBootstrap(files: Record<string, string> | undefined): string {
  const assets: Record<string, string> = {};
  let totalBytes = 0;
  for (const [path, content] of Object.entries(files || {})) {
    if (!/^assets\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*\.(?:obj|mtl)$/i.test(path) && !/^assets\/[a-zA-Z0-9_-]+\/(?:asset\.json|asset-2d\.json)$/i.test(path) && !/^assets\/forge2d\/(?:character|tileset|background)\.json$/i.test(path) && !RUNTIME_ART_PATH.test(path)) continue;
    if (typeof content !== "string" || totalBytes + content.length > MAX_RUNTIME_ASSET_BYTES) continue;
    assets[path] = content;
    totalBytes += content.length;
  }
  // Escape "<" so imported text cannot terminate this inline bootstrap script.
  const serialized = JSON.stringify(assets).replace(/</g, "\\u003c");
  const runtime = [
    "window.__GENE_ASSETS__=" + serialized + ";",
    "window.GENE3D=window.GENE3D||{};",
    "window.GENE3D.parseMTL=function(path){var src=window.__GENE_ASSETS__[path];if(typeof src!==\"string\")throw new Error(\"Missing material asset: \"+path);var out={},current=null;src.split(/\\r?\\n/).forEach(function(line){var p=line.trim().split(/\\s+/);if(p[0]===\"newmtl\"){current=p.slice(1).join(\" \");out[current]={kd:[0.7,0.7,0.7]};}else if(p[0]===\"Kd\"&&current&&p.length>=4){var rgb=p.slice(1,4).map(Number);if(rgb.every(Number.isFinite))out[current].kd=rgb.map(function(n){return Math.max(0,Math.min(1,n));});}});return out;};",
    "window.GENE3D.parseOBJ=function(path){var src=window.__GENE_ASSETS__[path];if(typeof src!==\"string\")throw new Error(\"Missing OBJ asset: \"+path);var vertices=[],groups={},current=\"default\";function emit(i0,i1,i2){var a=vertices[i0],b=vertices[i1],c=vertices[i2];if(!a||!b||!c)return;var ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2],nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx,len=Math.hypot(nx,ny,nz)||1;nx/=len;ny/=len;nz/=len;var out=groups[current]||(groups[current]=[]);[a,b,c].forEach(function(v){out.push(v[0],v[1],v[2],nx,ny,nz);});}function index(token){var n=parseInt(token.split(\"/\")[0],10);return n<0?vertices.length+n:n-1;}src.split(/\\r?\\n/).forEach(function(line){var p=line.trim().split(/\\s+/);if(p[0]===\"v\"&&p.length>=4){var v=p.slice(1,4).map(Number);if(v.every(Number.isFinite))vertices.push(v);}else if(p[0]===\"usemtl\"){current=p.slice(1).join(\" \")||\"default\";}else if(p[0]===\"f\"&&p.length>=4){var ids=p.slice(1).map(index);for(var j=1;j<ids.length-1;j++)emit(ids[0],ids[j],ids[j+1]);}});return Object.keys(groups).map(function(name){return {material:name,positions:groups[name],vertexCount:groups[name].length/6};});};",
    "window.GENE3D.createMeshBuffers=function(gl,path){if(!gl||typeof gl.createBuffer!==\"function\")throw new Error(\"A WebGL context is required\");var groups=window.GENE3D.parseOBJ(path),mtlPath=String(path).replace(/model\\.obj$/i,\"model.mtl\"),materials={};try{if(window.__GENE_ASSETS__[mtlPath])materials=window.GENE3D.parseMTL(mtlPath);}catch(e){}var made=[];try{groups.forEach(function(group){var buffer=gl.createBuffer();if(!buffer)throw new Error(\"Could not allocate a mesh buffer\");gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(group.positions),gl.STATIC_DRAW);var mat=materials[group.material]||{kd:[0.72,0.76,0.82]};made.push({path:path,material:group.material,buffer:buffer,vertexCount:group.vertexCount,strideBytes:24,positionOffsetBytes:0,normalOffsetBytes:12,diffuse:Array.isArray(mat.kd)?mat.kd.slice(0,3):[0.72,0.76,0.82]});});}catch(e){made.forEach(function(mesh){try{gl.deleteBuffer(mesh.buffer);}catch(ignore){}});throw e;}made.dispose=function(){made.forEach(function(mesh){try{gl.deleteBuffer(mesh.buffer);}catch(ignore){}});};return made;};",
  ].join("");
  // GENE_ART turns saved SVG illustrations into drawable images: GENE_ART.draw(ctx, "assets/art/hero.svg", x, y, w, h).
  const art = [
    "window.GENE_ART=window.GENE_ART||{};",
    "(function(A){var cache={};",
    "A.list=function(){return Object.keys(window.__GENE_ASSETS__||{}).filter(function(p){return /^assets\\/(?:art\\/[^/]+\\.svg|[^/]+\\/sprite\\.svg|forge2d\\/(?:character|tileset|background)\\.svg)$/i.test(p);});};",
    "A.svg=function(p){var s=(window.__GENE_ASSETS__||{})[p];return typeof s===\"string\"?s:null;};",
    "A.image=function(p){if(cache[p])return cache[p];var s=A.svg(p);if(s===null)return null;var img=new Image();img.decoding=\"async\";img.src=\"data:image/svg+xml;charset=utf-8,\"+encodeURIComponent(s);cache[p]=img;return img;};",
    "A.ready=function(p){var i=A.image(p);return !!(i&&i.complete&&i.naturalWidth>0);};",
    "A.draw=function(ctx,p,x,y,w,h){try{var i=A.image(p);if(i&&i.complete&&i.naturalWidth>0){ctx.drawImage(i,x,y,w,h);return true;}}catch(e){}return false;};",
    "})(window.GENE_ART);"
  ].join("");
  // The runtime kit (GeneAudio) is injected with the bootstrap so preview, /play, export, publish and cloud builds all get it.
  // Sandboxed preview documents may expose a throwing localStorage getter. Give the game a
  // per-frame in-memory Web Storage implementation before any runtime/game script executes.
  // This does not grant same-origin access or persist data outside this isolated frame.
  const sandboxStorage = '<script>(function(w){function makeStore(){var data=Object.create(null);return {getItem:function(k){k=String(k);return Object.prototype.hasOwnProperty.call(data,k)?data[k]:null;},setItem:function(k,v){data[String(k)]=String(v);},removeItem:function(k){delete data[String(k)];},clear:function(){data=Object.create(null);},key:function(i){var keys=Object.keys(data);return keys[i]===undefined?null:keys[i];}};}function install(name){var store=makeStore();try{Object.defineProperty(store,"length",{get:function(){return Object.keys(data).length;},enumerable:true});Object.defineProperty(w,name,{configurable:true,enumerable:true,value:store});}catch(e){try{w[name]=store;}catch(ignore){}}}try{void w.localStorage;}catch(e){install("localStorage");}try{void w.sessionStorage;}catch(e){install("sessionStorage");}})(window);</script>';
  return sandboxStorage + buildRuntimeKitScript() + "<script>" + runtime + art + "</script>";
}
