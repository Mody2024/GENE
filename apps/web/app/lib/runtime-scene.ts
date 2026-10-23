/**
 * OBJ compatibility note: modelPath validation accepts assets/.../model.obj and other
 * safe .obj paths, preserving Scene Studio OBJ assignments in the isolated manifest.
 * Bridges the saved Scene Studio manifest into the isolated playable runtime.
 * The bridge is renderer-agnostic: generated Canvas/WebGL engines can consume the
 * same validated transforms without relying on editor-only React state.
 */
export function buildRuntimeSceneBootstrap(files: Record<string, string> | undefined): string {
  let scene: Record<string, unknown> = {};
  try {
    const spec = JSON.parse((files || {})["game-spec.json"] || "{}") as Record<string, unknown>;
    const rawScene = spec.scene && typeof spec.scene === "object" && !Array.isArray(spec.scene)
      ? spec.scene as Record<string, unknown>
      : {};
    const rawObjects = Array.isArray(rawScene.objects) ? rawScene.objects
      : Array.isArray(spec.sceneObjects) ? spec.sceneObjects
      : Array.isArray(spec.objects) ? spec.objects
      : [];
    const vector = (value: unknown, fallback: { x: number; y: number; z: number }) => {
      const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
      const axis = (key: "x" | "y" | "z") => {
        const n = Number(raw[key]);
        return Number.isFinite(n) ? Math.max(-100000, Math.min(100000, n)) : fallback[key];
      };
      return { x: axis("x"), y: axis("y"), z: axis("z") };
    };
    const seenIds = new Set<string>();
    const duplicateIds: string[] = [];
    scene = {
      version: 1,
      objects: rawObjects.slice(0, 500).map((entry, index) => {
        const raw = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
        const requestedId = typeof raw.id === "string" && raw.id.trim() ? raw.id.slice(0, 120) : "scene-object-" + (index + 1);
        let id = requestedId;
        let suffix = 2;
        while (seenIds.has(id)) { id = requestedId.slice(0, 110) + "-" + suffix++; }
        if (id !== requestedId) duplicateIds.push(requestedId);
        seenIds.add(id);
        const name = typeof raw.name === "string" ? raw.name.slice(0, 120) : "Object " + (index + 1);
        const color = typeof raw.color === "string" && /^#[0-9a-f]{6}$/i.test(raw.color) ? raw.color : "#8b9bb4";
        return {
          id, name,
          type: typeof raw.type === "string" ? raw.type.slice(0, 60) : "mesh",
          modelPath: typeof raw.modelPath === "string" && /^assets\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.obj$/i.test(raw.modelPath) ? raw.modelPath.slice(0, 240) : "",
          position: vector(raw.position ?? raw.position3d ?? raw.translation, { x: 0, y: 0, z: 0 }),
          rotation: vector(raw.rotation ?? raw.rotation3d, { x: 0, y: 0, z: 0 }),
          scale: (() => { const s = vector(raw.scale ?? raw.scale3d, { x: 1, y: 1, z: 1 }); return { x: Math.max(0.001, Math.min(100000, Math.abs(s.x))), y: Math.max(0.001, Math.min(100000, Math.abs(s.y))), z: Math.max(0.001, Math.min(100000, Math.abs(s.z))) }; })(),
          size: (() => { const d = vector(raw.size ?? raw.dimensions ?? raw.bounds, { x: 1, y: 1, z: 1 }); return { x: Math.max(0.01, Math.abs(d.x)), y: Math.max(0.01, Math.abs(d.y)), z: Math.max(0.01, Math.abs(d.z)) }; })(),
          color,
          visible: raw.visible !== false,
          material: (() => { const m = raw.material && typeof raw.material === "object" ? raw.material as Record<string, unknown> : {}; const finite = (v: unknown, fallback: number) => Number.isFinite(Number(v)) ? Math.max(0, Math.min(1, Number(v))) : fallback; return { roughness: finite(m.roughness, 0.65), metalness: finite(m.metalness, 0), emissive: typeof m.emissive === "string" && /^#[0-9a-f]{6}$/i.test(m.emissive) ? m.emissive : "#000000" }; })(),
          light: (() => { const l = raw.light && typeof raw.light === "object" ? raw.light as Record<string, unknown> : {}; const intensity = Number(l.intensity); return { intensity: Number.isFinite(intensity) ? Math.max(0, Math.min(20, intensity)) : 1, color: typeof l.color === "string" && /^#[0-9a-f]{6}$/i.test(l.color) ? l.color : color }; })(),
          camera: (() => { const c = raw.camera && typeof raw.camera === "object" ? raw.camera as Record<string, unknown> : {}; const fov = Number(c.fov); return { fov: Number.isFinite(fov) ? Math.max(10, Math.min(120, fov)) : 60 }; })()
        };
      }),
      integrity: { duplicateIds }
    };
  } catch {
    scene = { version: 1, objects: [], error: "Invalid game-spec.json scene manifest" };
  }
  const serialized = JSON.stringify(scene).replace(/</g, "\\u003c");
  return `<script>window.GENE_SCENE=${serialized};window.GENE_SCENE.getObject=function(id){return this.objects.find(function(o){return o.id===id})||null};window.GENE_SCENE.getMeshData=function(id){var o=this.getObject(id);if(!o||!o.modelPath||!window.GENE3D||typeof window.GENE3D.parseOBJ!=="function")return null;try{return window.GENE3D.parseOBJ(o.modelPath)}catch(e){return null}};window.GENE_SCENE.getAssetStatus=function(id){var o=this.getObject(id);if(!o)return {status:"missing-scene-object",ok:false,errors:["Scene object was not found."]};if(!o.modelPath)return {status:"primitive-or-unassigned",ok:true,errors:[],warnings:["No external mesh is assigned to this scene object."]};var a=window.__GENE_ASSETS__||{},obj=a[o.modelPath],mtlPath=o.modelPath.replace(/\\.obj$/i,".mtl"),mtl=a[mtlPath],errors=[],warnings=[],groups=[];if(typeof obj!=="string")return {status:"missing-mesh",ok:false,modelPath:o.modelPath,errors:["Referenced OBJ file is absent from the runtime asset bundle."],warnings:[]};if(!window.GENE3D||typeof window.GENE3D.parseOBJ!=="function")return {status:"renderer-unavailable",ok:false,modelPath:o.modelPath,errors:["3D asset parser is unavailable in this runtime."],warnings:[]};try{groups=window.GENE3D.parseOBJ(o.modelPath);if(!Array.isArray(groups)||!groups.length||!groups.some(function(g){return Number(g.vertexCount)>0;}))errors.push("OBJ file contains no renderable triangle groups.");}catch(e){errors.push("OBJ parsing failed: "+String(e&&e.message||e));}if(typeof mtl!=="string")warnings.push("Matching MTL file is absent; renderer defaults will be used.");else if(!window.GENE3D||typeof window.GENE3D.parseMTL!=="function")warnings.push("MTL parser is unavailable.");var vertices=groups.reduce(function(n,g){return n+(Number(g.vertexCount)||0);},0),manifestPath=o.modelPath.replace(/\\.obj$/i,"asset.json"),manifest=window.GENE_ASSET_REGISTRY&&typeof window.GENE_ASSET_REGISTRY.get==="function"?window.GENE_ASSET_REGISTRY.get(manifestPath):null,collisionProxies=manifest&&Array.isArray(manifest.collisionProxies)?manifest.collisionProxies:[],bounds=manifest&&manifest.bounds&&Array.isArray(manifest.bounds.min)&&Array.isArray(manifest.bounds.max)?manifest.bounds:null;if(!collisionProxies.length)warnings.push("No collision proxy metadata is available; this mesh is renderable but not physics-collidable by default.");return {status:errors.length?"invalid-mesh":(warnings.length?"ready-with-warnings":"ready"),ok:errors.length===0,modelPath:o.modelPath,materialPath:mtlPath,manifestPath:manifestPath,groupCount:groups.length,vertexCount:vertices,bounds:bounds,collisionProxyCount:collisionProxies.length,collisionMetadataAvailable:collisionProxies.length>0,physicsColliderInstantiated:false,errors:errors,warnings:warnings};};window.GENE_SCENE.getAssetStatusVerified=async function(id){var report=this.getAssetStatus(id);if(!report.ok||!report.modelPath)return report;var manifestPath=report.modelPath.replace(/model\\.obj$/i,"asset.json"),registry=window.GENE_ASSET_REGISTRY;if(!registry||typeof registry.verifyContentIntegrity!=="function")return Object.assign(report,{integrity:{ok:false,code:"VERIFIER_UNAVAILABLE",errors:["Runtime SHA-256 verifier is unavailable."]}});var integrity=await registry.verifyContentIntegrity(manifestPath);report.integrity=integrity;if(!integrity.ok){report.ok=false;report.status="integrity-failed";report.errors=report.errors.concat(integrity.errors||["Asset integrity verification failed."]);}return report;};window.GENE_SCENE.verifyAllAssets=async function(){var scene=this,targets=this.getVisibleObjects().filter(function(o){return !!o.modelPath;});return Promise.all(targets.map(async function(o){var status=await scene.getAssetStatusVerified(o.id);return {id:o.id,name:o.name,status:status};}));};window.GENE_SCENE.getRenderableObject=function(id){var o=this.getObject(id);if(!o||!o.visible)return null;var meshes=this.getMeshData(id),materials={},mtlPath=o.modelPath?o.modelPath.replace(/\\.obj$/i,".mtl"):"";if(mtlPath&&window.GENE3D&&typeof window.GENE3D.parseMTL==="function"){try{materials=window.GENE3D.parseMTL(mtlPath)}catch(e){}}return {object:o,meshes:meshes,materials:materials,transform:this.getTransform(id)};};window.GENE_SCENE.getVisibleObjects=function(){return this.objects.filter(function(o){return o.visible})};window.GENE_SCENE.getTransform=function(id){var o=this.getObject(id);return o?{position:Object.assign({},o.position),rotation:Object.assign({},o.rotation),scale:Object.assign({},o.scale)}:null};window.GENE_SCENE.setTransform=function(id,patch){var o=this.getObject(id);if(!o||!patch||typeof patch!=="object")return false;["position","rotation","scale"].forEach(function(k){if(patch[k]&&typeof patch[k]==="object"){var next={};["x","y","z"].forEach(function(a){var n=Number(patch[k][a]),old=o[k]&&Number(o[k][a]);next[a]=Number.isFinite(n)?Math.max(-100000,Math.min(100000,n)):(Number.isFinite(old)?old:(k==="scale"?1:0));});if(k==="scale")["x","y","z"].forEach(function(a){next[a]=Math.max(.001,Math.min(100000,Math.abs(next[a])));});o[k]=next;}});return true};window.GENE_SCENE.getBounds=function(id){var o=this.getObject(id);if(!o||!o.visible)return null;var p=o.position||{},s=o.scale||{},d=o.size||{x:1,y:1,z:1},r=o.rotation||{},hx=Math.max(.005,Math.abs(Number(s.x)||1)*Math.abs(Number(d.x)||1)/2),hy=Math.max(.005,Math.abs(Number(s.y)||1)*Math.abs(Number(d.y)||1)/2),hz=Math.max(.005,Math.abs(Number(s.z)||1)*Math.abs(Number(d.z)||1)/2),rx=(Number(r.x)||0)*Math.PI/180,ry=(Number(r.y)||0)*Math.PI/180,rz=(Number(r.z)||0)*Math.PI/180,cx=Math.cos(rx),sx=Math.sin(rx),cy=Math.cos(ry),sy=Math.sin(ry),cz=Math.cos(rz),sz=Math.sin(rz),ex=Math.abs(cz*cy)*hx+Math.abs(cz*sy*sx-sz*cx)*hy+Math.abs(cz*sy*cx+sz*sx)*hz,ey=Math.abs(sz*cy)*hx+Math.abs(sz*sy*sx+cz*cx)*hy+Math.abs(sz*sy*cx-cz*sx)*hz,ez=Math.abs(sy)*hx+Math.abs(cy*sx)*hy+Math.abs(cy*cx)*hz,x=Number(p.x)||0,y=Number(p.y)||0,z=Number(p.z)||0;return{minX:x-ex,maxX:x+ex,minY:y-ey,maxY:y+ey,minZ:z-ez,maxZ:z+ez}};window.GENE_SCENE.intersects=function(a,b){var x=typeof a==="string"?this.getBounds(a):a,y=typeof b==="string"?this.getBounds(b):b;if(!x||!y)return false;return x.minX<=y.maxX&&x.maxX>=y.minX&&x.minY<=y.maxY&&x.maxY>=y.minY&&x.minZ<=y.maxZ&&x.maxZ>=y.minZ};window.GENE_SCENE.getMesh=function(id){var o=this.getObject(id);if(!o||!o.visible||!o.modelPath||!window.GENE3D||!window.GENE3D.parseOBJ)return null;try{var groups=window.GENE3D.parseOBJ(o.modelPath),mtlPath=o.modelPath.replace(/\\.obj$/i,".mtl"),materials={};if(window.__GENE_ASSETS__&&typeof window.__GENE_ASSETS__[mtlPath]==="string"&&window.GENE3D.parseMTL)materials=window.GENE3D.parseMTL(mtlPath);return{modelPath:o.modelPath,groups:groups,materials:materials,position:Object.assign({},o.position),rotation:Object.assign({},o.rotation),scale:Object.assign({},o.scale),color:o.color,material:o.material};}catch(e){return null}};window.GENE_SCENE.drawMesh2D=function(ctx,o,unit,ox,oy){
  try{
    if(!window.GENE3D||!window.GENE3D.parseOBJ||!o.modelPath)return false;
    var groups=window.GENE3D.parseOBJ(o.modelPath),mtlPath=o.modelPath.replace(/\\.obj$/i,".mtl"),mats={};
    if(window.__GENE_ASSETS__&&typeof window.__GENE_ASSETS__[mtlPath]==="string"&&window.GENE3D.parseMTL)mats=window.GENE3D.parseMTL(mtlPath);
    var p=o.position||{},r=o.rotation||{},s=o.scale||{},rx=(Number(r.x)||0)*Math.PI/180,ry=(Number(r.y)||0)*Math.PI/180,rz=(Number(r.z)||0)*Math.PI/180;
    var sx=Math.max(.05,Math.min(100,Math.abs(Number(s.x)||1))),sy=Math.max(.05,Math.min(100,Math.abs(Number(s.y)||1))),sz=Math.max(.05,Math.min(100,Math.abs(Number(s.z)||1)));
    var cx=Math.cos(rx),qx=Math.sin(rx),cy=Math.cos(ry),qy=Math.sin(ry),cz=Math.cos(rz),qz=Math.sin(rz),fallback=/^#[0-9a-f]{6}$/i.test(o.color)?o.color:"#8b9bb4",triangles=[];
    function project(x,y,z){x*=sx;y*=sy;z*=sz;var yy=y*cx-z*qx,zz=y*qx+z*cx,xx=x*cy+zz*qy;zz=-x*qy+zz*cy;var xxx=xx*cz-yy*qz,yyy=xx*qz+yy*cz;return{x:ox+((Number(p.x)||0)+xxx-(Number(p.z)||0)-zz*.35)*unit,y:oy-((Number(p.y)||0)+yyy)*unit-((Number(p.z)||0)+zz)*unit*.35,z:(Number(p.y)||0)+yyy+(Number(p.z)||0)+zz};}
    groups.forEach(function(g){var a=g.positions||[],kd=mats[g.material]&&mats[g.material].kd;for(var i=0;i+17<a.length&&triangles.length<12000;i+=18){var v0=project(a[i],a[i+1],a[i+2]),v1=project(a[i+6],a[i+7],a[i+8]),v2=project(a[i+12],a[i+13],a[i+14]);var nz=(a[i+5]+a[i+11]+a[i+17])/3,shade=.58+.42*Math.max(0,nz),rgb=kd&&kd.length>=3?kd:fallback.match(/[0-9a-f]{2}/gi).map(function(v){return parseInt(v,16)/255;});triangles.push({v:[v0,v1,v2],z:(v0.z+v1.z+v2.z)/3,c:"rgb("+rgb.map(function(v){return Math.round(Math.max(0,Math.min(1,v*shade))*255);}).join(",")+")"});}});
    triangles.sort(function(a,b){return a.z-b.z;});ctx.save();ctx.globalAlpha=1;triangles.forEach(function(t){ctx.beginPath();ctx.moveTo(t.v[0].x,t.v[0].y);ctx.lineTo(t.v[1].x,t.v[1].y);ctx.lineTo(t.v[2].x,t.v[2].y);ctx.closePath();ctx.fillStyle=t.c;ctx.fill();});ctx.restore();return triangles.length>0;
  }catch(e){return false;}
};window.GENE_SCENE.createWebGLMeshes=function(gl){
  if(!gl||!window.GENE3D||!window.GENE3D.parseOBJ)return{meshes:[],dispose:function(){}};
  var meshes=[],seen=0;
  this.getVisibleObjects().forEach(function(o){
    if(!o.modelPath||seen>=500)return;
    seen++;
    try{
      var groups=window.GENE3D.parseOBJ(o.modelPath),mtlPath=o.modelPath.replace(/\\.obj$/i,".mtl"),materials={};
      if(window.__GENE_ASSETS__&&typeof window.__GENE_ASSETS__[mtlPath]==="string"&&window.GENE3D.parseMTL)materials=window.GENE3D.parseMTL(mtlPath);
      groups.forEach(function(g){
        var data=g.positions||[];
        if(data.length<18||data.length%6!==0||data.length/6>180000)return;
        var buffer=gl.createBuffer();if(!buffer)return;
        gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);
        meshes.push({id:o.id,name:o.name,modelPath:o.modelPath,materialName:g.material,material:materials[g.material]||null,buffer:buffer,vertexCount:data.length/6,stride:24,positionOffset:0,normalOffset:12,position:Object.assign({},o.position),rotation:Object.assign({},o.rotation),scale:Object.assign({},o.scale),color:o.color,roughness:o.material&&o.material.roughness,metalness:o.material&&o.material.metalness,light:Object.assign({},o.light||{}),camera:Object.assign({},o.camera||{})});
      });
    }catch(e){}
  });
  return{meshes:meshes,dispose:function(){meshes.forEach(function(m){try{gl.deleteBuffer(m.buffer);}catch(e){}});meshes.length=0;}};
};window.GENE_SCENE.drawWebGLMeshes=function(gl,program,viewProjection,resources,locations){
  if(!gl||!program||!viewProjection||!resources||!Array.isArray(resources.meshes))return 0;
  locations=locations||{};
  var pos=locations.position==null?gl.getAttribLocation(program,"aPosition"):locations.position;
  var normal=locations.normal==null?gl.getAttribLocation(program,"aNormal"):locations.normal;
  var mvpLoc=locations.mvp==null?gl.getUniformLocation(program,"uMVP"):locations.mvp;
  var modelLoc=locations.model==null?gl.getUniformLocation(program,"uModel"):locations.model;
  var colorLoc=locations.color==null?gl.getUniformLocation(program,"uColor"):locations.color;
  if(pos<0||normal<0||!mvpLoc)return 0;
  function model(o){
    var r=o.rotation||{},p=o.position||{},s=o.scale||{},rx=(Number(r.x)||0)*Math.PI/180,ry=(Number(r.y)||0)*Math.PI/180,rz=(Number(r.z)||0)*Math.PI/180;
    var sx=Math.max(.001,Math.min(100,Math.abs(Number(s.x)||1))),sy=Math.max(.001,Math.min(100,Math.abs(Number(s.y)||1))),sz=Math.max(.001,Math.min(100,Math.abs(Number(s.z)||1))),cx=Math.cos(rx),sxr=Math.sin(rx),cy=Math.cos(ry),syr=Math.sin(ry),cz=Math.cos(rz),szr=Math.sin(rz);
    var r00=cy*cz,r01=cy*szr,r02=-syr,r10=sxr*syr*cz-cx*szr,r11=sxr*syr*szr+cx*cz,r12=sxr*cy,r20=cx*syr*cz+sxr*szr,r21=cx*syr*szr-sxr*cz,r22=cx*cy;
    return new Float32Array([r00*sx,r10*sx,r20*sx,0,r01*sy,r11*sy,r21*sy,0,r02*sz,r12*sz,r22*sz,0,Number(p.x)||0,Number(p.y)||0,Number(p.z)||0,1]);
  }
  function mul(a,b){var out=new Float32Array(16);for(var col=0;col<4;col++)for(var row=0;row<4;row++)out[col*4+row]=a[row]*b[col*4]+a[4+row]*b[col*4+1]+a[8+row]*b[col*4+2]+a[12+row]*b[col*4+3];return out;}
  var drawn=0;gl.useProgram(program);gl.enableVertexAttribArray(pos);gl.enableVertexAttribArray(normal);
  resources.meshes.forEach(function(m){
    if(!m.buffer||!m.vertexCount)return;
    var mat=model(m),hex=/^#[0-9a-f]{6}$/i.test(m.color)?m.color:"#8b9bb4",kd=m.material&&m.material.kd;
    if(kd&&kd.length>=3)hex="#"+kd.slice(0,3).map(function(v){return Math.round(Math.max(0,Math.min(1,Number(v)||0))*255).toString(16).padStart(2,"0");}).join("");
    var rgb=hex.match(/[0-9a-f]{2}/gi).map(function(v){return parseInt(v,16)/255;});
    gl.bindBuffer(gl.ARRAY_BUFFER,m.buffer);gl.vertexAttribPointer(pos,3,gl.FLOAT,false,24,0);gl.vertexAttribPointer(normal,3,gl.FLOAT,false,24,12);
    gl.uniformMatrix4fv(mvpLoc,false,mul(viewProjection,mat));if(modelLoc)gl.uniformMatrix4fv(modelLoc,false,mat);if(colorLoc)gl.uniform4f(colorLoc,rgb[0],rgb[1],rgb[2],1);
    gl.drawArrays(gl.TRIANGLES,0,m.vertexCount);drawn++;
  });
  return drawn;
};window.GENE_SCENE.draw2D=function(ctx,opts){if(!ctx)return 0;opts=opts||{};var scene=this,unit=Number.isFinite(opts.unit)?Math.max(1,Math.min(200,opts.unit)):24,ox=Number.isFinite(opts.originX)?opts.originX:ctx.canvas.width/2,oy=Number.isFinite(opts.originY)?opts.originY:ctx.canvas.height/2,count=0;this.getVisibleObjects().forEach(function(o){var p=o.position||{},r=o.rotation||{},s=o.scale||{},x=ox+(Number(p.x)||0)*unit,y=oy-(Number(p.y)||0)*unit-(Number(p.z)||0)*unit*.35,sx=Math.max(.05,Math.min(100,Math.abs(Number(s.x)||1))),sy=Math.max(.05,Math.min(100,Math.abs(Number(s.y)||1))),sz=Math.max(.05,Math.min(100,Math.abs(Number(s.z)||1))),color=/^#[0-9a-f]{6}$/i.test(o.color)?o.color:"#8b9bb4",type=String(o.type||"mesh").toLowerCase();if(o.modelPath&&scene.drawMesh2D(ctx,o,unit,ox,oy)){count++;return;}ctx.save();ctx.translate(x,y);ctx.rotate((Number(r.z)||0)*Math.PI/180);ctx.scale(sx,sy);ctx.fillStyle=color;ctx.strokeStyle="rgba(255,255,255,.8)";ctx.lineWidth=1/Math.max(sx,sy);ctx.globalAlpha=.25+.75*(1-(Number(o.material&&o.material.roughness)||0)*.18);if(type.indexOf("light")>=0){ctx.beginPath();ctx.arc(0,0,unit*.32,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(-unit*.5,0);ctx.lineTo(unit*.5,0);ctx.moveTo(0,-unit*.5);ctx.lineTo(0,unit*.5);ctx.stroke()}else if(type.indexOf("camera")>=0){ctx.beginPath();ctx.moveTo(-unit*.3,-unit*.2);ctx.lineTo(unit*.3,-unit*.2);ctx.lineTo(unit*.5,unit*.2);ctx.lineTo(-unit*.5,unit*.2);ctx.closePath();ctx.fill();ctx.stroke()}else if(type.indexOf("sphere")>=0){ctx.beginPath();ctx.ellipse(0,0,unit*.34*sz,unit*.34*sy,0,0,Math.PI*2);ctx.fill();ctx.stroke()}else if(type.indexOf("plane")>=0){ctx.fillRect(-unit*.5,-unit*.08,unit,unit*.16);ctx.strokeRect(-unit*.5,-unit*.08,unit,unit*.16)}else{ctx.fillRect(-unit*.35,-unit*.35,unit*.7,unit*.7);ctx.strokeRect(-unit*.35,-unit*.35,unit*.7,unit*.7)}ctx.restore();count++});return count};</script>`;
}
