/**
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
          modelPath: typeof raw.modelPath === "string" && /^assets\/[a-zA-Z0-9_-]+\/model\.obj$/i.test(raw.modelPath) ? raw.modelPath : "",
          modelPath: typeof raw.modelPath === "string" && /^(?:assets\/[^/]+\/model\.obj|[^/]+(?:\/[^/]+)*\.obj)$/i.test(raw.modelPath) ? raw.modelPath.slice(0, 240) : "",
          position: vector(raw.position ?? raw.position3d ?? raw.translation, { x: 0, y: 0, z: 0 }),
          rotation: vector(raw.rotation ?? raw.rotation3d, { x: 0, y: 0, z: 0 }),
          scale: vector(raw.scale ?? raw.scale3d, { x: 1, y: 1, z: 1 }),
          color,
          visible: raw.visible !== false,
          material: (() => { const m = raw.material && typeof raw.material === "object" ? raw.material as Record<string, unknown> : {}; const finite = (v: unknown, fallback: number) => Number.isFinite(Number(v)) ? Math.max(0, Math.min(1, Number(v))) : fallback; return { roughness: finite(m.roughness, 0.65), metalness: finite(m.metalness, 0), emissive: typeof m.emissive === "string" && /^#[0-9a-f]{6}$/i.test(m.emissive) ? m.emissive : "#000000" }; })(),
          light: (() => { const l = raw.light && typeof raw.light === "object" ? raw.light as Record<string, unknown> : {}; const intensity = Number(l.intensity); return { intensity: Number.isFinite(intensity) ? Math.max(0, Math.min(20, intensity)) : 1, color: typeof l.color === "string" && /^#[0-9a-f]{6}$/i.test(l.color) ? l.color : color }; })(),
          camera: (() => { const c = raw.camera && typeof raw.camera === "object" ? raw.camera as Record<string, unknown> : {}; const fov = Number(c.fov); return { fov: Number.isFinite(fov) ? Math.max(10, Math.min(120, fov)) : 60 }; })()
        };
      })
    };
  } catch {
    scene = { version: 1, objects: [], error: "Invalid game-spec.json scene manifest" };
  }
  const serialized = JSON.stringify(scene).replace(/</g, "\\u003c");
  return `<script>window.GENE_SCENE=${serialized};window.GENE_SCENE.getObject=function(id){return this.objects.find(function(o){return o.id===id})||null};window.GENE_SCENE.getMeshData=function(id){var o=this.getObject(id);if(!o||!o.modelPath||!window.GENE3D||typeof window.GENE3D.parseOBJ!=="function")return null;try{return window.GENE3D.parseOBJ(o.modelPath)}catch(e){return null}};window.GENE_SCENE.getRenderableObject=function(id){var o=this.getObject(id);if(!o||!o.visible)return null;var meshes=this.getMeshData(id),materials={},mtlPath=o.modelPath?o.modelPath.replace(/model\\.obj$/i,"model.mtl"):"";if(mtlPath&&window.GENE3D&&typeof window.GENE3D.parseMTL==="function"){try{materials=window.GENE3D.parseMTL(mtlPath)}catch(e){}}return {object:o,meshes:meshes,materials:materials,transform:this.getTransform(id)};};window.GENE_SCENE.getVisibleObjects=function(){return this.objects.filter(function(o){return o.visible})};window.GENE_SCENE.getTransform=function(id){var o=this.getObject(id);return o?{position:Object.assign({},o.position),rotation:Object.assign({},o.rotation),scale:Object.assign({},o.scale)}:null};window.GENE_SCENE.draw2D=function(ctx,opts){if(!ctx)return 0;opts=opts||{};var unit=Number.isFinite(opts.unit)?Math.max(1,Math.min(200,opts.unit)):24,ox=Number.isFinite(opts.originX)?opts.originX:ctx.canvas.width/2,oy=Number.isFinite(opts.originY)?opts.originY:ctx.canvas.height/2,count=0;this.getVisibleObjects().forEach(function(o){var p=o.position||{},r=o.rotation||{},s=o.scale||{},x=ox+(Number(p.x)||0)*unit,y=oy-(Number(p.y)||0)*unit-(Number(p.z)||0)*unit*.35,sx=Math.max(.05,Math.min(100,Math.abs(Number(s.x)||1))),sy=Math.max(.05,Math.min(100,Math.abs(Number(s.y)||1))),sz=Math.max(.05,Math.min(100,Math.abs(Number(s.z)||1))),color=/^#[0-9a-f]{6}$/i.test(o.color)?o.color:"#8b9bb4",type=String(o.type||"mesh").toLowerCase();ctx.save();ctx.translate(x,y);ctx.rotate((Number(r.z)||0)*Math.PI/180);ctx.scale(sx,sy);ctx.fillStyle=color;ctx.strokeStyle="rgba(255,255,255,.8)";ctx.lineWidth=1/Math.max(sx,sy);ctx.globalAlpha=.25+.75*(1-(Number(o.material&&o.material.roughness)||0)*.18);if(type.indexOf("light")>=0){ctx.beginPath();ctx.arc(0,0,unit*.32,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(-unit*.5,0);ctx.lineTo(unit*.5,0);ctx.moveTo(0,-unit*.5);ctx.lineTo(0,unit*.5);ctx.stroke()}else if(type.indexOf("camera")>=0){ctx.beginPath();ctx.moveTo(-unit*.3,-unit*.2);ctx.lineTo(unit*.3,-unit*.2);ctx.lineTo(unit*.5,unit*.2);ctx.lineTo(-unit*.5,unit*.2);ctx.closePath();ctx.fill();ctx.stroke()}else if(type.indexOf("sphere")>=0){ctx.beginPath();ctx.ellipse(0,0,unit*.34*sz,unit*.34*sy,0,0,Math.PI*2);ctx.fill();ctx.stroke()}else if(type.indexOf("plane")>=0){ctx.fillRect(-unit*.5,-unit*.08,unit,unit*.16);ctx.strokeRect(-unit*.5,-unit*.08,unit,unit*.16)}else{ctx.fillRect(-unit*.35,-unit*.35,unit*.7,unit*.7);ctx.strokeRect(-unit*.35,-unit*.35,unit*.7,unit*.7)}ctx.restore();count++});return count};</script>`;
}
