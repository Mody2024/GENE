"use client";

import { useEffect, useRef } from "react";

type V3 = { x: number; y: number; z: number };
type WebGLSceneObject = { id: string; name: string; type: string; modelPath?: string; position: V3; rotation: V3; scale: V3; color: string; visible: boolean };
type Props = { objects: WebGLSceneObject[]; files: Record<string, string>; selectedId: string; onSelect: (id: string) => void; readOnly?: boolean };
const VS = `
attribute vec3 aPosition;
attribute vec3 aNormal;
attribute vec3 aColor;
uniform mat4 uMVP;
uniform mat4 uModel;
varying float vLight;
varying vec3 vMeshColor;
void main(){
  vec3 normal = normalize(mat3(uModel) * aNormal);
  vec3 lightDir = normalize(vec3(-0.45, 0.8, 0.6));
  vLight = 0.32 + 0.68 * max(dot(normal, lightDir), 0.0);
  vMeshColor = aColor;
  gl_Position = uMVP * vec4(aPosition, 1.0);
}
`;
const FS = `
precision mediump float;
uniform vec4 uColor;
varying float vLight;
varying vec3 vMeshColor;
void main(){ gl_FragColor = vec4(uColor.rgb * vMeshColor * vLight, uColor.a); }
`;
function shader(gl: WebGLRenderingContext, type: number, source: string) {
  const value = gl.createShader(type);
  if (!value) throw new Error("Unable to allocate WebGL shader");
  gl.shaderSource(value, source); gl.compileShader(value);
  if (!gl.getShaderParameter(value, gl.COMPILE_STATUS)) { const error = gl.getShaderInfoLog(value) || "Shader compile failed"; gl.deleteShader(value); throw new Error(error); }
  return value;
}
function perspective(fov: number, aspect: number, near: number, far: number) {
  const f = 1 / Math.tan(fov / 2), nf = 1 / (near - far);
  return new Float32Array([f/aspect,0,0,0, 0,f,0,0, 0,0,(far+near)*nf,-1, 0,0,2*far*near*nf,0]);
}
function multiply(a: Float32Array, b: Float32Array) {
  const out = new Float32Array(16);
  for (let c=0;c<4;c++) for (let r=0;r<4;r++) out[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];
  return out;
}
function model(o: WebGLSceneObject) {
  const rx=o.rotation.x*Math.PI/180, ry=o.rotation.y*Math.PI/180, rz=o.rotation.z*Math.PI/180;
  const sx=o.scale.x||.001, sy=o.scale.y||.001, sz=o.scale.z||.001;
  const cx=Math.cos(rx),sxr=Math.sin(rx),cy=Math.cos(ry),syr=Math.sin(ry),cz=Math.cos(rz),szr=Math.sin(rz);
  const r00=cy*cz,r01=cy*szr,r02=-syr,r10=sxr*syr*cz-cx*szr,r11=sxr*syr*szr+cx*cz,r12=sxr*cy,r20=cx*syr*cz+sxr*szr,r21=cx*syr*szr-sxr*cz,r22=cx*cy;
  return new Float32Array([r00*sx,r10*sx,r20*sx,0,r01*sy,r11*sy,r21*sy,0,r02*sz,r12*sz,r22*sz,0,o.position.x,o.position.y,o.position.z,1]);
}
function view(eye: number[], target: number[]) {
  const sub=(a:number[],b:number[])=>a.map((v,i)=>v-b[i]), norm=(v:number[])=>{const l=Math.hypot(...v)||1;return v.map(x=>x/l)}, cross=(a:number[],b:number[])=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const z=norm(sub(eye,target)),x=norm(cross([0,1,0],z)),y=cross(z,x);
  return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-x.reduce((s,v,i)=>s+v*eye[i],0),-y.reduce((s,v,i)=>s+v*eye[i],0),-z.reduce((s,v,i)=>s+v*eye[i],0),1]);
}
type PrimitiveKind = "box" | "sphere" | "cylinder" | "cone" | "plane";
function pushTriangle(out: number[], a: number[], b: number[], c: number[]) {
  out.push(...a, ...b, ...c);
}
function buildPrimitive(kind: PrimitiveKind, segments = 18): Float32Array {
  const out: number[] = [];
  if (kind === "box") {
    const faces = [
      [[-.5,-.5,.5],[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5]],
      [[.5,-.5,-.5],[-.5,-.5,-.5],[-.5,.5,-.5],[.5,.5,-.5]],
      [[-.5,-.5,-.5],[-.5,-.5,.5],[-.5,.5,.5],[-.5,.5,-.5]],
      [[.5,-.5,.5],[.5,-.5,-.5],[.5,.5,-.5],[.5,.5,.5]],
      [[-.5,.5,.5],[.5,.5,.5],[.5,.5,-.5],[-.5,.5,-.5]],
      [[-.5,-.5,-.5],[.5,-.5,-.5],[.5,-.5,.5],[-.5,-.5,.5]]
    ];
    for (const q of faces) { pushTriangle(out,q[0],q[1],q[2]); pushTriangle(out,q[0],q[2],q[3]); }
  } else if (kind === "plane") {
    pushTriangle(out,[-.5,0,-.5],[.5,0,.5],[.5,0,-.5]);
    pushTriangle(out,[-.5,0,-.5],[-.5,0,.5],[.5,0,.5]);
  } else if (kind === "sphere") {
    const rings = Math.max(8, Math.floor(segments / 2));
    for (let y = 0; y < rings; y++) {
      const v0 = -Math.PI / 2 + Math.PI * y / rings;
      const v1 = -Math.PI / 2 + Math.PI * (y + 1) / rings;
      for (let x = 0; x < segments; x++) {
        const u0 = 2 * Math.PI * x / segments, u1 = 2 * Math.PI * (x + 1) / segments;
        const p = (v: number, u: number) => [Math.cos(v) * Math.cos(u) * .5, Math.sin(v) * .5, Math.cos(v) * Math.sin(u) * .5];
        const a=p(v0,u0), b=p(v0,u1), d=p(v1,u0), e=p(v1,u1);
        pushTriangle(out,a,d,b); pushTriangle(out,b,d,e);
      }
    }
  } else {
    for (let i = 0; i < segments; i++) {
      const a = 2 * Math.PI * i / segments, b = 2 * Math.PI * (i + 1) / segments;
      const p0=[Math.cos(a)*.5,-.5,Math.sin(a)*.5], p1=[Math.cos(b)*.5,-.5,Math.sin(b)*.5];
      const top = kind === "cone" ? [0,.5,0] : [0,.5,0];
      const centerBottom=[0,-.5,0];
      pushTriangle(out,p0,top,p1);
      pushTriangle(out,centerBottom,p1,p0);
      if (kind === "cylinder") {
        const q0=[Math.cos(a)*.5,.5,Math.sin(a)*.5], q1=[Math.cos(b)*.5,.5,Math.sin(b)*.5];
        pushTriangle(out,p0,q0,q1); pushTriangle(out,p0,q1,p1);
        pushTriangle(out,[0,.5,0],q1,q0);
      }
    }
  }
  return new Float32Array(out);
}
function parseMtlColors(source: string): Map<string, [number, number, number]> {
  const colors = new Map<string, [number, number, number]>();
  let current = "";
  for (const raw of source.split(/\r?\n/)) {
    const parts = raw.trim().split(/\s+/);
    if (parts[0] === "newmtl") {
      current = parts.slice(1).join(" ");
      colors.set(current, [0.82, 0.84, 0.88]);
    } else if (parts[0] === "Kd" && current && parts.length >= 4) {
      const rgb = parts.slice(1, 4).map(Number);
      if (rgb.every(Number.isFinite)) colors.set(current, rgb.map(value => Math.max(0, Math.min(1, value))) as [number, number, number]);
    }
  }
  return colors;
}

function parseObjGeometry(source: string, path: string, files: Record<string, string>): { positions: Float32Array; colors: Float32Array } {
  if (source.length > 2_000_000) throw new Error("OBJ exceeds the 2 MB scene preview limit.");
  const vertices: number[][] = [];
  const output: number[] = [];
  const outputColors: number[] = [];
  const folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/") + 1) : "";
  let mtlPath = "";
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.split(/\s+/);
    if (parts[0] === "mtllib" && parts.length > 1) mtlPath = folder + parts.slice(1).join(" ");
  }
  if (!mtlPath || !files[mtlPath]) {
    const siblingMtl = folder + "model.mtl";
    if (files[siblingMtl]) mtlPath = siblingMtl;
  }
  const materials = parseMtlColors(mtlPath ? files[mtlPath] || "" : "");
  let activeColor: [number, number, number] = [0.82, 0.84, 0.88];
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.split(/\s+/);
    if (parts[0] === "v" && parts.length >= 4) {
      const vertex = parts.slice(1, 4).map(Number);
      if (vertex.every(Number.isFinite)) vertices.push(vertex);
    } else if (parts[0] === "usemtl") {
      activeColor = materials.get(parts.slice(1).join(" ")) || activeColor;
    } else if (parts[0] === "f" && parts.length >= 4) {
      const indices = parts.slice(1).map(token => {
        const index = Number(token.split("/")[0]);
        return index < 0 ? vertices.length + index : index - 1;
      });
      for (let i = 1; i < indices.length - 1; i++) {
        for (const index of [indices[0], indices[i], indices[i + 1]]) {
          const point = vertices[index];
          if (!point) continue;
          output.push(point[0], point[1], point[2]);
          outputColors.push(...activeColor);
        }
      }
      if (output.length / 3 > 180_000) throw new Error("OBJ exceeds the 60,000-triangle scene preview limit.");
    }
  }
  if (output.length < 9 || output.length % 9 !== 0 || outputColors.length !== output.length) throw new Error("OBJ contains no valid triangle faces.");
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < output.length; i += 3) for (let axis = 0; axis < 3; axis++) {
    min[axis] = Math.min(min[axis], output[i + axis]);
    max[axis] = Math.max(max[axis], output[i + axis]);
  }
  const center = min.map((value, axis) => (value + max[axis]) / 2);
  const span = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2], 0.01);
  return {
    positions: new Float32Array(output.map((value, index) => (value - center[index % 3]) * 2 / span)),
    colors: new Float32Array(outputColors)
  };
}

function buildFlatNormals(positions: Float32Array): Float32Array {
  const normals = new Float32Array(positions.length);
  for (let i = 0; i + 8 < positions.length; i += 9) {
    const ax=positions[i+3]-positions[i], ay=positions[i+4]-positions[i+1], az=positions[i+5]-positions[i+2];
    const bx=positions[i+6]-positions[i], by=positions[i+7]-positions[i+1], bz=positions[i+8]-positions[i+2];
    let nx=ay*bz-az*by, ny=az*bx-ax*bz, nz=ax*by-ay*bx;
    const length=Math.hypot(nx,ny,nz)||1; nx/=length; ny/=length; nz/=length;
    for(let vertex=0;vertex<3;vertex++){const at=i+vertex*3;normals[at]=nx;normals[at+1]=ny;normals[at+2]=nz;}
  }
  return normals;
}
const PRIMITIVES: Record<PrimitiveKind, Float32Array> = {
  box: buildPrimitive("box"), sphere: buildPrimitive("sphere"),
  cylinder: buildPrimitive("cylinder"), cone: buildPrimitive("cone"), plane: buildPrimitive("plane")
};
function primitiveFor(type: string): PrimitiveKind {
  const value = type.toLowerCase();
  if (value.includes("sphere") || value.includes("ball") || value.includes("orb")) return "sphere";
  if (value.includes("cylinder") || value.includes("capsule") || value.includes("tube")) return "cylinder";
  if (value.includes("cone") || value.includes("pyramid") || value.includes("spike")) return "cone";
  if (value.includes("plane") || value.includes("ground") || value.includes("floor")) return "plane";
  return "box";
}

export default function WebGLSceneViewport({ objects, files, selectedId, onSelect, readOnly = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const camera = useRef({ yaw: 0.75, pitch: 0.48, distance: 12 });
  const drag = useRef<{x:number;y:number;orbit:boolean;id:string|null}|null>(null);
  useEffect(() => {
    const canvas=canvasRef.current, gl=canvas?.getContext("webgl", { antialias: true, alpha: false });
    if (!canvas || !gl) return;
    let program: WebGLProgram | null = null, raf=0;
    const buffers = new Map<PrimitiveKind, WebGLBuffer>();
    const normalBuffers = new Map<PrimitiveKind, WebGLBuffer>();
    const meshBuffers = new Map<string, { buffer: WebGLBuffer; normalBuffer: WebGLBuffer; vertexCount: number; colorBuffer: WebGLBuffer }>();
    try {
      program=gl.createProgram(); if(!program) throw new Error("Unable to allocate WebGL program");
      gl.attachShader(program,shader(gl,gl.VERTEX_SHADER,VS)); gl.attachShader(program,shader(gl,gl.FRAGMENT_SHADER,FS)); gl.linkProgram(program);
      if(!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program)||"WebGL link failed");
      for (const kind of Object.keys(PRIMITIVES) as PrimitiveKind[]) {
        const geometryBuffer = gl.createBuffer();
        if (!geometryBuffer) throw new Error("Unable to allocate " + kind + " geometry");
        buffers.set(kind, geometryBuffer);
        gl.bindBuffer(gl.ARRAY_BUFFER, geometryBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, PRIMITIVES[kind], gl.STATIC_DRAW);
        const normalBuffer = gl.createBuffer();
        if (!normalBuffer) throw new Error("Unable to allocate " + kind + " normal buffer");
        normalBuffers.set(kind, normalBuffer);
        gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, buildFlatNormals(PRIMITIVES[kind]), gl.STATIC_DRAW);
      }
      for (const [path, source] of Object.entries(files)) {
        if (!/\.obj$/i.test(path) || !source || source.length > 2_000_000) continue;
        try {
          const geometry = parseObjGeometry(source);
          const meshBuffer = gl.createBuffer(), meshNormalBuffer = gl.createBuffer();
          if (!meshBuffer || !meshNormalBuffer) {
            if (meshBuffer) gl.deleteBuffer(meshBuffer);
            if (meshNormalBuffer) gl.deleteBuffer(meshNormalBuffer);
            continue;
          }
          gl.bindBuffer(gl.ARRAY_BUFFER, meshBuffer);
          gl.bufferData(gl.ARRAY_BUFFER, geometry, gl.STATIC_DRAW);
          gl.bindBuffer(gl.ARRAY_BUFFER, meshNormalBuffer);
          gl.bufferData(gl.ARRAY_BUFFER, buildFlatNormals(geometry), gl.STATIC_DRAW);
          meshBuffers.set(path, { buffer: meshBuffer, normalBuffer: meshNormalBuffer, vertexCount: geometry.length / 3 });
        } catch {
          // Invalid or oversized OBJ files are skipped; primitive editing remains available.
        }
      }
      const position=gl.getAttribLocation(program,"aPosition"), normal=gl.getAttribLocation(program,"aNormal"), meshColor=gl.getAttribLocation(program,"aColor"), mvpLoc=gl.getUniformLocation(program,"uMVP"), modelLoc=gl.getUniformLocation(program,"uModel"), colorLoc=gl.getUniformLocation(program,"uColor");
      const render=()=>{
        const width=Math.max(1,canvas.clientWidth),height=Math.max(1,canvas.clientHeight),dpr=Math.min(2,window.devicePixelRatio||1);
        if(canvas.width!==Math.round(width*dpr)||canvas.height!==Math.round(height*dpr)){canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr)}
        gl!.viewport(0,0,canvas.width,canvas.height);gl!.clearColor(.035,.055,.085,1);gl!.clear(gl!.COLOR_BUFFER_BIT|gl!.DEPTH_BUFFER_BIT);gl!.enable(gl!.DEPTH_TEST);gl!.disable(gl!.CULL_FACE);
        gl!.useProgram(program);gl!.enableVertexAttribArray(position);gl!.enableVertexAttribArray(normal);gl!.enableVertexAttribArray(meshColor);
        const cam=camera.current, target=[0,0,0], eye=[Math.sin(cam.yaw)*Math.cos(cam.pitch)*cam.distance,Math.sin(cam.pitch)*cam.distance,Math.cos(cam.yaw)*Math.cos(cam.pitch)*cam.distance];
        const vp=multiply(perspective(Math.PI/3,width/height,.1,500),view(eye,target));
        // Draw a lightweight grid in world space as thin cubes.
        for(let i=-10;i<=10;i++){for(const axis of ["x","z"]){const o:WebGLSceneObject={id:"grid",name:"grid",type:"box",position:axis==="x"?{x:i,y:-.53,z:0}:{x:0,y:-.53,z:i},rotation:{x:0,y:0,z:0},scale:axis==="x"?{x:.012,y:.01,z:20}:{x:20,y:.01,z:.012},color:"#24374a",visible:true};gl!.bindBuffer(gl!.ARRAY_BUFFER,buffers.get("box")!);gl!.vertexAttribPointer(position,3,gl!.FLOAT,false,0,0);gl!.bindBuffer(gl!.ARRAY_BUFFER,normalBuffers.get("box")!);gl!.vertexAttribPointer(normal,3,gl!.FLOAT,false,0,0);const gridModel=model(o);gl!.uniformMatrix4fv(modelLoc,false,gridModel);gl!.uniformMatrix4fv(mvpLoc,false,multiply(vp,gridModel));gl!.uniform4f(colorLoc,.12,.18,.24,1);gl!.drawArrays(gl!.TRIANGLES,0,PRIMITIVES.box.length/3)}}
        for(const o of objects){if(!o.visible)continue;const mesh=o.type.toLowerCase()==="mesh"&&o.modelPath?meshBuffers.get(o.modelPath):undefined;const kind=primitiveFor(o.type),geometryBuffer=mesh?.buffer||buffers.get(kind),normalBuffer=mesh?.normalBuffer||normalBuffers.get(kind),vertexCount=mesh?.vertexCount||PRIMITIVES[kind].length/3;if(!geometryBuffer||!normalBuffer)continue;const objectModel=model(o);gl!.bindBuffer(gl!.ARRAY_BUFFER,geometryBuffer);gl!.vertexAttribPointer(position,3,gl!.FLOAT,false,0,0);gl!.bindBuffer(gl!.ARRAY_BUFFER,normalBuffer);gl!.vertexAttribPointer(normal,3,gl!.FLOAT,false,0,0);if(mesh){gl!.bindBuffer(gl!.ARRAY_BUFFER,mesh.colorBuffer);gl!.vertexAttribPointer(meshColor,3,gl!.FLOAT,false,0,0)}else{gl!.disableVertexAttribArray(meshColor);gl!.vertexAttrib3f(meshColor,1,1,1)}gl!.uniformMatrix4fv(modelLoc,false,objectModel);gl!.uniformMatrix4fv(mvpLoc,false,multiply(vp,objectModel));const hex=/^#[0-9a-f]{6}$/i.test(o.color)?o.color:"#8496ad";let r=parseInt(hex.slice(1,3),16)/255,g=parseInt(hex.slice(3,5),16)/255,b=parseInt(hex.slice(5,7),16)/255;if(o.id===selectedId){r=Math.min(1,r*.6+.4);g=Math.min(1,g*.6+.4);b=Math.min(1,b*.6+.4)}gl!.uniform4f(colorLoc,r,g,b,1);gl!.drawArrays(gl!.TRIANGLES,0,vertexCount)}
        raf=requestAnimationFrame(render);
      };
      render();
    } catch (error) {
      const ctx=canvas.getContext("2d"); if(ctx){ctx.fillStyle="#101722";ctx.fillRect(0,0,canvas.width||640,canvas.height||360);ctx.fillStyle="#f4a6a6";ctx.fillText("WebGL unavailable: "+(error instanceof Error?error.message:"initialization failed"),16,28)}
    }
    return ()=>{cancelAnimationFrame(raf);for(const value of buffers.values())gl?.deleteBuffer(value);for(const value of normalBuffers.values())gl?.deleteBuffer(value);for(const value of meshBuffers.values()){gl?.deleteBuffer(value.buffer);gl?.deleteBuffer(value.normalBuffer);gl?.deleteBuffer(value.colorBuffer)}if(program)gl?.deleteProgram(program)};
  },[objects,files,selectedId]);
  const point=(e:React.PointerEvent<HTMLCanvasElement>)=>{const rect=e.currentTarget.getBoundingClientRect();return{x:e.clientX-rect.left,y:e.clientY-rect.top}};
  const onDown=(e:React.PointerEvent<HTMLCanvasElement>)=>{const p=point(e);drag.current={x:p.x,y:p.y,orbit:e.button===2||e.shiftKey,id:null};e.currentTarget.setPointerCapture(e.pointerId)};
  const onMove=(e:React.PointerEvent<HTMLCanvasElement>)=>{const d=drag.current;if(!d)return;const p=point(e);if(Math.abs(p.x-d.x)+Math.abs(p.y-d.y)>2)d.orbit=true;if(d.orbit){camera.current.yaw-=(p.x-d.x)*.008;camera.current.pitch=Math.max(-1.35,Math.min(1.35,camera.current.pitch+(p.y-d.y)*.008));d.x=p.x;d.y=p.y}};
  const onUp=(e:React.PointerEvent<HTMLCanvasElement>)=>{const d=drag.current;if(d&&!d.orbit){const p=point(e),rect=e.currentTarget.getBoundingClientRect(),visible=objects.filter(o=>o.visible);if(visible.length){const chosen=visible.reduce((best,o)=>{const x=rect.width/2+(o.position.x-o.position.z)*22,y=rect.height/2+(o.position.x+o.position.z)*10-o.position.y*24;const dist=(x-p.x)**2+(y-p.y)**2;return dist<best.dist?{id:o.id,dist}:{...best}}, {id:visible[0].id,dist:Infinity});onSelect(chosen.id)}}drag.current=null};
  return <div className="webgl-scene-view" style={{ position: "relative", height: 420, minHeight: 320, overflow: "hidden", borderRadius: 12, background: "#090e16" }}><div className="webgl-scene-hud" style={{ position: "absolute", zIndex: 1, top: 10, left: 12, right: 12, display: "flex", justifyContent: "space-between", gap: 12, fontSize: 11, color: "#b9cadc", pointerEvents: "none" }}><span>WEBGL · REAL 3D GEOMETRY</span><span>{objects.filter(o=>o.visible).length} visible objects</span></div><canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block", touchAction: "none" }} aria-label="WebGL 3D scene viewport" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={()=>{drag.current=null}} onContextMenu={e=>e.preventDefault()} onWheel={e=>{camera.current.distance=Math.max(3,Math.min(60,camera.current.distance+e.deltaY*.015))}}/><div className="webgl-scene-hint" style={{ position: "absolute", bottom: 10, left: 12, right: 12, fontSize: 11, color: "#9db1c5", pointerEvents: "none" }}>Drag to orbit · Shift/right-drag to orbit · Scroll to zoom · Click an object to select it</div></div>;
}
