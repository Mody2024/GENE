"use client";

import { useEffect, useRef, useState } from "react";

type Props = { obj: string; mtl: string; label?: string };

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Could not create WebGL shader.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || "Unknown shader compile error";
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function multiply(a: number[], b: number[]) {
  const out = new Array(16).fill(0);
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      for (let k = 0; k < 4; k++) out[column * 4 + row] += a[k * 4 + row] * b[column * 4 + k];
    }
  }
  return out;
}
function perspective(fov: number, aspect: number, near: number, far: number) {
  const f = 1 / Math.tan(fov / 2);
  const nf = 1 / (near - far);
  return [
    f / aspect,0,0,0,
    0,f,0,0,
    0,0,(far + near) * nf,-1,
    0,0,2 * far * near * nf,0
  ];
}
function lookAt(eye: number[], center: number[], up: number[]) {
  const norm = (v: number[]) => { const l=Math.hypot(v[0],v[1],v[2])||1; return [v[0]/l,v[1]/l,v[2]/l]; };
  const cross = (a:number[],b:number[]) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const sub = (a:number[],b:number[]) => [a[0]-b[0],a[1]-b[1],a[2]-b[2]];
  const z=norm(sub(eye,center));
  const x=norm(cross(up,z));
  const y=cross(z,x);
  return [
    x[0],y[0],z[0],0,
    x[1],y[1],z[1],0,
    x[2],y[2],z[2],0,
    -(x[0]*eye[0]+x[1]*eye[1]+x[2]*eye[2]),
    -(y[0]*eye[0]+y[1]*eye[1]+y[2]*eye[2]),
    -(z[0]*eye[0]+z[1]*eye[1]+z[2]*eye[2]),1
  ];
}
function rotateX(angle: number) {
  const c=Math.cos(angle),s=Math.sin(angle);
  return [1,0,0,0,0,c,s,0,0,-s,c,0,0,0,0,1];
}
function rotateY(angle: number) {
  const c=Math.cos(angle),s=Math.sin(angle);
  return [c,0,-s,0,0,1,0,0,s,0,c,0,0,0,0,1];
}
function parseMaterials(mtl: string) {
  const map: Record<string, [number,number,number]> = {};
  let current = "";
  for (const line of mtl.split(/\r?\n/)) {
    const p=line.trim().split(/\s+/);
    if (p[0] === "newmtl") { current=p.slice(1).join(" "); map[current]=[0.55,0.62,0.58]; }
    else if (p[0] === "Kd" && current && p.length >= 4) {
      const rgb=p.slice(1,4).map(Number);
      if (rgb.every(Number.isFinite)) map[current]=rgb.map(n=>Math.max(0,Math.min(1,n))) as [number,number,number];
    }
  }
  return map;
}
function parseObj(obj: string, mtl: string) {
  const materials=parseMaterials(mtl);
  const vertices: number[][]=[];
  const outPosition: number[]=[];
  const outColor: number[]=[];
  const outNormal: number[]=[];
  let material: [number,number,number]=[0.55,0.62,0.58];
  for (const raw of obj.split(/\r?\n/)) {
    const line=raw.trim();
    if (!line || line.startsWith("#")) continue;
    const p=line.split(/\s+/);
    if (p[0] === "v" && p.length >= 4) {
      const v=p.slice(1,4).map(Number);
      if (v.every(Number.isFinite)) vertices.push(v);
    } else if (p[0] === "usemtl") {
      material=materials[p.slice(1).join(" ")] || material;
    } else if (p[0] === "f" && p.length >= 4) {
      const indices=p.slice(1).map(token => {
        const n=Number(token.split("/")[0]);
        return n < 0 ? vertices.length + n : n - 1;
      });
      for (let i=1;i<indices.length-1;i++) {
        const tri=[indices[0],indices[i],indices[i+1]];
        const points=tri.map(index=>vertices[index]);
        if (points.some(point=>!point)) continue;
        const a=points[0],b=points[1],c=points[2];
        const u=[b[0]-a[0],b[1]-a[1],b[2]-a[2]];
        const v=[c[0]-a[0],c[1]-a[1],c[2]-a[2]];
        let normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
        const length=Math.hypot(normal[0],normal[1],normal[2])||1;
        normal=normal.map(n=>n/length);
        for (const point of points) {
          outPosition.push(point[0],point[1],point[2]);
          outColor.push(material[0],material[1],material[2]);
          outNormal.push(normal[0],normal[1],normal[2]);
        }
      }
    }
  }
  if (outPosition.length === 0) throw new Error("OBJ contains no valid triangle faces.");
  let min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<outPosition.length;i+=3){
    for(let axis=0;axis<3;axis++){min[axis]=Math.min(min[axis],outPosition[i+axis]);max[axis]=Math.max(max[axis],outPosition[i+axis]);}
  }
  const center=min.map((n,i)=>(n+max[i])/2);
  const span=Math.max(max[0]-min[0],max[1]-min[1],max[2]-min[2],0.01);
  const scale=2.0/span;
  for(let i=0;i<outPosition.length;i+=3) for(let axis=0;axis<3;axis++) outPosition[i+axis]=(outPosition[i+axis]-center[axis])*scale;
  return { positions:new Float32Array(outPosition), colors:new Float32Array(outColor), normals:new Float32Array(outNormal), triangles:outPosition.length/9 };
}

export default function ObjViewport({ obj, mtl, label = "Generated mesh" }: Props) {
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const [status,setStatus]=useState("Preparing mesh…");
  const [triangles,setTriangles]=useState(0);

  useEffect(()=>{
    const canvas=canvasRef.current;
    if(!canvas||!obj)return;
    let raf=0;
    let disposed=false;
    let gl: WebGLRenderingContext|null=null;
    const pointer={down:false,x:0,y:0,yaw:0.45,pitch:-0.17,distance:3.5};
    const cleanups:Array<()=>void>=[];
    try{
      const parsed=parseObj(obj,mtl);
      setTriangles(parsed.triangles);
      gl=canvas.getContext("webgl",{alpha:false,antialias:true,preserveDrawingBuffer:false});
      if(!gl){setStatus("WebGL unavailable — OBJ is still available as a real file.");return;}
      const vertexShader=compile(gl,gl.VERTEX_SHADER,"attribute vec3 aPosition;attribute vec3 aColor;attribute vec3 aNormal;uniform mat4 uMvp;varying vec3 vColor;varying vec3 vNormal;void main(){gl_Position=uMvp*vec4(aPosition,1.0);vColor=aColor;vNormal=aNormal;}");
      const fragmentShader=compile(gl,gl.FRAGMENT_SHADER,"precision mediump float;varying vec3 vColor;varying vec3 vNormal;void main(){vec3 light=normalize(vec3(-0.35,0.8,0.5));float diffuse=max(dot(normalize(vNormal),light),0.0);float shade=0.3+diffuse*0.7;gl_FragColor=vec4(vColor*shade,1.0);}");
      const program=gl.createProgram();
      if(!program)throw new Error("Could not create WebGL program.");
      gl.attachShader(program,vertexShader);gl.attachShader(program,fragmentShader);gl.linkProgram(program);
      if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program)||"Could not link WebGL program.");
      gl.useProgram(program);
      const attributes:[string,Float32Array][]=[["aPosition",parsed.positions],["aColor",parsed.colors],["aNormal",parsed.normals]];
      for(const [name,data] of attributes){
        const buffer=gl.createBuffer();if(!buffer)throw new Error("Could not create mesh buffer.");
        gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);
        const location=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,3,gl.FLOAT,false,0,0);
      }
      const mvpLocation=gl.getUniformLocation(program,"uMvp");
      gl.enable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.clearColor(0.075,0.085,0.09,1);
      const resize=()=>{
        if(!gl||!canvas)return;
        const ratio=Math.min(window.devicePixelRatio||1,1.5);
        const width=Math.max(1,Math.floor(canvas.clientWidth*ratio));
        const height=Math.max(1,Math.floor(canvas.clientHeight*ratio));
        if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
        gl.viewport(0,0,width,height);
      };
      const render=()=>{
        if(disposed||!gl)return;
        resize();
        gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
        const aspect=canvas.width/Math.max(1,canvas.height);
        const proj=perspective(Math.PI/4,aspect,0.05,80);
        const view=lookAt([0,0,pointer.distance],[0,0,0],[0,1,0]);
        const model=multiply(rotateY(pointer.yaw),rotateX(pointer.pitch));
        const mvp=multiply(proj,multiply(view,model));
        gl.uniformMatrix4fv(mvpLocation,false,new Float32Array(mvp));
        gl.drawArrays(gl.TRIANGLES,0,parsed.positions.length/3);
        raf=requestAnimationFrame(render);
      };
      const down=(event:PointerEvent)=>{pointer.down=true;pointer.x=event.clientX;pointer.y=event.clientY;canvas.setPointerCapture?.(event.pointerId);};
      const move=(event:PointerEvent)=>{if(!pointer.down)return;pointer.yaw+=(event.clientX-pointer.x)*0.009;pointer.pitch=Math.max(-1.1,Math.min(1.1,pointer.pitch+(event.clientY-pointer.y)*0.009));pointer.x=event.clientX;pointer.y=event.clientY;};
      const up=()=>{pointer.down=false;};
      const wheel=(event:WheelEvent)=>{event.preventDefault();pointer.distance=Math.max(1.8,Math.min(7.5,pointer.distance+event.deltaY*0.004));};
      const resizeEvent=()=>resize();
      canvas.addEventListener("pointerdown",down);canvas.addEventListener("pointermove",move);window.addEventListener("pointerup",up);canvas.addEventListener("wheel",wheel,{passive:false});window.addEventListener("resize",resizeEvent);
      cleanups.push(()=>canvas.removeEventListener("pointerdown",down),()=>canvas.removeEventListener("pointermove",move),()=>window.removeEventListener("pointerup",up),()=>canvas.removeEventListener("wheel",wheel),()=>window.removeEventListener("resize",resizeEvent));
      resize();render();setStatus("WebGL mesh rendered · drag to rotate · wheel to zoom");
      return ()=>{disposed=true;cancelAnimationFrame(raf);for(const cleanup of cleanups)cleanup();if(gl){gl.getExtension("WEBGL_lose_context")?.loseContext();}};
    }catch(error){
      setStatus("Mesh preview failed: "+(error instanceof Error?error.message:String(error)));
    }
    return ()=>{disposed=true;cancelAnimationFrame(raf);for(const cleanup of cleanups)cleanup();if(gl)gl.getExtension("WEBGL_lose_context")?.loseContext();};
  },[obj,mtl]);

  return <div className="obj-viewport">
    <canvas ref={canvasRef} aria-label={label+" interactive WebGL preview"} />
    <div className="obj-viewport-footer"><span>{status}</span><span>{triangles.toLocaleString()} triangles</span></div>
  </div>;
}
