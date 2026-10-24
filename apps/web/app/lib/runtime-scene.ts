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
      const axis = (key: "x" | "y" | "z", index: number) => {
        const candidate = Array.isArray(value) ? value[index] : raw[key];
        const n = Number(candidate);
        return candidate !== undefined && candidate !== null && candidate !== "" && Number.isFinite(n)
          ? Math.max(-100000, Math.min(100000, n))
          : fallback[key];
      };
      return { x: axis("x", 0), y: axis("y", 1), z: axis("z", 2) };
    };
    scene = {
      version: 1,
      objects: rawObjects.slice(0, 500).map((entry, index) => {
        const raw = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
        const id = typeof raw.id === "string" ? raw.id.slice(0, 120) : "scene-object-" + (index + 1);
        const name = typeof raw.name === "string" ? raw.name.slice(0, 120) : "Object " + (index + 1);
        const color = typeof raw.color === "string" && /^#[0-9a-f]{6}$/i.test(raw.color) ? raw.color : "#8b9bb4";
        return {
          id, name,
          type: typeof raw.type === "string" ? raw.type.slice(0, 60) : "mesh",
          modelPath: typeof raw.modelPath === "string" && /^assets\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.obj$/i.test(raw.modelPath) ? raw.modelPath.slice(0, 240) : "",
          position: vector(raw.position ?? raw.position3d ?? raw.translation, { x: 0, y: 0, z: 0 }),
          rotation: vector(raw.rotation ?? raw.rotation3d, { x: 0, y: 0, z: 0 }),
          scale: vector(raw.scale ?? raw.scale3d, { x: 1, y: 1, z: 1 }),
          color,
          visible: raw.visible !== false,
          material: (() => { const m = raw.material && typeof raw.material === "object" ? raw.material as Record<string, unknown> : {}; const finite = (v: unknown, fallback: number) => Number.isFinite(Number(v)) ? Math.max(0, Math.min(1, Number(v))) : fallback; return { roughness: finite(m.roughness, 0.65), metalness: finite(m.metalness, 0), emissive: typeof m.emissive === "string" && /^#[0-9a-f]{6}$/i.test(m.emissive) ? m.emissive : "#000000" }; })(),
          light: (() => { const l = raw.light && typeof raw.light === "object" ? raw.light as Record<string, unknown> : {}; const intensity = Number(l.intensity), ambient = Number(l.ambient); return { intensity: Number.isFinite(intensity) ? Math.max(0, Math.min(20, intensity)) : 1, ambient: Number.isFinite(ambient) ? Math.max(0, Math.min(1, ambient)) : 0.18, direction: vector(l.direction, { x: -0.4, y: 0.8, z: 0.3 }), color: typeof l.color === "string" && /^#[0-9a-f]{6}$/i.test(l.color) ? l.color : color }; })(),
          camera: (() => { const c = raw.camera && typeof raw.camera === "object" ? raw.camera as Record<string, unknown> : {}; const fov = Number(c.fov); return { fov: Number.isFinite(fov) ? Math.max(10, Math.min(120, fov)) : 60 }; })()
        };
      })
    };
  } catch {
    scene = { version: 1, objects: [], error: "Invalid game-spec.json scene manifest" };
  }
  const serialized = JSON.stringify(scene).replace(/</g, "\\u003c");
  return `<script>window.GENE_SCENE=${serialized};window.GENE_SCENE.getObject=function(id){return this.objects.find(function(o){return o.id===id})||null};window.GENE_SCENE.getMeshData=function(id){var o=this.getObject(id);if(!o||!o.modelPath||!window.GENE3D||typeof window.GENE3D.parseOBJ!=="function")return null;try{return window.GENE3D.parseOBJ(o.modelPath)}catch(e){return null}};window.GENE_SCENE.getRenderableObject=function(id){var o=this.getObject(id);if(!o||!o.visible)return null;var meshes=this.getMeshData(id),materials={},mtlPath=o.modelPath?o.modelPath.replace(/model\\.obj$/i,"model.mtl"):"";if(mtlPath&&window.GENE3D&&typeof window.GENE3D.parseMTL==="function"){try{materials=window.GENE3D.parseMTL(mtlPath)}catch(e){}}return {object:o,meshes:meshes,materials:materials,transform:this.getTransform(id)};};window.GENE_SCENE.getVisibleObjects=function(){return this.objects.filter(function(o){return o.visible})};window.GENE_SCENE.getTransform=function(id){var o=this.getObject(id);return o?{position:Object.assign({},o.position),rotation:Object.assign({},o.rotation),scale:Object.assign({},o.scale)}:null};window.GENE_SCENE.getMesh=function(id){var o=this.getObject(id);if(!o||!o.visible||!o.modelPath||!window.GENE3D||!window.GENE3D.parseOBJ)return null;try{var groups=window.GENE3D.parseOBJ(o.modelPath),mtlPath=o.modelPath.replace(/\\.obj$/i,".mtl"),materials={};if(window.__GENE_ASSETS__&&typeof window.__GENE_ASSETS__[mtlPath]==="string"&&window.GENE3D.parseMTL)materials=window.GENE3D.parseMTL(mtlPath);return{modelPath:o.modelPath,groups:groups,materials:materials,position:Object.assign({},o.position),rotation:Object.assign({},o.rotation),scale:Object.assign({},o.scale),color:o.color,material:o.material};}catch(e){return null}};window.GENE_SCENE.drawMesh2D=function(ctx,o,unit,ox,oy){
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
};window.GENE_SCENE.pushRuntimeWarning=function(warning){
  var scene=window.GENE_SCENE;
  var list=Array.isArray(scene.runtimeWarnings)?scene.runtimeWarnings:(scene.runtimeWarnings=[]);
  warning=warning&&typeof warning==="object"?warning:{message:String(warning||"Unknown runtime warning")};
  var key=String(warning.id||"")+"|"+String(warning.modelPath||"")+"|"+String(warning.message||"");
  if(list.some(function(item){return String(item&&item.id||"")+"|"+String(item&&item.modelPath||"")+"|"+String(item&&item.message||"")===key;}))return;
  list.push(Object.assign({timestamp:Date.now()},warning));
  if(list.length>100)list.splice(0,list.length-100);
};
window.GENE_SCENE.createWebGLMeshes=function(gl){
  if(!gl)return{meshes:[],dispose:function(){}};
  var meshes=[],seen=0;
  function primitiveData(type){
    var out=[];
    function tri(a,b,c){
      var ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];
      var nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx,len=Math.sqrt(nx*nx+ny*ny+nz*nz)||1;
      nx/=len;ny/=len;nz/=len;
      [a,b,c].forEach(function(p){out.push(p[0],p[1],p[2],nx,ny,nz);});
    }
    function quad(a,b,c,d){tri(a,b,c);tri(a,c,d);}
    if(type==="plane"){
      quad([-0.5,0,0.5],[0.5,0,0.5],[0.5,0,-0.5],[-0.5,0,-0.5]);
    }else if(type==="sphere"){
      var lat=8,lon=12;
      function point(i,j){var phi=Math.PI*i/lat,theta=2*Math.PI*j/lon;return[Math.sin(phi)*Math.cos(theta)*0.5,Math.cos(phi)*0.5,Math.sin(phi)*Math.sin(theta)*0.5];}
      for(var i=0;i<lat;i++)for(var j=0;j<lon;j++){var a=point(i,j),b=point(i+1,j),c=point(i+1,j+1),d=point(i,j+1);tri(a,b,d);tri(b,c,d);}
    }else if(type==="cylinder"||type==="cone"){
      var segments=16;
      for(var j=0;j<segments;j++){
        var a=j*2*Math.PI/segments,b=(j+1)*2*Math.PI/segments;
        var p0=[Math.cos(a)*0.5,-0.5,Math.sin(a)*0.5],p1=[Math.cos(b)*0.5,-0.5,Math.sin(b)*0.5];
        var q0=[Math.cos(a)*0.5,0.5,Math.sin(a)*0.5],q1=[Math.cos(b)*0.5,0.5,Math.sin(b)*0.5];
        if(type==="cone"){tri(p0,p1,[0,0.5,0]);}else{quad(p0,p1,q1,q0);tri([0,-0.5,0],p1,p0);tri([0,0.5,0],q0,q1);}
      }
    }else if(type==="box"||type==="cube"||type==="rectangular-prism"){
      var x0=-0.5,x1=0.5,y0=-0.5,y1=0.5,z0=-0.5,z1=0.5;
      quad([x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]);
      quad([x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0]);
      quad([x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0]);
      quad([x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1]);
      quad([x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0]);
      quad([x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1]);
    }
    // Unknown types must not silently masquerade as cubes. The quality gate or
    // the game's own model integration should resolve unsupported scene entries.
    return out;
  }
  this.getVisibleObjects().forEach(function(o){
    if(seen>=500)return;
    var type=String(o.type||"mesh").toLowerCase();
    if(type==="light"||type==="camera")return;
    seen++;
    var meshStart=meshes.length;
    try{
      var groups=[],materials={},modelPath=o.modelPath||"";
      if(modelPath){
        var modelLoadError="";
        try{
          if(window.GENE3D&&typeof window.GENE3D.parseOBJ==="function"){
            groups=window.GENE3D.parseOBJ(modelPath)||[];
            var mtlPath=modelPath.replace(/\\.obj$/i,".mtl");
            if(window.__GENE_ASSETS__&&typeof window.__GENE_ASSETS__[mtlPath]==="string"&&window.GENE3D.parseMTL)materials=window.GENE3D.parseMTL(mtlPath);
          }else modelLoadError="GENE3D OBJ parser is unavailable";
        }catch(modelError){modelLoadError=String(modelError&&modelError.message||modelError||"unknown OBJ parser error");groups=[];}
        if(!groups.length){
          groups=[{material:"",positions:primitiveData("box")}];
          window.GENE_SCENE.pushRuntimeWarning({id:o.id,modelPath:modelPath,message:"OBJ geometry could not be loaded; showing a placeholder. "+(modelLoadError||"The OBJ parser returned no geometry.")+" Check the asset package and GENE3D parser."});
        }
      }else if(type==="mesh"&&!modelPath){
        // Generic mesh objects without an assigned OBJ should still be visible and testable.
        // Keep this fallback limited to an absent path: a declared-but-unavailable asset
        // must remain a build/asset error instead of being silently hidden by a placeholder.
        groups=[{material:"",positions:primitiveData("box")}];
      }else if(type!=="mesh"){
        groups=[{material:"",positions:primitiveData(type)}];
      }
      groups.forEach(function(g){
        var data=g.positions||[];
        if(data.length<18||data.length%6!==0||data.length/6>180000)return;
        var buffer=gl.createBuffer();if(!buffer)return;
        gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);
        meshes.push({id:o.id,name:o.name,modelPath:modelPath,materialName:g.material,material:materials[g.material]||null,buffer:buffer,vertexCount:data.length/6,stride:24,positionOffset:0,normalOffset:12,position:Object.assign({},o.position),rotation:Object.assign({},o.rotation),scale:Object.assign({},o.scale),color:o.color,roughness:o.material&&o.material.roughness,metalness:o.material&&o.material.metalness,light:Object.assign({},o.light||{}),camera:Object.assign({},o.camera||{})});
      });
      // Some OBJ parsers return groups that contain no usable triangles. Checking only
      // groups.length misses this case and leaves the object invisible despite "success".
      if(modelPath&&meshes.length===meshStart){
        var fallbackData=primitiveData("box"),fallbackBuffer=gl.createBuffer();
        if(fallbackBuffer){
          gl.bindBuffer(gl.ARRAY_BUFFER,fallbackBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(fallbackData),gl.STATIC_DRAW);
          meshes.push({id:o.id,name:o.name,modelPath:modelPath,materialName:"",material:null,buffer:fallbackBuffer,vertexCount:fallbackData.length/6,stride:24,positionOffset:0,normalOffset:12,position:Object.assign({},o.position),rotation:Object.assign({},o.rotation),scale:Object.assign({},o.scale),color:o.color,roughness:o.material&&o.material.roughness,metalness:o.material&&o.material.metalness,light:Object.assign({},o.light||{}),camera:Object.assign({},o.camera||{})});
        }
        window.GENE_SCENE.pushRuntimeWarning({id:o.id,modelPath:modelPath,message:"OBJ parser produced no usable vertex buffers; a box placeholder is shown. Check mesh groups and triangle data."});
      }
    }catch(e){
      // Roll back partially allocated GPU buffers for this object, then surface the
      // failure instead of silently turning a runtime error into a missing model.
      for(var rollback=meshStart;rollback<meshes.length;rollback++){try{gl.deleteBuffer(meshes[rollback].buffer);}catch(cleanupError){}}
      meshes.splice(meshStart);
      window.GENE_SCENE.pushRuntimeWarning({id:o.id,modelPath:o.modelPath||"",message:"3D mesh setup failed: "+String(e&&e.message||e||"unknown WebGL error")});
    }
  });
  return{meshes:meshes,dispose:function(){meshes.forEach(function(m){try{gl.deleteBuffer(m.buffer);}catch(e){}});meshes.length=0;}};
};window.GENE_SCENE.createViewProjection=function(camera,aspect){
  camera=camera||{};
  function vec(value,fallback){if(Array.isArray(value))return value.slice(0,3).map(function(n,i){var x=Number(n);return Number.isFinite(x)?x:fallback[i];});value=value&&typeof value==="object"?value:{};return["x","y","z"].map(function(k,i){var x=Number(value[k]);return Number.isFinite(x)?x:fallback[i];});}
  function normalize(v){var n=Math.hypot(v[0],v[1],v[2])||1;return[v[0]/n,v[1]/n,v[2]/n];}
  function cross(a,b){return[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
  function dot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
  var eye=vec(camera.eye||camera.position,[0,5,10]),target=vec(camera.target||camera.lookAt,[0,0,0]),up=normalize(vec(camera.up,[0,1,0]));
  if(Math.hypot(eye[0]-target[0],eye[1]-target[1],eye[2]-target[2])<0.001)eye=[target[0],target[1]+1,target[2]+10];
  var z=normalize([eye[0]-target[0],eye[1]-target[1],eye[2]-target[2]]),side=cross(up,z);if(Math.hypot(side[0],side[1],side[2])<0.001)side=cross([0,0,1],z);var x=normalize(side),y=cross(z,x);
  var view=new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1]);
  var fov=Math.max(10,Math.min(120,Number(camera.fov)||60))*Math.PI/180,ratio=Math.max(0.01,Math.min(100,Number(aspect)||1)),near=Math.max(0.01,Math.min(10,Number(camera.near)||0.1)),far=Math.max(near+1,Math.min(100000,Number(camera.far)||1000)),f=1/Math.tan(fov/2),nf=1/(near-far);
  var projection=new Float32Array([f/ratio,0,0,0,0,f,0,0,0,0,(far+near)*nf,-1,0,0,2*far*near*nf,0]),out=new Float32Array(16);
  for(var col=0;col<4;col++)for(var row=0;row<4;row++)out[col*4+row]=projection[row]*view[col*4]+projection[4+row]*view[col*4+1]+projection[8+row]*view[col*4+2]+projection[12+row]*view[col*4+3];
  return out;
};window.GENE_SCENE.drawWebGLMeshes=function(gl,program,viewProjection,resources,locations){
  if(!gl||!program||!viewProjection||!resources||!Array.isArray(resources.meshes))return 0;
  locations=locations||{};
  var pos=locations.position==null?gl.getAttribLocation(program,"aPosition"):locations.position;
  var normal=locations.normal==null?gl.getAttribLocation(program,"aNormal"):locations.normal;
  var mvpLoc=locations.mvp==null?gl.getUniformLocation(program,"uMVP"):locations.mvp;
  var modelLoc=locations.model==null?gl.getUniformLocation(program,"uModel"):locations.model;
  var colorLoc=locations.color==null?gl.getUniformLocation(program,"uColor"):locations.color;
  var lightDirectionLoc=locations.lightDirection==null?gl.getUniformLocation(program,"uLightDirection"):locations.lightDirection;
  var lightColorLoc=locations.lightColor==null?gl.getUniformLocation(program,"uLightColor"):locations.lightColor;
  var ambientLoc=locations.ambient==null?gl.getUniformLocation(program,"uAmbient"):locations.ambient;
  if(pos<0||normal<0||!mvpLoc)return 0;
  function model(o){
    var r=o.rotation||{},p=o.position||{},s=o.scale||{},rx=(Number(r.x)||0)*Math.PI/180,ry=(Number(r.y)||0)*Math.PI/180,rz=(Number(r.z)||0)*Math.PI/180;
    function scaleAxis(value){var n=Number(value);if(!Number.isFinite(n))return 1;return n===0?0:Math.max(.001,Math.min(100,Math.abs(n)));}var sx=scaleAxis(s.x),sy=scaleAxis(s.y),sz=scaleAxis(s.z),cx=Math.cos(rx),sxr=Math.sin(rx),cy=Math.cos(ry),syr=Math.sin(ry),cz=Math.cos(rz),szr=Math.sin(rz);
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
    var light=m.light||{},lightHex=/^#[0-9a-f]{6}$/i.test(light.color)?light.color:"#ffffff",lightRgb=lightHex.match(/[0-9a-f]{2}/gi).map(function(v){return parseInt(v,16)/255;}),rawIntensity=Number(light.intensity),intensity=Number.isFinite(rawIntensity)?Math.max(0,Math.min(20,rawIntensity)):1;
    var direction=light.direction&&typeof light.direction==="object"?light.direction:{x:-0.4,y:0.8,z:0.3},dx=Number(direction.x)||-0.4,dy=Number(direction.y)||0.8,dz=Number(direction.z)||0.3,dlen=Math.hypot(dx,dy,dz)||1;
    if(lightDirectionLoc)gl.uniform3f(lightDirectionLoc,dx/dlen,dy/dlen,dz/dlen);
    if(lightColorLoc)gl.uniform3f(lightColorLoc,lightRgb[0]*intensity,lightRgb[1]*intensity,lightRgb[2]*intensity);
    if(ambientLoc){var rawAmbient=Number(light.ambient);gl.uniform1f(ambientLoc,Number.isFinite(rawAmbient)?Math.max(0,Math.min(1,rawAmbient)):0.18);}
    gl.drawArrays(gl.TRIANGLES,0,m.vertexCount);drawn++;
  });
  return drawn;
};window.GENE_SCENE.draw2D=function(ctx,opts){if(!ctx)return 0;opts=opts||{};var unit=Number.isFinite(opts.unit)?Math.max(1,Math.min(200,opts.unit)):24,ox=Number.isFinite(opts.originX)?opts.originX:ctx.canvas.width/2,oy=Number.isFinite(opts.originY)?opts.originY:ctx.canvas.height/2,count=0;this.getVisibleObjects().forEach(function(o){var p=o.position||{},r=o.rotation||{},s=o.scale||{},x=ox+(Number(p.x)||0)*unit,y=oy-(Number(p.y)||0)*unit-(Number(p.z)||0)*unit*.35,sx=Math.max(.05,Math.min(100,Math.abs(Number(s.x)||1))),sy=Math.max(.05,Math.min(100,Math.abs(Number(s.y)||1))),sz=Math.max(.05,Math.min(100,Math.abs(Number(s.z)||1))),color=/^#[0-9a-f]{6}$/i.test(o.color)?o.color:"#8b9bb4",type=String(o.type||"mesh").toLowerCase();if(o.modelPath&&this.drawMesh2D(ctx,o,unit,ox,oy)){count++;return;}ctx.save();ctx.translate(x,y);ctx.rotate((Number(r.z)||0)*Math.PI/180);ctx.scale(sx,sy);ctx.fillStyle=color;ctx.strokeStyle="rgba(255,255,255,.8)";ctx.lineWidth=1/Math.max(sx,sy);ctx.globalAlpha=.25+.75*(1-(Number(o.material&&o.material.roughness)||0)*.18);if(type.indexOf("light")>=0){ctx.beginPath();ctx.arc(0,0,unit*.32,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(-unit*.5,0);ctx.lineTo(unit*.5,0);ctx.moveTo(0,-unit*.5);ctx.lineTo(0,unit*.5);ctx.stroke()}else if(type.indexOf("camera")>=0){ctx.beginPath();ctx.moveTo(-unit*.3,-unit*.2);ctx.lineTo(unit*.3,-unit*.2);ctx.lineTo(unit*.5,unit*.2);ctx.lineTo(-unit*.5,unit*.2);ctx.closePath();ctx.fill();ctx.stroke()}else if(type.indexOf("sphere")>=0){ctx.beginPath();ctx.ellipse(0,0,unit*.34*sz,unit*.34*sy,0,0,Math.PI*2);ctx.fill();ctx.stroke()}else if(type.indexOf("plane")>=0){ctx.fillRect(-unit*.5,-unit*.08,unit,unit*.16);ctx.strokeRect(-unit*.5,-unit*.08,unit,unit*.16)}else{ctx.fillRect(-unit*.35,-unit*.35,unit*.7,unit*.7);ctx.strokeRect(-unit*.35,-unit*.35,unit*.7,unit*.7)}ctx.restore();count++});return count};</script>`;
}
