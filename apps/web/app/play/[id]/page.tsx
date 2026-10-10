"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { GeneProject } from "../../lib/types";
import { buildRuntimeAssetBootstrap } from "../../lib/runtime-assets";

export default function PlayPage() {
  const params = useParams();
  const id = String(params?.id || "");
  const [project, setProject] = useState<GeneProject | null>(null);
  const [missing, setMissing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [frameKey, setFrameKey] = useState(0);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("gene.projects.v1");
      const list: GeneProject[] = saved ? JSON.parse(saved) : [];
      const found = list.find(item => item.id === id);
      if (found && found.files["game.html"] && found.files["game.js"]) setProject(found);
      else setMissing(true);
    } catch { setMissing(true); }
    setLoaded(true);
  }, [id]);

  const isApp = project?.kind === "app";
  const html = project?.files["game.html"] || "";
  const css = project?.files["game.css"] || "";
  const js = project?.files["game.js"] || "";
  const documentSource = "<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><meta http-equiv='Content-Security-Policy' content=\"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' data:; img-src data: blob:; font-src data: blob:; media-src data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'; frame-src 'none'\"><style>html,body{margin:0;width:100%;" + (isApp ? "min-height:100%;height:auto;overflow:auto;" : "height:100%;overflow:hidden;") + "background:#101419;color:white}*{box-sizing:border-box}" + css + "</style></head><body>" + (isApp ? "" : buildRuntimeAssetBootstrap(project?.files)) + html + "<script>" + js.replace(/<\/script/gi, "<\\/script") + "</script></body></html>";

  if (!loaded) return <main className="play-missing">Loading saved project…</main>;
  if (missing || !project) return <main className="play-missing"><h1>Saved project not found</h1><p>This project is stored in the browser that created it. Open GENE in the same browser profile.</p><a href="/">Return to GENE</a></main>;

  return <main style={{height:"100vh",display:"flex",flexDirection:"column",background:"#111315",color:"#f0f2f3"}}>
    <header style={{height:52,display:"flex",alignItems:"center",gap:14,padding:"0 16px",borderBottom:"1px solid #303437",fontFamily:"Arial,sans-serif"}}>
      <a href="/" style={{textDecoration:"none",color:"#cbe2cf",fontWeight:800,fontSize:18}}>G</a><strong style={{flex:1,fontSize:13}}>{project.name}</strong><span style={{color:"#8e969d",fontSize:10}}>{isApp ? "App preview" : "Local playtest"}</span>
      <button onClick={() => setFrameKey(n => n + 1)}>↻ Restart</button><button onClick={() => { if (!document.fullscreenElement) void document.documentElement.requestFullscreen?.(); else void document.exitFullscreen?.(); }}>⛶ Fullscreen</button><a href="/" style={{color:"#cbe2cf",fontSize:11}}>Back to editor</a>
    </header>
    <iframe key={frameKey} title={project.name + (isApp ? " app" : " game")} sandbox={isApp ? "allow-scripts allow-forms" : "allow-scripts"} srcDoc={documentSource} style={{flex:1,border:0,width:"100%",background:"#101419"}} />
  </main>;
}
