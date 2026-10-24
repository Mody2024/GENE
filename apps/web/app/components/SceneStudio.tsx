"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import WebGLSceneViewport from "./WebGLSceneViewport";

type Vec3 = { x: number; y: number; z: number };
type SceneObject = {
  id: string;
  name: string;
  type: string;
  modelPath?: string;
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
  color: string;
  visible: boolean;
  material: { roughness: number; metalness: number; emissive: string };
  light: { intensity: number; color: string };
  camera: { fov: number };
};
type Props = {
  files: Record<string, string>;
  readOnly?: boolean;
  onSave: (files: Record<string, string>, label: string) => void;
  onWireRuntime: (prompt: string) => void;
  engine?: "canvas2d" | "webgl3d" | "webapp";
};

const zero = (): Vec3 => ({ x: 0, y: 0, z: 0 });
const one = (): Vec3 => ({ x: 1, y: 1, z: 1 });
function safeVector(value: unknown, fallback: Vec3): Vec3 {
  if (!value || typeof value !== "object") return { ...fallback };
  const item = value as Record<string, unknown>;
  const number = (key: keyof Vec3) => Number.isFinite(Number(item[key])) ? Number(item[key]) : fallback[key];
  return { x: number("x"), y: number("y"), z: number("z") };
}
function normalizeObject(value: unknown, index: number): SceneObject {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const type = typeof raw.type === "string" ? raw.type : typeof raw.kind === "string" ? raw.kind : "mesh";
  return {
    id: typeof raw.id === "string" ? raw.id : "scene-object-" + (index + 1),
    name: typeof raw.name === "string" ? raw.name : "Object " + (index + 1),
    type,
    modelPath: typeof raw.modelPath === "string" ? raw.modelPath : undefined,
    position: safeVector(raw.position ?? raw.position3d ?? raw.translation, zero()),
    rotation: safeVector(raw.rotation ?? raw.rotation3d, zero()),
    scale: safeVector(raw.scale ?? raw.scale3d, one()),
    color: typeof raw.color === "string" ? raw.color : typeof raw.materialColor === "string" ? raw.materialColor : "#8b9bb4",
    visible: raw.visible !== false,
    material: { roughness: Math.max(0, Math.min(1, Number((raw.material as Record<string, unknown> | undefined)?.roughness ?? 0.65) || 0)), metalness: Math.max(0, Math.min(1, Number((raw.material as Record<string, unknown> | undefined)?.metalness ?? 0) || 0)), emissive: /^#[0-9a-f]{6}$/i.test(String((raw.material as Record<string, unknown> | undefined)?.emissive ?? "#000000")) ? String((raw.material as Record<string, unknown> | undefined)?.emissive ?? "#000000") : "#000000" },
    light: { intensity: Math.max(0, Math.min(20, Number((raw.light as Record<string, unknown> | undefined)?.intensity ?? 1) || 0)), color: /^#[0-9a-f]{6}$/i.test(String((raw.light as Record<string, unknown> | undefined)?.color ?? raw.color ?? "#ffffff")) ? String((raw.light as Record<string, unknown> | undefined)?.color ?? raw.color ?? "#ffffff") : "#ffffff" },
    camera: { fov: Math.max(10, Math.min(120, Number((raw.camera as Record<string, unknown> | undefined)?.fov ?? 60) || 60)) }
  };
}
function readScene(files: Record<string, string>) {
  const source = files["game-spec.json"] || "{}";
  const spec = JSON.parse(source) as Record<string, unknown>;
  const scene = spec.scene && typeof spec.scene === "object" && !Array.isArray(spec.scene)
    ? { ...(spec.scene as Record<string, unknown>) }
    : {};
  const candidate = Array.isArray(scene.objects) ? scene.objects
    : Array.isArray(spec.sceneObjects) ? spec.sceneObjects
    : Array.isArray(spec.objects) ? spec.objects
    : [];
  return { spec, scene, objects: candidate.map(normalizeObject) };
}

export default function SceneStudio({ files, readOnly = false, onSave, onWireRuntime, engine }: Props) {
  const source = files["game-spec.json"] || "{}";
  const activeEngine = engine || (() => {
    try {
      const spec = JSON.parse(source) as Record<string, unknown>;
      const declared = String(spec.engine || (spec.plan as Record<string, unknown> | undefined)?.engine || "canvas2d");
      return declared === "webgl3d" || declared === "webapp" ? declared as "webgl3d" | "webapp" : "canvas2d";
    } catch { return "canvas2d"; }
  })();
  const is2D = activeEngine === "canvas2d";
  const editAxes: Array<keyof Vec3> = is2D ? ["x", "y"] : ["x", "y", "z"];
  const [selectedId, setSelectedId] = useState("");
  const [objects, setObjects] = useState<SceneObject[]>([]);
  const [undoStack, setUndoStack] = useState<SceneObject[][]>([]);
  const [redoStack, setRedoStack] = useState<SceneObject[][]>([]);
  const [specError, setSpecError] = useState("");
  const [status, setStatus] = useState("");
  const [viewportMode, setViewportMode] = useState<"webgl" | "isometric">(activeEngine === "canvas2d" ? "isometric" : "webgl");
  const [rawSpec, setRawSpec] = useState<Record<string, unknown>>({});
  const [sceneMetadata, setSceneMetadata] = useState<Record<string, unknown>>({});
  const viewportRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<{ id: string; startX: number; startY: number; original: SceneObject[]; originalPosition: Vec3 } | null>(null);

  useEffect(() => {
    try {
      const parsed = readScene(files);
      setRawSpec(parsed.spec);
      setSceneMetadata(parsed.scene);
      setObjects(parsed.objects);
      setUndoStack([]);
      setRedoStack([]);
      setSpecError("");
      setStatus("");
      setSelectedId(current => parsed.objects.some(object => object.id === current) ? current : parsed.objects[0]?.id || "");
    } catch {
      setSpecError("game-spec.json is not valid JSON. Fix it in Files before editing scene data.");
      setObjects([]);
      setUndoStack([]);
      setRedoStack([]);
      setRawSpec({});
      setSceneMetadata({});
    }
  }, [source]);

  useEffect(() => {
    setViewportMode(activeEngine === "canvas2d" ? "isometric" : "webgl");
  }, [activeEngine]);

  useEffect(() => {
    const canvas = viewportRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const width = 960, height = 540;
    canvas.width = width; canvas.height = height;
    if (is2D) {
      const bg2d = ctx.createLinearGradient(0, 0, 0, height);
      bg2d.addColorStop(0, "#111a2a"); bg2d.addColorStop(1, "#0a1020");
      ctx.fillStyle = bg2d; ctx.fillRect(0, 0, width, height);
      const unit = 32, originX = width / 2, originY = height / 2;
      ctx.lineWidth = 1; ctx.strokeStyle = "#263449";
      for (let x = -15; x <= 15; x++) {
        ctx.beginPath(); ctx.moveTo(originX + x * unit, 36); ctx.lineTo(originX + x * unit, height - 36); ctx.stroke();
      }
      for (let y = -7; y <= 7; y++) {
        ctx.beginPath(); ctx.moveTo(0, originY + y * unit); ctx.lineTo(width, originY + y * unit); ctx.stroke();
      }
      ctx.strokeStyle = "#5a8eac"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(originX, 28); ctx.lineTo(originX, height - 28); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(28, originY); ctx.lineTo(width - 28, originY); ctx.stroke();
      const visible2d = objects.filter(o => o.visible).slice().sort((a,b) => a.position.y - b.position.y);
      for (const o of visible2d) {
        const px = originX + o.position.x * unit, py = originY - o.position.y * unit;
        const rx = Math.max(7, Math.min(92, 15 * Math.abs(o.scale.x)));
        const ry = Math.max(7, Math.min(92, 13 * Math.abs(o.scale.y)));
        const active = o.id === selectedId, type = o.type.toLowerCase();
        ctx.save(); ctx.translate(px, py); ctx.rotate((o.rotation.z || 0) * Math.PI / 180);
        ctx.fillStyle = o.color; ctx.strokeStyle = active ? "#ffffff" : "#516580"; ctx.lineWidth = active ? 2.5 : 1.2;
        if (type.includes("light")) {
          ctx.strokeStyle = o.color; ctx.beginPath(); ctx.arc(0, 0, Math.max(rx, ry), 0, Math.PI * 2); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(-rx - 7, 0); ctx.lineTo(rx + 7, 0); ctx.moveTo(0, -ry - 7); ctx.lineTo(0, ry + 7); ctx.stroke();
        } else if (type.includes("camera")) {
          ctx.beginPath(); ctx.moveTo(0, -ry - 6); ctx.lineTo(rx + 6, ry); ctx.lineTo(-rx - 6, ry); ctx.closePath(); ctx.fill(); ctx.stroke();
        } else if (type.includes("sphere") || type.includes("circle")) {
          ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        } else if (type.includes("plane")) {
          ctx.fillRect(-rx * 1.3, -Math.max(4, ry * .25), rx * 2.6, Math.max(8, ry * .5)); ctx.strokeRect(-rx * 1.3, -Math.max(4, ry * .25), rx * 2.6, Math.max(8, ry * .5));
        } else {
          const radius = type.includes("box") || type.includes("rect") ? 3 : 7;
          ctx.beginPath(); ctx.roundRect(-rx, -ry, rx * 2, ry * 2, radius); ctx.fill(); ctx.stroke();
          ctx.strokeStyle = "#ffffff42"; ctx.beginPath(); ctx.moveTo(-rx * .65, -ry * .35); ctx.lineTo(rx * .55, -ry * .35); ctx.stroke();
        }
        if (active) { ctx.strokeStyle = "#bcb1ff"; ctx.setLineDash([5, 4]); ctx.strokeRect(-rx - 7, -ry - 7, rx * 2 + 14, ry * 2 + 14); ctx.setLineDash([]); }
        ctx.restore();
        ctx.fillStyle = active ? "#ffffff" : "#aebbd3"; ctx.font = active ? "bold 12px sans-serif" : "11px sans-serif"; ctx.textAlign = "center";
        ctx.fillText(o.name.slice(0, 24), px, py - ry - 13);
      }
      ctx.fillStyle = "#cbd5e7"; ctx.font = "bold 12px sans-serif"; ctx.textAlign = "left";
      ctx.fillText("2D SCENE CANVAS · XY COORDINATES", 18, 24);
      ctx.font = "11px sans-serif"; ctx.fillStyle = "#9aa9c3";
      ctx.fillText("Drag to move · rotate around Z · depth is not used", 18, height - 18);
      return;
    }
    const bg = ctx.createLinearGradient(0, 0, 0, height);
    bg.addColorStop(0, "#111b2a"); bg.addColorStop(1, "#080d16");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height);
    const project = (p: Vec3) => ({ x: width / 2 + (p.x - p.z) * 32, y: height * .58 + (p.x + p.z) * 16 - p.y * 38 });
    for (let i = -12; i <= 12; i++) {
      const a = project({ x: i, y: 0, z: -12 }), b = project({ x: i, y: 0, z: 12 });
      const d = project({ x: -12, y: 0, z: i }), e = project({ x: 12, y: 0, z: i });
      ctx.strokeStyle = i === 0 ? "#416d80" : "#223345"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(e.x, e.y); ctx.stroke();
    }
    const visible = objects.filter(o => o.visible).sort((a,b) => a.position.x+a.position.z+a.position.y-b.position.x-b.position.z-b.position.y);
    for (const o of visible) {
      const p = project(o.position), sx = Math.max(.2,Math.min(4,Math.abs(o.scale.x))), sy = Math.max(.2,Math.min(4,Math.abs(o.scale.y))), sz = Math.max(.2,Math.min(4,Math.abs(o.scale.z)));
      const rx = 14*sx, ry = 9*sz, h = 25*sy, active = o.id === selectedId, type = o.type.toLowerCase();
      ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(((o.rotation.y || 0) + (o.rotation.z || 0)) * Math.PI / 180);
      ctx.fillStyle="#000"; ctx.globalAlpha=.28; ctx.beginPath(); ctx.ellipse(0,6,rx*1.3,ry,0,0,Math.PI*2); ctx.fill(); ctx.globalAlpha=1;
      ctx.fillStyle=o.color; ctx.strokeStyle=active?"#ffffff":"#263747"; ctx.lineWidth=active?2.5:1;
      if(type.includes("light")) { ctx.strokeStyle=o.color; ctx.beginPath(); ctx.arc(0,-h,13,0,Math.PI*2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-20,-h); ctx.lineTo(20,-h); ctx.moveTo(0,-h-20); ctx.lineTo(0,-h+20); ctx.stroke(); }
      else if(type.includes("camera")) { ctx.beginPath(); ctx.moveTo(-12,-h-6); ctx.lineTo(12,-h-6); ctx.lineTo(17,-h+6); ctx.lineTo(-17,-h+6); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      else if(type.includes("sphere")) { ctx.beginPath(); ctx.ellipse(0,-h,rx,ry,0,0,Math.PI*2); ctx.fill(); ctx.stroke(); ctx.strokeStyle="#ffffff55"; ctx.beginPath(); ctx.ellipse(0,-h,rx*.45,ry,0,0,Math.PI*2); ctx.stroke(); }
      else if(type.includes("plane")) { ctx.beginPath(); ctx.moveTo(-rx,0); ctx.lineTo(0,-ry); ctx.lineTo(rx,0); ctx.lineTo(0,ry); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      else { ctx.beginPath(); ctx.moveTo(-rx,-h); ctx.lineTo(0,-h-ry); ctx.lineTo(rx,-h); ctx.lineTo(0,-h+ry); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.globalAlpha=.65; ctx.beginPath(); ctx.moveTo(-rx,-h); ctx.lineTo(-rx,0); ctx.lineTo(0,ry); ctx.lineTo(0,-h+ry); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.moveTo(rx,-h); ctx.lineTo(rx,0); ctx.lineTo(0,ry); ctx.lineTo(0,-h+ry); ctx.closePath(); ctx.fill(); ctx.globalAlpha=1; ctx.stroke(); }
      if(active) { ctx.strokeStyle="#79eac6"; ctx.lineWidth=1.5; ctx.setLineDash([4,4]); ctx.beginPath(); ctx.ellipse(0,3,rx*1.7,ry*1.7,0,0,Math.PI*2); ctx.stroke(); ctx.setLineDash([]); }
      ctx.restore(); ctx.fillStyle=active?"#e8fff8":"#9bb1c6"; ctx.font=active?"bold 12px sans-serif":"11px sans-serif"; ctx.textAlign="center"; ctx.fillText(o.name.slice(0,24),p.x,p.y-h-19);
    }
    ctx.fillStyle="#9bb1c6"; ctx.font="11px sans-serif"; ctx.textAlign="left"; ctx.fillText("SCENE PREVIEW · ISOMETRIC EDITOR",18,24); ctx.fillText("Drag an object to move it across the ground plane",18,height-18);
  }, [objects, selectedId, is2D]);

  const selected = useMemo(() => objects.find(object => object.id === selectedId) || null, [objects, selectedId]);
  const objFiles = useMemo(() => Object.keys(files).filter(path => /^assets\/[a-zA-Z0-9_-]+\/model\.obj$/i.test(path)).sort((a, b) => a.localeCompare(b)), [files]);
  const commitObjects = (next: SceneObject[]) => {
    const snapshot = objects.map(object => ({ ...object, position: { ...object.position }, rotation: { ...object.rotation }, scale: { ...object.scale }, material: { ...object.material }, light: { ...object.light }, camera: { ...object.camera } }));
    setUndoStack(current => [...current, snapshot].slice(-40));
    setRedoStack([]);
    setObjects(next);
  };
  const undo = () => {
    if (!undoStack.length) return;
    setRedoStack(current => [...current, objects.map(object => ({ ...object }))].slice(-40));
    setObjects(undoStack[undoStack.length - 1]);
    setUndoStack(current => current.slice(0, -1));
  };
  const redo = () => {
    if (!redoStack.length) return;
    setUndoStack(current => [...current, objects.map(object => ({ ...object }))].slice(-40));
    setObjects(redoStack[redoStack.length - 1]);
    setRedoStack(current => current.slice(0, -1));
  };

  const viewportPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect=event.currentTarget.getBoundingClientRect();
    return { x:(event.clientX-rect.left)*960/rect.width, y:(event.clientY-rect.top)*540/rect.height };
  };
  const onViewportPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (readOnly || event.button !== 0) return;
    const point = viewportPoint(event);
    const pickable = [...objects].reverse().filter(object => object.visible);
    const centerOf = (object: SceneObject) => is2D
      ? { x: 480 + object.position.x * 32, y: 270 - object.position.y * 32 }
      : { x: 480 + (object.position.x - object.position.z) * 32, y: 540 * .58 + (object.position.x + object.position.z) * 16 - object.position.y * 38 - 25 * object.scale.y };
    const hit = pickable.find(object => {
      const center = centerOf(object);
      if (is2D) {
        const halfWidth = Math.max(24, 15 * Math.abs(object.scale.x) + 8);
        const halfHeight = Math.max(22, 13 * Math.abs(object.scale.y) + 8);
        return Math.abs(point.x - center.x) <= halfWidth && Math.abs(point.y - center.y) <= halfHeight;
      }
      return Math.abs(point.x - center.x) <= 32 * Math.max(1, Math.abs(object.scale.x)) &&
        Math.abs(point.y - center.y) <= 34 * Math.max(1, Math.abs(object.scale.y));
    }) || pickable
      // Small visual labels and thin primitives can be difficult to hit precisely.
      // A bounded nearest-object fallback makes the editor forgiving without letting
      // a click anywhere on the canvas unexpectedly move a distant object.
      .map(object => ({ object, center: centerOf(object) }))
      .map(entry => ({ ...entry, distance: Math.hypot(point.x - entry.center.x, point.y - entry.center.y) }))
      .filter(entry => entry.distance <= 48)
      .sort((a, b) => a.distance - b.distance)[0]?.object;
    if (!hit) return;
    setSelectedId(hit.id);
    dragRef.current = {
      id: hit.id,
      startX: point.x,
      startY: point.y,
      original: objects.map(object => ({ ...object, position: { ...object.position }, rotation: { ...object.rotation }, scale: { ...object.scale } })),
      originalPosition: { ...hit.position }
    };
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Pointer capture may be unavailable in embedded previews. */ }
  };
  const onViewportPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag=dragRef.current;if(!drag||readOnly)return;
    const point=viewportPoint(event),dx=point.x-drag.startX,dy=point.y-drag.startY;
    if (is2D) {
      const x = Math.round((drag.originalPosition.x + dx / 32) * 10) / 10;
      const y = Math.round((drag.originalPosition.y - dy / 32) * 10) / 10;
      setObjects(current => current.map(o => o.id === drag.id ? { ...o, position: { ...o.position, x, y, z: 0 } } : o));
      return;
    }
    const moveX=dx/64+dy/32,moveZ=dy/32-dx/64;
    setObjects(current=>current.map(o=>o.id===drag.id?{...o,position:{...o.position,x:Math.round((drag.originalPosition.x+moveX)*10)/10,z:Math.round((drag.originalPosition.z+moveZ)*10)/10}}:o));
  };
  const onViewportPointerUp = () => {
    const drag=dragRef.current;if(!drag)return;
    const current=objects.find(o=>o.id===drag.id);
    if(current&&(current.position.x!==drag.originalPosition.x||(is2D ? current.position.y!==drag.originalPosition.y : current.position.z!==drag.originalPosition.z))){setUndoStack(stack=>[...stack,drag.original].slice(-40));setRedoStack([]);setStatus("Moved "+current.name+". Save scene data to persist the transform.");}
    dragRef.current=null;
  };

  const updateSelected = (patch: Partial<SceneObject>) => commitObjects(objects.map(object => object.id === selectedId ? { ...object, ...patch } : object));
  const updateVector = (key: "position" | "rotation" | "scale", axis: keyof Vec3, value: number) => {
    if (!Number.isFinite(value)) return;
    commitObjects(objects.map(object => object.id === selectedId ? { ...object, [key]: { ...object[key], [axis]: value } } : object));
  };
  const addObject = () => {
    const id = "scene-object-" + Date.now().toString(36);
    // Place new entries in a predictable grid instead of stacking every new object
    // at the origin, where the latest object can hide the others and be hard to pick.
    const slot = objects.length;
    const column = (slot % 5) - 2;
    const row = Math.floor(slot / 5);
    const position = is2D
      ? { x: column * 2.2, y: row === 0 ? 0 : -row * 1.8, z: 0 }
      : { x: column * 1.8, y: 0, z: row * 1.8 };
    const object: SceneObject = { id, name: is2D ? "New 2D object" : "New object", type: "box", position, rotation: zero(), scale: one(), color: "#8b9bb4", visible: true, material: { roughness: 0.65, metalness: 0, emissive: "#000000" }, light: { intensity: 1, color: "#ffffff" }, camera: { fov: 60 } };
    commitObjects([...objects, object]);
    setSelectedId(id);
    setStatus("New scene entry added in an open layout slot. Save scene data to persist it.");
  };
  const deleteSelected = () => {
    if (!selected) return;
    const next = objects.filter(object => object.id !== selected.id);
    commitObjects(next);
    setSelectedId(next[0]?.id || "");
    setStatus("Object removed from the scene manifest. Save to persist the change.");
  };
  const saveScene = () => {
    if (readOnly) return;
    const nextSpec = { ...rawSpec, scene: { ...sceneMetadata, objects: objects.map(object => ({
      id: object.id, name: object.name, type: object.type, ...(object.modelPath ? { modelPath: object.modelPath } : {}),
      position: object.position, rotation: object.rotation, scale: object.scale,
      color: object.color, visible: object.visible, material: object.material, light: object.light, camera: object.camera
    })) } };
    const nextFiles = { ...files, "game-spec.json": JSON.stringify(nextSpec, null, 2) + "\n" };
    onSave(nextFiles, "Scene data: " + objects.length + " objects");
    setStatus("Saved scene data to game-spec.json. Run the runtime wiring request if your game does not yet consume this schema.");
  };
  const wireRuntime = () => {
    onWireRuntime("Integrate the source-linked Scene Studio manifest into the ACTUAL playable runtime. Read game-spec.json at runtime (or bundle its scene object data safely) and render every visible entry under scene.objects with its type, color, position, rotation and scale. Respect existing engine/rendering conventions, camera, controls, collision/gameplay and performance budget; do not replace the game with a generic demo. If an object type cannot be rendered, report that limitation and use a clearly documented safe fallback. Add validation for malformed scene data and test the actual preview. The scene manifest currently defines these fields: id, name, type, position{x,y,z}, rotation{x,y,z}, scale{x,y,z}, color, visible. Preserve all other game-spec.json metadata and existing mechanics.");
  };

  return <div className="tool-view scene-studio">
    <div className="tool-view-heading">
      <div className="eyebrow">GENE STUDIO · SOURCE-LINKED SCENE DATA · {is2D ? "2D CANVAS" : activeEngine === "webgl3d" ? "3D WORLD" : "APP LAYOUT"}</div>
      <h2>Scene Studio <span className="scene-engine-pill">{is2D ? "2D" : activeEngine === "webgl3d" ? "3D" : "Web app"}</span></h2>
      <p>{is2D ? "Arrange 2D scene objects on an XY canvas with sprite-like shapes, screen-space transforms and an editable hierarchy. Saved entries remain scene metadata until the game runtime draws them." : "Author and arrange 3D scene entries in a WebGL or isometric viewport, then refine transforms in the inspector. The preview visualizes scene-manifest objects; the game updates only when its runtime consumes this schema."}</p>
    </div>
    {specError ? <div className="forge-notice">{specError}</div> : <>
      <style>{`
      .scene-axis-controls{display:inline-flex;align-items:center;gap:5px;padding:3px 6px;border:1px solid var(--border,#314154);border-radius:8px}
      .scene-axis-controls strong{font-size:11px;opacity:.8}
      .scene-axis-controls:first-child strong{color:#ef7777}
      .scene-axis-controls:nth-child(2) strong{color:#77d6a4}
      .scene-axis-controls:nth-child(3) strong{color:#78aaff}
      .scene-viewport-canvas{touch-action:none}
    `}</style>
    <div className="scene-studio-toolbar">
        <span>{objects.length} scene {objects.length === 1 ? "entry" : "entries"} · game-spec.json</span>
        <div className="scene-studio-actions">
          <button className="secondary-button" onClick={undo} disabled={readOnly || !undoStack.length} title="Undo last scene edit">↶ Undo</button>
          <button className="secondary-button" onClick={redo} disabled={readOnly || !redoStack.length} title="Redo scene edit">↷ Redo</button>
          <button className="secondary-button" onClick={addObject} disabled={readOnly}>＋ Add object</button>
          <button className="primary-button" onClick={saveScene} disabled={readOnly}>Save scene data</button>
        </div>
      </div>
      {readOnly && <p className="scene-studio-hint">Switch to Build mode to save scene changes.</p>}
      <div className="scene-viewport-wrap"><div className="scene-viewport-top"><span>LIVE SCENE VIEWPORT</span><span>{objects.filter(object => object.visible).length} visible · {selected ? selected.name : "nothing selected"}</span></div>{is2D ? <div className="scene-studio-actions scene-view-mode"><span className="scene-engine-pill">2D canvas · XY grid</span><span className="scene-studio-hint">No 3D renderer loaded for this project</span></div> : <div className="scene-studio-actions scene-view-mode"><button className={viewportMode === "webgl" ? "primary-button" : "secondary-button"} onClick={() => setViewportMode("webgl")}>WebGL 3D</button><button className={viewportMode === "isometric" ? "primary-button" : "secondary-button"} onClick={() => setViewportMode("isometric")}>Isometric editor</button></div>}{viewportMode === "webgl" ? <WebGLSceneViewport objects={objects} files={files} selectedId={selectedId} onSelect={setSelectedId} readOnly={readOnly} /> : <><canvas ref={viewportRef} className={"scene-viewport-canvas" + (readOnly ? " readonly" : "")} aria-label={is2D ? "Interactive 2D scene viewport" : "Interactive isometric scene viewport"} onPointerDown={onViewportPointerDown} onPointerMove={onViewportPointerMove} onPointerUp={onViewportPointerUp} onPointerCancel={onViewportPointerUp} /><div className="scene-viewport-legend">{is2D ? <><span>↔ X position</span><span>↕ Y position</span><span>↻ Z rotation</span><span>Drag to move · Inspector for precise transforms</span></> : <><span>↔ X axis</span><span>↗ Z axis</span><span>↕ Y height</span><span>Drag to move · Inspector for precise transforms</span></>}</div></>}</div>
      {selected && <div className="scene-studio-toolbar" aria-label="Selected object transform controls">
        <span>TRANSFORM GIZMO · {selected.name}</span>
        <div className="scene-studio-actions">
          {editAxes.map(axis => <span key={axis} className="scene-axis-controls">
            <strong>{axis.toUpperCase()}</strong>
            <button className="secondary-button" onClick={() => updateVector("position", axis, Math.round((selected.position[axis] - 0.5) * 100) / 100)} disabled={readOnly} aria-label={"Move " + selected.name + " negative " + axis}>−</button>
            <button className="secondary-button" onClick={() => updateVector("position", axis, Math.round((selected.position[axis] + 0.5) * 100) / 100)} disabled={readOnly} aria-label={"Move " + selected.name + " positive " + axis}>+</button>
          </span>)}
          <button className="secondary-button" onClick={() => updateSelected({ rotation: { ...selected.rotation, [is2D ? "z" : "y"]: selected.rotation[is2D ? "z" : "y"] + 15 } })} disabled={readOnly}>Rotate {is2D ? "Z" : "Y"} +15°</button>
          <button className="secondary-button" onClick={() => updateSelected({ scale: { x: selected.scale.x * 1.1, y: selected.scale.y * 1.1, z: selected.scale.z * 1.1 } })} disabled={readOnly}>Scale +10%</button>
        </div>
      </div>}
      <div className="scene-studio-layout">
        <div className="scene-object-list">
          <div className="scene-list-heading">HIERARCHY</div>
          {objects.map(object => <button key={object.id} className={"scene-object-row " + (object.id === selectedId ? "active" : "")} onClick={() => setSelectedId(object.id)}>
            <span className="scene-object-symbol">{object.type.toLowerCase().includes("light") ? "☼" : object.type.toLowerCase().includes("camera") ? "◉" : "◇"}</span>
            <span className="scene-object-name">{object.name}<small>{object.type} · {object.visible ? "visible" : "hidden"}</small></span>
          </button>)}
          {!objects.length && <div className="scene-empty">No scene entries yet. Add one, then set its name and transform.</div>}
        </div>
        <div className="scene-inspector">
          <div className="scene-list-heading">INSPECTOR</div>
          {selected ? <>
            <label className="scene-field">Name<input value={selected.name} onChange={event => updateSelected({ name: event.target.value })} disabled={readOnly} /></label>
            <label className="scene-field">Type<select value={selected.type} onChange={event => updateSelected({ type: event.target.value })} disabled={readOnly}>
              <option value="mesh">Mesh / imported model</option><option value="box">Box</option><option value="sphere">Sphere</option><option value="cylinder">Cylinder</option><option value="cone">Cone</option><option value="plane">Plane</option><option value="light">Light</option><option value="camera">Camera marker</option><option value="custom">Custom</option>
            </select></label>
            {selected.type === "mesh" && <label className="scene-field">OBJ model file<select value={selected.modelPath || ""} onChange={event => updateSelected({ modelPath: event.target.value || undefined })} disabled={readOnly || objFiles.length === 0}>
              <option value="">Choose a project OBJ file</option>
              {objFiles.map(path => <option value={path} key={path}>{path}</option>)}
            </select><small>{selected.modelPath && !objFiles.includes(selected.modelPath) ? "The saved model path is missing from project files; the viewport will use a primitive fallback until it is restored." : objFiles.length ? "Selected OBJ geometry is previewed in this scene. MTL materials and texture maps are not yet applied here." : "No runtime-ready assets/id/model.obj files found. Generate or import a model in Forge first."}</small></label>}
            {(["position", "rotation", "scale"] as const).map(key => <fieldset className="scene-vector" key={key}>
              <legend>{key}</legend>
              {editAxes.map(axis => <label key={axis}>{axis.toUpperCase()}<input type="number" step={key === "rotation" ? 5 : 0.1} value={selected[key][axis]} onChange={event => updateVector(key, axis, Number(event.target.value))} disabled={readOnly} /></label>)}
            </fieldset>)}
            <label className="scene-field">Display color<input type="color" value={/^#[0-9a-f]{6}$/i.test(selected.color) ? selected.color : "#8b9bb4"} onChange={event => updateSelected({ color: event.target.value })} disabled={readOnly} /></label>
            <fieldset className="scene-vector"><legend>Material</legend><label>Roughness<input type="number" min="0" max="1" step="0.05" value={selected.material.roughness} onChange={event => updateSelected({ material: { ...selected.material, roughness: Math.max(0, Math.min(1, Number(event.target.value) || 0)) } })} disabled={readOnly} /></label><label>Metalness<input type="number" min="0" max="1" step="0.05" value={selected.material.metalness} onChange={event => updateSelected({ material: { ...selected.material, metalness: Math.max(0, Math.min(1, Number(event.target.value) || 0)) } })} disabled={readOnly} /></label><label>Emissive<input type="color" value={selected.material.emissive} onChange={event => updateSelected({ material: { ...selected.material, emissive: event.target.value } })} disabled={readOnly} /></label></fieldset>
            {selected.type.toLowerCase().includes("light") && <fieldset className="scene-vector"><legend>Light</legend><label>Intensity<input type="number" min="0" max="20" step="0.25" value={selected.light.intensity} onChange={event => updateSelected({ light: { ...selected.light, intensity: Math.max(0, Math.min(20, Number(event.target.value) || 0)) } })} disabled={readOnly} /></label><label>Light color<input type="color" value={selected.light.color} onChange={event => updateSelected({ light: { ...selected.light, color: event.target.value } })} disabled={readOnly} /></label></fieldset>}
            {selected.type.toLowerCase().includes("camera") && <fieldset className="scene-vector"><legend>Camera</legend><label>Field of view<input type="number" min="10" max="120" step="1" value={selected.camera.fov} onChange={event => updateSelected({ camera: { fov: Math.max(10, Math.min(120, Number(event.target.value) || 60)) } })} disabled={readOnly} /></label></fieldset>}
            <label className="scene-visible"><input type="checkbox" checked={selected.visible} onChange={event => updateSelected({ visible: event.target.checked })} disabled={readOnly} /> Visible</label>
            <button className="secondary-button scene-delete" onClick={deleteSelected} disabled={readOnly}>Remove selected entry</button>
          </> : <div className="scene-empty">Select an entry to edit its properties.</div>}
        </div>
      </div>
      <div className="scene-studio-bottom">
        <button className="secondary-button" onClick={wireRuntime} disabled={readOnly || !objects.length}>Ask GENE to wire scene into runtime ↗</button>
        <p>Drag visible objects on the canvas or enter exact transforms in the inspector. Position, rotation, scale, color and visibility are stored in game-spec.json; runtime wiring is still required for those entries to appear in the playable game.</p>
      </div>
      {status && <div className="forge-notice">{status}</div>}
    </>}
  </div>;
}
