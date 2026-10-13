"use client";

import { useEffect, useRef } from "react";

type V3 = { x: number; y: number; z: number };
type WebGLSceneObject = { id: string; name: string; type: string; position: V3; rotation: V3; scale: V3; color: string; visible: boolean };
type Props = { objects: WebGLSceneObject[]; selectedId: string; onSelect: (id: string) => void; readOnly?: boolean };

const VS = `
attribute vec3 aPosition;
uniform mat4 uMVP;
void main(){ gl_Position = uMVP * vec4(aPosition, 1.0); }
`;
const FS = `
precision mediump float;
uniform vec4 uColor;
void main(){ gl_FragColor = uColor; }
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
const CUBE = new Float32Array([
-0.5,-0.5,0.5,0.5,-0.5,0.5,0.5,0.5,0.5,-0.5,-0.5,0.5,0.5,0.5,0.5,-0.5,0.5,0.5,
0.5,-0.5,-0.5,-0.5,-0.5,-0.5,-0.5,0.5,-0.5,0.5,-0.5,-0.5,-0.5,0.5,-0.5,0.5,0.5,-0.5,
-0.5,-0.5,-0.5,-0.5,-0.5,0.5,-0.5,0.5,0.5,-0.5,-0.5,-0.5,-0.5,0.5,0.5,-0.5,0.5,-0.5,
0.5,-0.5,0.5,0.5,-0.5,-0.5,0.5,0.5,-0.5,0.5,-0.5,0.5,0.5,0.5,-0.5,0.5,0.5,0.5,
-0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,-0.5,-0.5,0.5,0.5,0.5,0.5,-0.5,-0.5,0.5,-0.5,
-0.5,-0.5,-0.5,0.5,-0.5,-0.5,0.5,-0.5,0.5,-0.5,-0.5,-0.5,0.5,-0.5,0.5,-0.5,-0.5,0.5
]);
export default function WebGLSceneViewport({ objects, selectedId, onSelect, readOnly = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const camera = useRef({ yaw: 0.75, pitch: 0.48, distance: 12 });
  const drag = useRef<{x:number;y:number;orbit:boolean;id:string|null}|null>(null);
  useEffect(() => {
    const canvas=canvasRef.current, gl=canvas?.getContext("webgl", { antialias: true, alpha: false });
    if (!canvas || !gl) return;
    let program: WebGLProgram | null = null, buffer: WebGLBuffer | null = null, raf=0;
    try {
      program=gl.createProgram(); if(!program) throw new Error("Unable to allocate WebGL program");
      gl.attachShader(program,shader(gl,gl.VERTEX_SHADER,VS)); gl.attachShader(program,shader(gl,gl.FRAGMENT_SHADER,FS)); gl.linkProgram(program);
      if(!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program)||"WebGL link failed");
      buffer=gl.createBuffer(); if(!buffer) throw new Error("Unable to allocate WebGL geometry");
      gl.bindBuffer(gl.ARRAY_BUFFER,buffer); gl.bufferData(gl.ARRAY_BUFFER,CUBE,gl.STATIC_DRAW);
      const position=gl.getAttribLocation(program,"aPosition"), mvpLoc=gl.getUniformLocation(program,"uMVP"), colorLoc=gl.getUniformLocation(program,"uColor");
      const render=()=>{
        const width=Math.max(1,canvas.clientWidth),height=Math.max(1,canvas.clientHeight),dpr=Math.min(2,window.devicePixelRatio||1);
        if(canvas.width!==Math.round(width*dpr)||canvas.height!==Math.round(height*dpr)){canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr)}
        gl!.viewport(0,0,canvas.width,canvas.height);gl!.clearColor(.035,.055,.085,1);gl!.clear(gl!.COLOR_BUFFER_BIT|gl!.DEPTH_BUFFER_BIT);gl!.enable(gl!.DEPTH_TEST);gl!.enable(gl!.CULL_FACE);
        gl!.useProgram(program);gl!.bindBuffer(gl!.ARRAY_BUFFER,buffer);gl!.enableVertexAttribArray(position);gl!.vertexAttribPointer(position,3,gl!.FLOAT,false,0,0);
        const cam=camera.current, target=[0,0,0], eye=[Math.sin(cam.yaw)*Math.cos(cam.pitch)*cam.distance,Math.sin(cam.pitch)*cam.distance,Math.cos(cam.yaw)*Math.cos(cam.pitch)*cam.distance];
        const vp=multiply(perspective(Math.PI/3,width/height,.1,500),view(eye,target));
        // Draw a lightweight grid in world space as thin cubes.
        for(let i=-10;i<=10;i++){for(const axis of ["x","z"]){const o:WebGLSceneObject={id:"grid",name:"grid",type:"box",position:axis==="x"?{x:i,y:-.53,z:0}:{x:0,y:-.53,z:i},rotation:{x:0,y:0,z:0},scale:axis==="x"?{x:.012,y:.01,z:20}:{x:20,y:.01,z:.012},color:"#24374a",visible:true};gl!.uniformMatrix4fv(mvpLoc,false,multiply(vp,model(o)));gl!.uniform4f(colorLoc,.12,.18,.24,1);gl!.drawArrays(gl!.TRIANGLES,0,36)}}
        for(const o of objects){if(!o.visible)continue;gl!.uniformMatrix4fv(mvpLoc,false,multiply(vp,model(o)));const hex=/^#[0-9a-f]{6}$/i.test(o.color)?o.color:"#8496ad";let r=parseInt(hex.slice(1,3),16)/255,g=parseInt(hex.slice(3,5),16)/255,b=parseInt(hex.slice(5,7),16)/255;if(o.id===selectedId){r=Math.min(1,r*.6+.4);g=Math.min(1,g*.6+.4);b=Math.min(1,b*.6+.4)}gl!.uniform4f(colorLoc,r,g,b,1);gl!.drawArrays(gl!.TRIANGLES,0,36)}
        raf=requestAnimationFrame(render);
      };
      render();
    } catch (error) {
      const ctx=canvas.getContext("2d"); if(ctx){ctx.fillStyle="#101722";ctx.fillRect(0,0,canvas.width||640,canvas.height||360);ctx.fillStyle="#f4a6a6";ctx.fillText("WebGL unavailable: "+(error instanceof Error?error.message:"initialization failed"),16,28)}
    }
    return ()=>{cancelAnimationFrame(raf);if(buffer)gl?.deleteBuffer(buffer);if(program)gl?.deleteProgram(program)};
  },[objects,selectedId]);
  const point=(e:React.PointerEvent<HTMLCanvasElement>)=>{const rect=e.currentTarget.getBoundingClientRect();return{x:e.clientX-rect.left,y:e.clientY-rect.top}};
  const onDown=(e:React.PointerEvent<HTMLCanvasElement>)=>{const p=point(e);drag.current={x:p.x,y:p.y,orbit:e.button===2||e.shiftKey,id:null};e.currentTarget.setPointerCapture(e.pointerId)};
  const onMove=(e:React.PointerEvent<HTMLCanvasElement>)=>{const d=drag.current;if(!d)return;const p=point(e);if(Math.abs(p.x-d.x)+Math.abs(p.y-d.y)>2)d.orbit=true;if(d.orbit){camera.current.yaw-=(p.x-d.x)*.008;camera.current.pitch=Math.max(-1.35,Math.min(1.35,camera.current.pitch+(p.y-d.y)*.008));d.x=p.x;d.y=p.y}};
  const onUp=(e:React.PointerEvent<HTMLCanvasElement>)=>{const d=drag.current;if(d&&!d.orbit){const p=point(e),rect=e.currentTarget.getBoundingClientRect(),visible=objects.filter(o=>o.visible);if(visible.length){const chosen=visible.reduce((best,o)=>{const x=rect.width/2+(o.position.x-o.position.z)*22,y=rect.height/2+(o.position.x+o.position.z)*10-o.position.y*24;const dist=(x-p.x)**2+(y-p.y)**2;return dist<best.dist?{id:o.id,dist}:{...best}}, {id:visible[0].id,dist:Infinity});onSelect(chosen.id)}}drag.current=null};
  return <div className="webgl-scene-view" style={{ position: "relative", height: 420, minHeight: 320, overflow: "hidden", borderRadius: 12, background: "#090e16" }}><div className="webgl-scene-hud" style={{ position: "absolute", zIndex: 1, top: 10, left: 12, right: 12, display: "flex", justifyContent: "space-between", gap: 12, fontSize: 11, color: "#b9cadc", pointerEvents: "none" }}><span>WEBGL · REAL 3D GEOMETRY</span><span>{objects.filter(o=>o.visible).length} visible objects</span></div><canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block", touchAction: "none" }} aria-label="WebGL 3D scene viewport" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={()=>{drag.current=null}} onContextMenu={e=>e.preventDefault()} onWheel={e=>{camera.current.distance=Math.max(3,Math.min(60,camera.current.distance+e.deltaY*.015))}}/><div className="webgl-scene-hint" style={{ position: "absolute", bottom: 10, left: 12, right: 12, fontSize: 11, color: "#9db1c5", pointerEvents: "none" }}>Drag to orbit · Shift/right-drag to orbit · Scroll to zoom · Click an object to select it</div></div>;
}
