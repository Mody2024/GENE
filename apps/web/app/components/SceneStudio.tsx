"use client";

import { useEffect, useMemo, useState } from "react";

type Vec3 = { x: number; y: number; z: number };
type SceneObject = {
  id: string;
  name: string;
  type: string;
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
  color: string;
  visible: boolean;
};
type Props = {
  files: Record<string, string>;
  readOnly?: boolean;
  onSave: (files: Record<string, string>, label: string) => void;
  onWireRuntime: (prompt: string) => void;
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
    position: safeVector(raw.position ?? raw.position3d ?? raw.translation, zero()),
    rotation: safeVector(raw.rotation ?? raw.rotation3d, zero()),
    scale: safeVector(raw.scale ?? raw.scale3d, one()),
    color: typeof raw.color === "string" ? raw.color : typeof raw.materialColor === "string" ? raw.materialColor : "#8b9bb4",
    visible: raw.visible !== false
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

export default function SceneStudio({ files, readOnly = false, onSave, onWireRuntime }: Props) {
  const source = files["game-spec.json"] || "{}";
  const [selectedId, setSelectedId] = useState("");
  const [objects, setObjects] = useState<SceneObject[]>([]);
  const [undoStack, setUndoStack] = useState<SceneObject[][]>([]);
  const [redoStack, setRedoStack] = useState<SceneObject[][]>([]);
  const [specError, setSpecError] = useState("");
  const [status, setStatus] = useState("");
  const [rawSpec, setRawSpec] = useState<Record<string, unknown>>({});
  const [sceneMetadata, setSceneMetadata] = useState<Record<string, unknown>>({});

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

  const selected = useMemo(() => objects.find(object => object.id === selectedId) || null, [objects, selectedId]);
  const commitObjects = (next: SceneObject[]) => {
    const snapshot = objects.map(object => ({ ...object, position: { ...object.position }, rotation: { ...object.rotation }, scale: { ...object.scale } }));
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
  const updateSelected = (patch: Partial<SceneObject>) => commitObjects(objects.map(object => object.id === selectedId ? { ...object, ...patch } : object));
  const updateVector = (key: "position" | "rotation" | "scale", axis: keyof Vec3, value: number) => {
    if (!Number.isFinite(value)) return;
    commitObjects(objects.map(object => object.id === selectedId ? { ...object, [key]: { ...object[key], [axis]: value } } : object));
  };
  const addObject = () => {
    const id = "scene-object-" + Date.now().toString(36);
    const object: SceneObject = { id, name: "New object", type: "mesh", position: zero(), rotation: zero(), scale: one(), color: "#8b9bb4", visible: true };
    commitObjects([...objects, object]);
    setSelectedId(id);
    setStatus("New scene entry added. Save it to write the manifest.");
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
      id: object.id, name: object.name, type: object.type,
      position: object.position, rotation: object.rotation, scale: object.scale,
      color: object.color, visible: object.visible
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
      <div className="eyebrow">GENE STUDIO · SOURCE-LINKED SCENE DATA</div>
      <h2>Scene Studio</h2>
      <p>Author named scene entries and their transforms in the real game-spec.json file. This is a data editor—not a 3D viewport gizmo yet. The live game changes only after its runtime consumes this scene schema.</p>
    </div>
    {specError ? <div className="forge-notice">{specError}</div> : <>
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
              <option value="mesh">Mesh / imported model</option><option value="box">Box</option><option value="sphere">Sphere</option><option value="plane">Plane</option><option value="light">Light</option><option value="camera">Camera marker</option><option value="custom">Custom</option>
            </select></label>
            {(["position", "rotation", "scale"] as const).map(key => <fieldset className="scene-vector" key={key}>
              <legend>{key}</legend>
              {(["x", "y", "z"] as const).map(axis => <label key={axis}>{axis.toUpperCase()}<input type="number" step={key === "rotation" ? 5 : 0.1} value={selected[key][axis]} onChange={event => updateVector(key, axis, Number(event.target.value))} disabled={readOnly} /></label>)}
            </fieldset>)}
            <label className="scene-field">Display color<input type="color" value={/^#[0-9a-f]{6}$/i.test(selected.color) ? selected.color : "#8b9bb4"} onChange={event => updateSelected({ color: event.target.value })} disabled={readOnly} /></label>
            <label className="scene-visible"><input type="checkbox" checked={selected.visible} onChange={event => updateSelected({ visible: event.target.checked })} disabled={readOnly} /> Visible</label>
            <button className="secondary-button scene-delete" onClick={deleteSelected} disabled={readOnly}>Remove selected entry</button>
          </> : <div className="scene-empty">Select an entry to edit its properties.</div>}
        </div>
      </div>
      <div className="scene-studio-bottom">
        <button className="secondary-button" onClick={wireRuntime} disabled={readOnly || !objects.length}>Ask GENE to wire scene into runtime ↗</button>
        <p>Positions, rotations and scales are stored in game-spec.json. They affect the preview only once the game's renderer reads this schema.</p>
      </div>
      {status && <div className="forge-notice">{status}</div>}
    </>}
  </div>;
}
