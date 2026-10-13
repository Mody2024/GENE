"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentResponse, BuildVersion, BuildRun, GeneProject, Mode, ProjectKind, Thinking } from "./lib/types";
import { checkpointBuild, createBuildRun, recoverFromCheckpoint, resumeBuild, setTaskStatus } from "./lib/build-orchestrator";
import JSZip from "jszip";
import ObjViewport from "./components/ObjViewport";
import { playableDemoFiles } from "./lib/starter-game";
import { buildRuntimeAssetBootstrap } from "./lib/runtime-assets";

const STORAGE_KEY = "gene.projects.v1";
const ACTIVE_KEY = "gene.active-project.v1";
const ALLOWED_REFERENCE_TEXT = /\.(txt|md|json|js|ts|css|gd|html)$/i;
function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read " + file.name));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}
function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read " + file.name));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsText(file);
  });
}

function uid() {
  return "p-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
}
function GeneMark({ className = "" }: { className?: string }) {
  return <svg className={"gene-logo-svg " + className} viewBox="0 0 40 40" role="img" aria-label="GENE">
    <path d="M20 5.5 31.8 12.3 31.8 26 20 34.5 8.2 27.7 8.2 14Z" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinejoin="round"/>
    <path d="M8.5 14 20 20.8 31.5 14M20 20.8V34" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinejoin="round"/>
    <circle cx="20" cy="20.5" r="3.4" fill="currentColor"/>
    <circle cx="20" cy="5.5" r="2.3" fill="currentColor"/><circle cx="31.8" cy="12.3" r="2.3" fill="currentColor"/><circle cx="31.8" cy="26" r="2.3" fill="currentColor"/><circle cx="8.2" cy="27.7" r="2.3" fill="currentColor"/>
  </svg>;
}
function now() { return new Date().toISOString(); }
function explainAgentError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error || "Unknown error");
  if (/resource_exhausted|quota exceeded|rate.?limit|429/i.test(raw)) return "The AI provider rate limit or quota was reached. Your project files were preserved; wait for quota reset or configure another API key/model, then retry.";
  if (/GEMINI_KEY_REJECTED|invalid api key|unauthorized|401/i.test(raw)) return "The AI provider rejected the API key. Check the key in your deployment environment, redeploy, and retry. Your existing project was preserved.";
  if (/timeout|timed out|aborted|ETIMEDOUT/i.test(raw)) return "The request timed out before GENE could finish. Completed checkpoints were preserved; retry to continue with a smaller task.";
  if (/failed to fetch|networkerror|network request failed|offline/i.test(raw)) return "GENE could not reach the server. Check your connection and deployment status, then retry. Your last saved project version was preserved.";
  if (/GENE_VALIDATION_FAILED|422|stale or missing|unsafe project path|Build rejected/i.test(raw)) return "GENE rejected the generated change during validation to protect your project. Try a smaller, more specific change. Details: " + raw.slice(0, 500);
  return raw.slice(0, 900) || "GENE encountered an unexpected error. Your last saved project version was preserved; inspect the activity log and retry.";
}
function message(role: "user" | "assistant" | "system", content: string, kind?: "question" | "plan" | "build" | "error") {
  return { id: uid(), role, content, createdAt: now(), kind };
}
function newProject(kind: ProjectKind = "game"): GeneProject {
  const isApp = kind === "app";
  return {
    id: uid(),
    name: isApp ? "Untitled app" : "Untitled game",
    kind,
    initialPrompt: "",
    mode: "plan",
    thinking: "balanced",
    messages: [message("assistant", isApp ? "Hey, I'm GENE. Tell me what kind of web app you want to build. I'll help shape the plan, then build it here so we can preview and edit it together." : "Hey, I'm GENE. Tell me the game you're imagining. I'll ask one meaningful question at a time, then we can review the plan before building.")],
    answers: {},
    question: null,
    plan: null,
    files: {},
    versions: [],
    activeFile: "game.js",
    references: [],
    updatedAt: now()
  };
}
function fileName(path: string, kind: ProjectKind = "game") {
  const leaf = path.split("/").pop() || path;
  if (kind === "app") return ({ "game.html": "index.html", "game.css": "styles.css", "game.js": "app.js", "game-spec.json": "app-spec.json" } as Record<string, string>)[leaf] || leaf;
  return leaf;
}
function exportProjectPath(path: string, kind: ProjectKind) {
  if (kind !== "app") return path;
  const aliases: Record<string, string> = { "game.html": "index.html", "game.css": "styles.css", "game.js": "app.js", "game-spec.json": "app-spec.json" };
  const parts = path.split("/");
  const leaf = parts[parts.length - 1];
  if (aliases[leaf]) parts[parts.length - 1] = aliases[leaf];
  return parts.join("/");
}
function importProjectPaths(files: Record<string, string>, kind: ProjectKind) {
  if (kind !== "app") return files;
  const aliases: Record<string, string> = { "index.html": "game.html", "styles.css": "game.css", "app.js": "game.js", "app-spec.json": "game-spec.json" };
  const mapped: Record<string, string> = {};
  for (const [path, content] of Object.entries(files)) {
    const parts = path.split("/");
    const leaf = parts[parts.length - 1];
    if (aliases[leaf]) parts[parts.length - 1] = aliases[leaf];
    mapped[parts.join("/")] = content;
  }
  return mapped;
}

function standaloneDocument(source: string, title: string, cssName: string, jsName: string, runtimeBootstrap = "") {
  const safeTitle = title.replace(/[&<>"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char] || char));
  const bodyMatch = source.match(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/i);
  let body = bodyMatch ? bodyMatch[1] : source
    .replace(/<!doctype[^>]*>/gi, "")
    .replace(/<head\b[^>]*>[\s\S]*?<\/head\s*>/gi, "")
    .replace(/<\/?(?:html|head|body)\b[^>]*>/gi, "");
  body = body.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "");
  return '<!doctype html>\n<html lang="en">\n<head>\n' +
    '<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n' +
    '<meta name="theme-color" content="#101411">\n<meta name="description" content="' + safeTitle + '">\n' +
    '<title>' + safeTitle + '</title>\n<link rel="manifest" href="manifest.webmanifest">\n' +
    '<link rel="icon" href="icon.svg" type="image/svg+xml">\n<link rel="stylesheet" href="' + cssName + '">\n' +
    '</head>\n<body>\n' + body + '\n' + runtimeBootstrap + '\n<script src="' + jsName + '" defer></script>\n<script src="pwa-register.js" defer></script>\n</body>\n</html>';
}


type BuildCheckStatus = "pass" | "warn" | "fail";
type BuildCheck = { label: string; status: BuildCheckStatus; detail: string };
type BuildReport = { checkedAt: string; projectUpdatedAt: string; checkedDirty: boolean; checkedFile: string; checkedEditorContent: string; checks: BuildCheck[] };

export default function Home() {
  const [project, setProject] = useState<GeneProject | null>(null);
  const [projects, setProjects] = useState<GeneProject[]>([]);
  const [draft, setDraft] = useState("");
  const [planIntent, setPlanIntent] = useState<"create" | "update">("create");
  const [extendedPlanning, setExtendedPlanning] = useState(false);
  const [enhancingPrompt, setEnhancingPrompt] = useState(false);
  const [customEditMode, setCustomEditMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [buildInProgress, setBuildInProgress] = useState(false);
  const [canQueueBuildRequests, setCanQueueBuildRequests] = useState(false);
  const [parallelChatInProgress, setParallelChatInProgress] = useState(false);
  const [queuedRequestCount, setQueuedRequestCount] = useState(0);
  const pendingBuildRequests = useRef<string[]>([]);
  const [packageProgress, setPackageProgress] = useState<number | null>(null);
  const [binaryTarget, setBinaryTarget] = useState<"both" | "windows" | "android">("both");
  const [binaryBuildBusy, setBinaryBuildBusy] = useState(false);
  const [binaryBuildConfigured, setBinaryBuildConfigured] = useState(false);
  const [binaryBuildId, setBinaryBuildId] = useState("");
  const [binaryBuildRunUrl, setBinaryBuildRunUrl] = useState("");
  const [binaryBuildLinks, setBinaryBuildLinks] = useState<Record<string, { status: string; url?: string | null; filename?: string; signing?: string; sizeBytes?: number | null; sha256?: string | null }> | null>(null);
  const [apiReady, setApiReady] = useState<boolean | null>(null);
  const [publishConfigured, setPublishConfigured] = useState(false);
  const [publishBusy, setPublishBusy] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState("");
  const [aiModel, setAiModel] = useState("gemini-3.8-flash");
  const [section, setSection] = useState<"chat" | "files" | "tasks" | "assets" | "versions">("chat");
  const [previewOpen, setPreviewOpen] = useState(true);
  const [previewKey, setPreviewKey] = useState(0);
  const [expandedPreview, setExpandedPreview] = useState(false);
  const [editedFile, setEditedFile] = useState("");
  const [fileDirty, setFileDirty] = useState(false);
  const [notice, setNotice] = useState("");
  const [runtimeState, setRuntimeState] = useState<"idle" | "loaded" | "rendered" | "error">("idle");
  const [buildReport, setBuildReport] = useState<BuildReport | null>(null);
  const [showActivity, setShowActivity] = useState(false);
  const [searchMode, setSearchMode] = useState(false);
  const [activity, setActivity] = useState<string[]>([]);
  const [localAgentUrl, setLocalAgentUrl] = useState("http://127.0.0.1:38421");
  const [localAgentToken, setLocalAgentToken] = useState("");
  const [localAgentStatus, setLocalAgentStatus] = useState<"disconnected" | "checking" | "connected" | "error">("disconnected");
  const [localAgentWorkspace, setLocalAgentWorkspace] = useState("");
  const [localAgentProjects, setLocalAgentProjects] = useState(0);
  const [lastSyncedUpdatedAt, setLastSyncedUpdatedAt] = useState("");
  const [lastLocalPlayUrl, setLastLocalPlayUrl] = useState("");
  const [forgePrompt, setForgePrompt] = useState("");
  const [forgeKind, setForgeKind] = useState<"character" | "vehicle" | "building" | "environment" | "prop" | "weapon">("prop");
  const [forgeQuality, setForgeQuality] = useState<"performance" | "standard" | "high">("standard");
  const [forgeBusy, setForgeBusy] = useState(false);
  const [forgeTargetId, setForgeTargetId] = useState<string | null>(null);
  const [forgeNotice, setForgeNotice] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const chatEnd = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const referenceInputRef = useRef<HTMLInputElement>(null);
  const projectImportRef = useRef<HTMLInputElement>(null);
  const autoRepairAttempts = useRef(0);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const stored: GeneProject[] = raw ? JSON.parse(raw) : [];
      const list: GeneProject[] = stored.slice(0, 8).map(item => ({ ...item, kind: item.kind === "app" || item.plan?.engine === "webapp" ? "app" : "game", references: item.references || [], versions: (item.versions || []).slice(0, 8) }));
      const activeId = localStorage.getItem(ACTIVE_KEY);
      setProjects(list);
      const active = list.find(p => p.id === activeId) || list[0] || newProject();
      setProject(active);
      if (!list.some(p => p.id === active.id)) setProjects([active]);
      const savedTheme = localStorage.getItem("gene.theme");
      if (savedTheme === "light" || savedTheme === "dark") setTheme(savedTheme);
    } catch {
      const fresh = newProject();
      setProject(fresh);
      setProjects([fresh]);
    }
    fetch("/api/health").then(r => r.json()).then(d => {
      setApiReady(Boolean(d.aiConfigured));
      setPublishConfigured(Boolean(d.publishConfigured));
      setBinaryBuildConfigured(Boolean(d.binaryBuildConfigured));
      if (d.model) setAiModel(d.model);
    }).catch(() => setApiReady(false));
  }, []);

  useEffect(() => {
    if (!project) return;
    const merged = [project, ...projects.filter(p => p.id !== project.id)].slice(0, 8);
    setProjects(prev => {
      const next = [project, ...prev.filter(p => p.id !== project.id)].slice(0, 8);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); localStorage.setItem(ACTIVE_KEY, project.id); } catch {}
      return next;
    });
  }, [project]);

  useEffect(() => {
    if (!project) return;
    const nextContent = project.files[project.activeFile] || "";
    if (!fileDirty) setEditedFile(nextContent);
  }, [project?.id, project?.activeFile, project?.files, fileDirty]);

  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [project?.messages.length, busy]);

  useEffect(() => {
    localStorage.setItem("gene.theme", theme);
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const savedUrl = localStorage.getItem("gene.local-agent-url") || "http://127.0.0.1:38421";
    const savedToken = localStorage.getItem("gene.local-agent-token") || "";
    setLocalAgentUrl(savedUrl);
    setLocalAgentToken(savedToken);
    if (savedToken) void verifyLocalAgent(savedUrl, savedToken, false);
  }, []);

  useEffect(() => {
    if (!project) return;
    setLastSyncedUpdatedAt(localStorage.getItem("gene.local-agent-sync." + project.id) || "");
  }, [project?.id, project?.updatedAt]);

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) return;
      if (event.data?.type === "gene-custom-selection") {
        const tag = String(event.data.tag || "element").toLowerCase();
        const id = String(event.data.id || "");
        const classes = String(event.data.classes || "");
        const label = String(event.data.text || "").trim().slice(0, 90);
        const target = "<" + tag + (id ? "#" + id : "") + (classes ? "." + classes.split(/\s+/).slice(0, 3).join(".") : "") + ">" + (label ? " containing “" + label + "”" : "");
        setCustomEditMode(false);
        setDraft(current => (current.trim() ? current.trim() + "\n\n" : "") + "Edit the selected live-preview element " + target + ". Preserve other working features and change only what I describe: ");
        setNotice("Element selected. Describe the exact change in the composer, then send it.");
      }
      if (event.data?.type === "gene-runtime") {
        const state = event.data.state === "rendered" ? "rendered" : event.data.state === "error" ? "error" : "loaded";
        setRuntimeState(current => current === "rendered" && state === "loaded" ? "rendered" : state);
        if (state === "rendered") {
          setProject(current => current ? {
            ...current,
            buildRun: current.buildRun ? { ...current.buildRun, prototype: current.buildRun.prototype ? { ...current.buildRun.prototype, ready: true } : current.buildRun.prototype, updatedAt: now() } : current.buildRun,
            livingPreview: { status: "playable", lastKnownGoodVersion: current.versions[0]?.number, updatedAt: now(), runtimeErrors: [], currentObjectives: ["Play and verify the core gameplay loop"], canContinuePlaying: true },
            versions: current.versions.map((v, index) => index === 0 ? { ...v, testSummary: "Source checks passed; browser runtime reported a visible render surface. Gameplay objectives still require manual verification." } : v)
          } : current);
        }
        if (state === "error") {
          const errorText = event.data.message || "unknown runtime error";
          setNotice("The game runtime reported an error: " + errorText);
          setProject(current => current ? {
            ...current,
            livingPreview: { status: "error", lastKnownGoodVersion: current.versions[0]?.number, updatedAt: now(), runtimeErrors: [errorText], currentObjectives: [], canContinuePlaying: false },
            versions: current.versions.map((v, index) => index === 0 ? { ...v, testSummary: "Runtime check failed: " + errorText } : v)
          } : current);
        }
      }
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, []);

  useEffect(() => {
    if (!iframeRef.current?.contentWindow || !previewOpen) return;
    iframeRef.current.contentWindow.postMessage({ type: "gene-custom-edit-mode", enabled: customEditMode }, "*");
  }, [customEditMode, previewKey, previewOpen, project?.files]);

  useEffect(() => {
    // A hidden/collapsed preview has no mounted iframe, so it cannot send render
    // telemetry. Never mark a build broken just because the user closed Preview.
    if (!project || !project.files["game.html"] || !project.files["game.js"] || !previewOpen || !iframeRef.current || runtimeState === "rendered" || runtimeState === "error") return;
    const timer = window.setTimeout(() => {
      // The monitor can miss a frame during slow startup. Confirm the iframe still
      // exists and give its render loop a second window before flagging a failure.
      if (!previewOpen || !iframeRef.current) return;
      setRuntimeState(current => current === "rendered" ? current : "error");
      setNotice(current => current || "GENE could not confirm a visible game frame after waiting for the preview. The source is preserved; reopen or refresh Preview to retry verification.");
      setProject(projectNow => projectNow && projectNow.versions.length ? {
        ...projectNow,
        versions: projectNow.versions.map((v, index) => index === 0 ? { ...v, testSummary: "Unverified: the visible-render monitor did not confirm a frame. Source is preserved." } : v)
      } : projectNow);
    }, 9000);
    return () => window.clearTimeout(timer);
  }, [project?.id, project?.files, previewKey, previewOpen, runtimeState]);

  const previewDoc = useMemo(() => {
    if (!project || !project.files["game.html"] || !project.files["game.js"]) return "";
    // Load generated modules into the same sandboxed runtime as the core game/app.
    const moduleScripts = Object.entries(project.files)
      .filter(([path]) => path !== "game.js" && /\.js$/i.test(path) && !/(^|\/)node_modules\//i.test(path))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([path, source]) => "/* GENE module: " + path + " */\n" + source.replace(/<\/script/gi, "<\\/script"))
      .join("\n;\n");
    if (project.kind === "app") {
      const html = project.files["game.html"].replace(/<script[\s\S]*?<\/script>/gi, "");
      const css = (project.files["game.css"] || "").replace(/<\/style/gi, "<\\/style");
      const js = (project.files["game.js"] || "").replace(/<\/script/gi, "<\\/script");
      const monitor = [
        "(function(){",
        "function report(){if(window.__geneFrameConfirmed)return;try{var b=document.body;var visible=!!(b&&b.children.length&&(b.innerText.trim().length>0||b.querySelector('button,input,main,section,nav,form,canvas')));if(visible)window.__geneFrameConfirmed=true;parent.postMessage({type:'gene-runtime',state:visible?'rendered':'loaded',renderer:'webapp'},'*');}catch(e){parent.postMessage({type:'gene-runtime',state:'error',renderer:'webapp',message:String(e)},'*');}}",
        "window.addEventListener('error',function(e){parent.postMessage({type:'gene-runtime',state:'error',renderer:'webapp',message:e.message||'app script error'},'*');});",
        "if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',report);else report();[250,600,1100,1900,3000,4200].forEach(function(ms){setTimeout(report,ms);});",
        "})();"
      ].join("\n");
      return "<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1,maximum-scale=1'><meta http-equiv='Content-Security-Policy' content=\"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' data:; img-src data: blob:; font-src data: blob:; media-src data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'; frame-src 'none'\"><style>html,body{margin:0;min-height:100%;width:100%;font-family:Inter,Arial,sans-serif}*{box-sizing:border-box}" + css + "</style></head><body data-gene-project-kind='app'>" + html + (moduleScripts ? "<script>" + moduleScripts + "<\/script>" : "") + "<script>" + js + "<\/script><script>" + monitor + "<\/script></body></html>";
    }
    const html = project.files["game.html"].replace(/<script[\s\S]*?<\/script>/gi, "");
    const css = (project.files["game.css"] || "").replace(/<\/style/gi, "<\\/style");
    const js = (project.files["game.js"] || "").replace(/<\/script/gi, "<\\/script");
    const spec = project.files["game-spec.json"] || "{}";
    const engine = (() => { try { return JSON.parse(spec).engine === "webgl3d" ? "webgl3d" : "canvas2d"; } catch { return "canvas2d"; } })();
    const monitor = [
      "(function(){",
      "function report(){if(window.__geneFrameConfirmed)return;try{var c=document.getElementById('game-canvas')||document.querySelector('canvas');if(!c){parent.postMessage({type:'gene-runtime',state:'loaded',renderer:'unknown'},'*');return;}var spec={};try{spec=JSON.parse(document.body.getAttribute('data-gene-spec')||'{}')}catch(e){}if(document.body.getAttribute('data-gene-engine')==='webgl3d'){var gl=c.getContext('webgl2')||c.getContext('webgl')||c.getContext('experimental-webgl');if(!gl){parent.postMessage({type:'gene-runtime',state:'error',renderer:'webgl',message:'WebGL context unavailable'},'*');return;}requestAnimationFrame(function(){try{var w=gl.drawingBufferWidth||1,h=gl.drawingBufferHeight||1,pixels=new Uint8Array(w*h*4),step=Math.max(4,Math.floor(pixels.length/5000/4)*4),n=0,alpha=0;gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,pixels);var base=[pixels[0]||0,pixels[1]||0,pixels[2]||0];for(var i=0;i<pixels.length;i+=step){if(pixels[i+3]>0){alpha++;if(Math.abs(pixels[i]-base[0])+Math.abs(pixels[i+1]-base[1])+Math.abs(pixels[i+2]-base[2])>36)n++;}}if(n>12||alpha>12)window.__geneFrameConfirmed=true;parent.postMessage({type:'gene-runtime',state:window.__geneFrameConfirmed?'rendered':'loaded',visiblePixels:n,opaquePixels:alpha,renderer:'webgl'},'*');}catch(e){parent.postMessage({type:'gene-runtime',state:'error',renderer:'webgl',message:String(e)},'*');}});return;}var ctx=c.getContext('2d');if(!ctx){parent.postMessage({type:'gene-runtime',state:'error',renderer:'canvas2d',message:'Canvas 2D context unavailable'},'*');return;}var w=c.width||1,h=c.height||1,d=ctx.getImageData(0,0,w,h).data,n=0,alpha=0,step=Math.max(4,Math.floor(d.length/5000/4)*4),base=[d[0]||0,d[1]||0,d[2]||0];for(var i=0;i<d.length;i+=step){if(d[i+3]>0){alpha++;if(Math.abs(d[i]-base[0])+Math.abs(d[i+1]-base[1])+Math.abs(d[i+2]-base[2])>36)n++;}}if(n>12||alpha>12)window.__geneFrameConfirmed=true;parent.postMessage({type:'gene-runtime',state:window.__geneFrameConfirmed?'rendered':'loaded',visiblePixels:n,opaquePixels:alpha,renderer:'canvas2d'},'*');}catch(e){parent.postMessage({type:'gene-runtime',state:'error',message:String(e)},'*');}}",
      "window.addEventListener('error',function(e){parent.postMessage({type:'gene-runtime',state:'error',message:e.message||'script error'},'*');});",
      "window.addEventListener('message',function(e){if(e.data&&e.data.type==='gene-custom-edit-mode'){window.__geneCustomEdit=!!e.data.enabled;document.documentElement.style.cursor=window.__geneCustomEdit?'crosshair':'';}});",
      "document.addEventListener('click',function(e){if(!window.__geneCustomEdit)return;var el=e.target;if(!el||el===document.body||el===document.documentElement)return;e.preventDefault();e.stopPropagation();parent.postMessage({type:'gene-custom-selection',tag:el.tagName||'element',id:el.id||'',classes:typeof el.className==='string'?el.className:'',text:(el.innerText||el.getAttribute&&el.getAttribute('aria-label')||'').slice(0,90)},'*');},true);",
      "[250,650,1200,2000,3200,4300].forEach(function(ms){setTimeout(report,ms);});",
      "})();"
    ].join("\n");
    const instrumentation = "(function(){var original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,attributes){if(typeof type==='string'&&/webgl/i.test(type)){attributes=Object.assign({},attributes||{},{preserveDrawingBuffer:true});}return original.call(this,type,attributes);};})();";
    const assetBootstrap = buildRuntimeAssetBootstrap(project.files);
    return "<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no'><meta http-equiv='Content-Security-Policy' content=\"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' data:; img-src data: blob:; font-src data: blob:; media-src data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'; frame-src 'none'\"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#101419;color:#fff;font-family:Inter,Arial,sans-serif}*{box-sizing:border-box}" + css + "</style></head><body data-gene-spec='" + spec.replace(/&/g,"&amp;").replace(/'/g,"&#39;") + "' data-gene-engine='" + engine + "'><script>" + instrumentation + "<\/script>" + assetBootstrap + html + (moduleScripts ? "<script>" + moduleScripts + "<\/script>" : "") + "<script>" + js + "<\/script><script>" + monitor + "<\/script></body></html>";
  }, [project?.files, project?.id, previewKey]);

  const savedAssets = useMemo(() => {
    if (!project) return [];
    return Object.entries(project.files)
      .filter(([path]) => /^assets\/[a-zA-Z0-9_-]+\/asset\.json$/.test(path))
      .map(([path, source]) => {
        const id = path.split("/")[1];
        const prefix = "assets/" + id + "/";
        let manifest: any = {};
        try { manifest = JSON.parse(source); } catch {}
        return {
          id,
          prefix,
          name: String(manifest.name || manifest.recipe?.name || id),
          kind: String(manifest.kind || manifest.recipe?.kind || "prop"),
          style: String(manifest.style || manifest.recipe?.style || "stylized"),
          partCount: Number(manifest.partCount || manifest.recipe?.parts?.length || 0),
          triangleCount: Number(manifest.triangleCount || 0),
          recipe: manifest.recipe || null,
          objPath: prefix + "model.obj",
          mtlPath: prefix + "model.mtl",
          manifestPath: path
        };
      });
  }, [project?.files, project?.id]);

  const addActivity = (entry: string) => setActivity(prev => [new Date().toLocaleTimeString() + "  " + entry, ...prev].slice(0, 80));

  const runAgent = useCallback(async (text: string, operationOverride?: string, silent = false) => {
    if (!project || !text.trim()) return;
    const prompt = text.trim();
    const isReadOnlyConversation = !operationOverride && isConversationOnly(prompt);
    const canChatDuringBuild = buildInProgress && canQueueBuildRequests && isReadOnlyConversation;
    const queueRequest = () => {
      pendingBuildRequests.current.push(prompt);
      setQueuedRequestCount(pendingBuildRequests.current.length);
      setNotice("Queued " + pendingBuildRequests.current.length + " request(s). GENE will process them in order after the current build phase, preserving the active build checkpoint.");
      addActivity("Queued user request for after the current build phase.");
      setDraft("");
    };
    if (buildInProgress && canQueueBuildRequests && !operationOverride && !isReadOnlyConversation) {
      queueRequest();
      return;
    }
    if (canChatDuringBuild && parallelChatInProgress) {
      queueRequest();
      return;
    }
    if (busy && !canChatDuringBuild) return;
    if (parallelChatInProgress && !canChatDuringBuild) return;
    const parallelReadOnlyRequest = canChatDuringBuild;
    const isFirstIdea = !project.initialPrompt;
    const answerKey = operationOverride || planIntent === "update" ? undefined : project.question?.id;
    const nextAnswers = answerKey ? { ...project.answers, [answerKey]: prompt } : project.answers;
    let operation = operationOverride || "chat";
    if (!operationOverride) {
      if (searchMode) operation = "research";
      else if (isConversationOnly(prompt)) operation = "chat";
      else if (project.mode === "plan") operation = planIntent === "update" && project.initialPrompt ? "plan" : project.plan ? "plan" : "interview";
      else if (!Object.keys(project.files).length) operation = "build";
      else operation = "edit";
    }
    if (operation === "research") setSearchMode(false);
    if (operation === "surprise") {
      operation = "surprise";
    }
    const nextProject: GeneProject = {
      ...project,
      initialPrompt: isFirstIdea && operation !== "chat" && operation !== "research" ? prompt : project.initialPrompt,
      answers: nextAnswers,
      question: answerKey ? null : project.question,
      messages: silent
        ? [...project.messages, message("assistant", "The live preview reported a problem. I’m inspecting the current source and attempting a targeted repair (" + (silent ? autoRepairAttempts.current : autoRepairAttempts.current + 1) + "/2).")]
        : [...project.messages, message("user", prompt)],
      updatedAt: now()
    };
    setProject(current => {
      if (parallelReadOnlyRequest && current && current.id === nextProject.id) {
        const latestUserMessage = nextProject.messages[nextProject.messages.length - 1];
        return { ...current, messages: latestUserMessage ? [...current.messages, latestUserMessage] : current.messages, updatedAt: now() };
      }
      return nextProject;
    });
    setDraft("");
    if (operation === "build" || operation === "surprise") {
      setBuildInProgress(true);
      setCanQueueBuildRequests(["game-spec.json", "game.html", "game.css", "game.js"].every(path => Boolean(nextProject.files[path])));
    }
    if (parallelReadOnlyRequest) setParallelChatInProgress(true);
    else setBusy(true);
    setNotice("");
    if (!parallelReadOnlyRequest) {
      setRuntimeState("idle");
      setActivity([]);
    }
    if (operation === "build" || operation === "surprise") setShowActivity(true);
    addActivity("Request accepted: " + operation);
    setSection("chat");
    try {
      if (operation === "interview") addActivity("Preparing the next interview decision");
      if (operation === "plan") addActivity("Generating an implementation plan");
      if (operation === "build" || operation === "surprise") addActivity("Requesting " + (nextProject.kind === "app" ? "web app" : "game") + " source files from the model");
      if (operation === "edit") addActivity("Reading current project source and applying a targeted edit");
      let payload: any;
      let responseOk = true;
      const baseRequest = {
        mode: operation === "build" || operation === "edit" || operation === "surprise" || operation === "buildPart" ? "build" : nextProject.mode,
        model: aiModel,
        thinking: nextProject.thinking,
        history: nextProject.messages.slice(-4).map(m => ({ role: m.role, content: m.content.slice(0, 800) })),
        answers: nextAnswers,
        extendedPlanning
      };
      let activeBuildRun: BuildRun | null = nextProject.buildRun || null;
      if (operation === "build" || operation === "surprise") {
        // Generate small, independently validated files rather than asking Gemini
        // to fit an entire project into one large JSON response.
        const recovery = nextProject.buildRun?.checkpoints?.length
          ? recoverFromCheckpoint(nextProject.buildRun)
          : null;
        // Start with the four mandatory runtime files. The project spec and scope decide whether extras are warranted.
        // On resume, reuse the checkpoint's actual task manifest rather than assuming a fixed file count.
        let stagePaths = recovery
          ? recovery.run.tasks
              .filter(task => task.id.startsWith("stage-") && task.files.length > 0)
              .sort((a, b) => Number(a.id.slice(6)) - Number(b.id.slice(6)))
              .map(task => task.files[0])
          : ["game-spec.json", "game.html", "game.css", "game.js"];
        if (!stagePaths.length) stagePaths = ["game-spec.json", "game.html", "game.css", "game.js"];
        const stagedFiles: Record<string, string> = { ...(recovery?.files || nextProject.files) };
        let stagedPlan = nextProject.plan || null;
        let modelUsed = aiModel;
        const buildTasks = [
          ...stagePaths.map((path, index) => ({
            id: "stage-" + index,
            title: "Generate " + path,
            kind: (index === 0 ? "design" : index === 1 ? "scaffold" : "implement") as "design" | "scaffold" | "implement",
            dependsOn: index ? ["stage-" + (index - 1)] : [],
            files: [path],
            acceptance: ["Return the requested complete file", "Pass server-side source validation"]
          })),
          { id: "final-content-pass", title: nextProject.kind === "app" ? "Polish app interactions and error states" : "Expand the prototype into the full game", kind: "implement" as const, dependsOn: ["stage-" + (stagePaths.length - 1)], files: ["game.js", "game.css"], acceptance: [nextProject.kind === "app" ? "Primary user flows have working interactions and failure states" : "Full-game content extends beyond the prototype with progression and a complete ending", "Existing working controls and mechanics are preserved"] },
          { id: "validate-assembled", title: "Validate assembled playable project", kind: "test" as const, dependsOn: ["final-content-pass"], files: stagePaths, acceptance: ["Required files are present", "Project contract and JavaScript syntax pass"] }
        ];
        activeBuildRun = recovery
          ? {
              ...resumeBuild(recovery.run),
              tasks: resumeBuild(recovery.run).tasks.map(task =>
                task.id === "final-content-pass" || task.id === "validate-assembled"
                  ? { ...task, status: "queued" as const, lastError: undefined }
                  : task
              ),
              status: "running"
            }
          : createBuildRun({
              projectId: nextProject.id,
              tasks: buildTasks,
              prototypeObjectives: ["Boot and render", "Core controls and gameplay loop", "Reach a meaningful prototype conclusion"],
              fullGameContent: (nextProject.plan?.tasks || []).concat(["Distinct content beyond the playable prototype", "Meaningful progression and challenge variation", "Complete full-game ending"])
            });
        activeBuildRun = { ...activeBuildRun, status: "running" };
        if (recovery) addActivity("Resuming from checkpoint " + (recovery.run.checkpoints[recovery.run.checkpoints.length - 1]?.id || "latest") + "; previously passed file stages will be preserved.");
        setProject({ ...nextProject, buildRun: activeBuildRun, livingPreview: { status: "booting", updatedAt: now(), runtimeErrors: [], currentObjectives: ["Generating a playable project"], canContinuePlaying: false } });
        addActivity("GENE 1.4 coordinator started with " + buildTasks.length + " dependency-aware tasks; checkpoints are enabled.");
        const persistRun = (run: BuildRun, previewStatus: "booting" | "playable" | "stale" | "error" = "booting", sourceFiles: Record<string, string> = stagedFiles, passed: string[] = [], failed: string[] = [], reason: "task-complete" | "prototype-ready" | "repair-failed" = "task-complete") => {
          activeBuildRun = checkpointBuild(run, sourceFiles, { passed, failed }, reason, "Resume from this source snapshot and retry only unfinished or failed tasks.");
          setProject(current => current && current.id === nextProject.id ? { ...current, buildRun: activeBuildRun, livingPreview: { status: previewStatus, lastKnownGoodVersion: current.versions[0]?.number, updatedAt: now(), runtimeErrors: failed, currentObjectives: activeBuildRun?.prototype?.completedObjectives || [], canContinuePlaying: previewStatus === "playable" } } : current);
        };
        let finalContentPassSucceeded = false;
        for (let index = 0; index < stagePaths.length; index++) {
          const stagePath = stagePaths[index];
          if (activeBuildRun.tasks.find(task => task.id === "stage-" + index)?.status === "passed") {
            addActivity("Checkpoint recovery: kept completed stage " + stagePath + " unchanged.");
            continue;
          }
          activeBuildRun = setTaskStatus(activeBuildRun, "stage-" + index, "running");
          setProject(current => current && current.id === nextProject.id ? { ...current, buildRun: activeBuildRun } : current);
          addActivity("Build stage " + (index + 1) + ": generating " + stagePath + " (" + stagePaths.length + " files in the current manifest)");
          let stageSucceeded = false;
          let stageError = "";
          for (let stageAttempt = 1; stageAttempt <= 3 && !stageSucceeded; stageAttempt++) {
            const stageProject: GeneProject = { ...nextProject, files: { ...stagedFiles }, plan: stagedPlan };
            const stageMessage = "Create one complete file for staged build " + (index + 1) + " of " + stagePaths.length + ". Requested file path: " + stagePath + ". " +
              "Use the original project idea in the project context as the source of truth. " +
              (index === 0
                ? "This is stage 1. Return only game-spec.json and include the complete structured implementation plan in the JSON response. Include additionalFiles as an optional array of safe relative file paths required by this project (do not list the four core files there); use it for genuinely needed data, SVG, model/material, audio, text or module files, not filler. Keep the spec concise and valid. Choose a small but polished first playable version; defer secondary features."
                : /\.js$/i.test(stagePath) && stagePath !== "game.js"
                  ? "The approved plan and earlier staged files are in project context. Return only the requested module " + stagePath + ". It must be a browser-compatible classic script (no import/export), initialize window.GeneModules if absent, and expose its real reusable API as window.GeneModules[" + JSON.stringify(stagePath.split("/").pop()?.replace(/\.js$/i, "")) + "]. The key must match this filename exactly so the final runtime can call it. Keep it self-contained and safe if initialized before game.js. Match the project's actual features; do not add fake placeholder APIs."
                  : "The approved plan and earlier staged files are in project context. Return only " + stagePath + " with complete, compact, working source consistent with all previous files and every path in game-spec.json.additionalFiles. For game.js, wire the declared module APIs into actual gameplay rather than leaving them unused. Do not repeat other files or return partial snippets. Preserve the core request; prefer reliable core mechanics over scope.") +
              (stageAttempt > 1 ? " RETRY " + stageAttempt + "/3: the previous attempt for this file failed: " + stageError.slice(0, 500) + ". Return a smaller complete replacement file from scratch. Remove secondary details, not required functionality. Ensure strict valid JSON around the file content and valid syntax inside the file." + (/truncat|MAX_TOKENS|unterminated string|output limit/i.test(stageError) ? " OUTPUT-CUTOFF RECOVERY: the previous response exceeded the output limit; shrink this file by at least 35%, omit optional effects and verbose comments, reduce repeated objects, and close every JSON/code string and brace while preserving core mechanics." : "") : "") + (stageAttempt === 3 ? " LAST-RESORT SAFE SLICE: reduce this file output by at least 35 percent and prioritize the shortest runnable version of this exact file. No optional features, no long comments, no large data tables or asset arrays. Keep the essential game identity, correct controls and a reliable boot path." : "");
            try {
              const stageResponse = await fetch("/api/agent", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  ...baseRequest,
                  operation: "buildPart",
                  stagePath,
                  message: stageMessage,
                  project: stageProject
                })
              });
              const stagePayload = await stageResponse.json().catch(() => null);
              if (!stageResponse.ok || !stagePayload?.ok) {
                stageError = stagePayload?.error?.message || ("HTTP " + stageResponse.status + " from staged generation");
                addActivity("Stage " + stagePath + " attempt " + stageAttempt + " failed: " + stageError.slice(0, 180));
                continue;
              }
              const stageResult = stagePayload.result as AgentResponse;
              const file = (stageResult.files || []).find(item => item.path === stagePath);
              if (!file) {
                stageError = "The model did not return the requested file " + stagePath + ".";
                addActivity("Stage " + stagePath + " attempt " + stageAttempt + " returned no matching file");
                continue;
              }
              stagedFiles[stagePath] = file.content;
              if (stageResult.plan) stagedPlan = stageResult.plan;
              modelUsed = stagePayload.model || modelUsed;
              stageSucceeded = true;
              activeBuildRun = setTaskStatus(activeBuildRun, "stage-" + index, "passed");
              if (stagePath === "game-spec.json") {
                try {
                  const spec = JSON.parse(file.content);
                  const prototypeTarget = Number(spec.prototype?.targetMinutes);
                  const fullGameTarget = Number(spec.fullGame?.targetMinutes);
                  activeBuildRun = activeBuildRun ? { ...activeBuildRun,
                    prototype: { ...activeBuildRun.prototype!, targetMinutes: Number.isFinite(prototypeTarget) && prototypeTarget > 0 ? prototypeTarget : undefined },
                    fullGame: { ...activeBuildRun.fullGame!, targetMinutes: Number.isFinite(fullGameTarget) && fullGameTarget > 0 ? fullGameTarget : undefined }
                  } : activeBuildRun;
                  // The model's manifest is advisory, not the only source of architecture.
                  // Derive a project-specific module plan from the actual scope so substantial builds
                  // don't silently collapse into the four-file boot contract.
                  const scopeText = [
                    nextProject.initialPrompt,
                    ...(stagedPlan?.tasks || []),
                    ...(stagedPlan?.mechanics || [])
                  ].join(" ").toLowerCase();
                  const plannedModules: string[] = [];
                  if (nextProject.kind === "app") {
                    // Add app modules only when the actual requested feature scope needs them.
                    if (/complex state|shared state|multi-step|multi-page|undo|redo|workflow/.test(scopeText)) plannedModules.push("src/app/state.js");
                    if (/validation|form|signup|sign in|login|register|checkout|booking|contact/.test(scopeText)) plannedModules.push("src/app/validation.js", "src/app/forms.js");
                    if (/save|persist|offline|cart|inventory|account|profile|settings|dashboard|history/.test(scopeText)) plannedModules.push("src/app/persistence.js");
                    if (/search|filter|sort|catalog|marketplace|products|library/.test(scopeText)) plannedModules.push("src/app/search.js");
                    if (/chart|analytics|metrics|report|statistics/.test(scopeText)) plannedModules.push("src/app/analytics.js");
                  } else {
                    // A module is justified by a feature, not by a fixed template.
                    if (/touch|mobile|keyboard|wasd|arrow keys|controller|gamepad|input/.test(scopeText)) plannedModules.push("src/systems/input.js");
                    if (/progression|upgrade|unlock|level up|score chase|campaign|wave|difficulty/.test(scopeText)) plannedModules.push("src/systems/progression.js");
                    if (/multiple levels|level design|spawn table|procedural|enemy waves|collectibles|content system/.test(scopeText)) plannedModules.push("src/systems/content.js");
                    if (/story|dialogue|quest|mission|chapter|level|campaign|narrative|cutscene/.test(scopeText)) plannedModules.push("src/systems/narrative.js");
                    if (/combat|enemy|enemies|boss|weapon|shoot|attack|damage|survival/.test(scopeText)) plannedModules.push("src/systems/combat.js");
                    if (/3d|third.person|first.person|open.world|driving|vehicle|world.exploration/.test(scopeText)) plannedModules.push("src/systems/world.js", "src/systems/camera.js");
                    if (/co.op|local.multiplayer|two.player|split.screen|controller|gamepad/.test(scopeText)) plannedModules.push("src/systems/multiplayer.js");
                    if (/puzzle|craft|build|upgrade|skill.tree|resource|economy/.test(scopeText)) plannedModules.push("src/systems/economy.js");
                  }
                  const modelCandidates = [
                    ...(Array.isArray(spec.additionalFiles) ? spec.additionalFiles : []),
                    ...(Array.isArray(spec.projectFiles) ? spec.projectFiles.map((entry: any) => typeof entry === "string" ? entry : entry?.path) : [])
                  ];
                  spec.additionalFiles = [...new Set([...(Array.isArray(spec.additionalFiles) ? spec.additionalFiles : []), ...plannedModules])];
                  stagedFiles["game-spec.json"] = JSON.stringify(spec, null, 2);
                  const candidates = [...modelCandidates, ...plannedModules];
                  const core = new Set(["game-spec.json", "game.html", "game.css", "game.js"]);
                  const safe = (path: unknown): path is string => {
                    if (typeof path !== "string" || path.length > 240 || path.includes(String.fromCharCode(92)) || path.startsWith("/") ||
                      /^[a-zA-Z]:/.test(path) || path.split("/").some(part => !part || part === "." || part === "..") ||
                      path.split("").some(char => char.charCodeAt(0) < 32 || '<>:"|?*'.includes(char))) return false;
                    const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
                    return new Set(["json","js","svg","png","jpg","jpeg","webp","gif","obj","mtl","glsl","txt","md","gd","ts","wav","mp3","ogg","woff","woff2"]).has(extension);
                  };
                  const isRuntimeLoadablePath = (path: string) =>
                    /\.js$/i.test(path) ||
                    /^assets\/[a-zA-Z0-9_-]+\/(?:model\.obj|model\.mtl|asset\.json)$/i.test(path);
                  const safeManifest = [...new Set(candidates.filter((path: unknown): path is string =>
                    safe(path) && !core.has(path) && isRuntimeLoadablePath(path)
                  ))].slice(0, 96);
                  const omittedUnsupportedAssets = candidates.filter((path: unknown) =>
                    typeof path === "string" && safe(path) && !core.has(path) && !isRuntimeLoadablePath(path)
                  );
                  if (omittedUnsupportedAssets.length) addActivity("Skipped " + omittedUnsupportedAssets.length + " unsupported asset placeholder path(s); only browser modules and the supported Forge OBJ/MTL asset paths are staged here.");
                  spec.additionalFiles = safeManifest;
                  stagedFiles["game-spec.json"] = JSON.stringify(spec, null, 2);
                  const extras = safeManifest.filter(path => !stagedFiles[path]);
                  if (extras.length) {
                    const oldLastStage = stagePaths.length - 1;
                    stagePaths = [...stagePaths, ...extras];
                    const newTasks = extras.map((path, extraIndex) => {
                      const taskIndex = 4 + extraIndex;
                      return { id: "stage-" + taskIndex, title: "Generate " + path, kind: "implement" as const, dependsOn: [extraIndex === 0 ? "stage-" + oldLastStage : "stage-" + (taskIndex - 1)], attempts: 0, status: "queued" as const, files: [path], acceptance: ["Asset/module content is complete", "Path is safe and content stays within file budget"] };
                    });
                    activeBuildRun = {
                      ...activeBuildRun,
                      tasks: [
                        ...activeBuildRun.tasks.filter(task => task.id !== "validate-assembled"),
                        ...newTasks,
                        ...activeBuildRun.tasks.filter(task => task.id === "final-content-pass").map(task => ({ ...task, dependsOn: ["stage-" + (stagePaths.length - 1)] })),
                        ...activeBuildRun.tasks.filter(task => task.id === "validate-assembled").map(task => ({ ...task, dependsOn: ["final-content-pass"], files: [...stagePaths] }))
                      ]
                    };
                    addActivity("Expanded the build plan with " + extras.length + " additional dependency-aware project files from game-spec.json.");
                  }
                } catch {
                  addActivity("The spec did not define additional files; continuing with the four core runtime files.");
                }
              }
              persistRun(activeBuildRun, "booting", stagedFiles, ["Source response returned for " + stagePath], []);
              addActivity("Checkpoint saved after " + stagePath + " (" + file.content.length.toLocaleString() + " characters)");
              if (stagePath === "game.js" && ["game-spec.json", "game.html", "game.css", "game.js"].every(path => Boolean(stagedFiles[path]))) {
                activeBuildRun = {
                  ...activeBuildRun,
                  prototype: {
                    ...activeBuildRun.prototype!,
                    ready: true,
                    completedObjectives: ["Core files generated", "Initial source contract passed", "Ready for live preview; remaining build tasks continue"]
                  }
                };
                setProject(current => current && current.id === nextProject.id ? {
                  ...current,
                  files: { ...current.files, ...stagedFiles },
                  plan: stagedPlan,
                  buildRun: activeBuildRun,
                  livingPreview: { status: "playable", lastKnownGoodVersion: current.versions[0]?.number, updatedAt: now(), runtimeErrors: [], currentObjectives: activeBuildRun?.prototype?.completedObjectives || [], canContinuePlaying: true },
                  updatedAt: now()
                } : current);
                setPreviewOpen(true);
                setPreviewKey(value => value + 1);
                setRuntimeState("loaded");
                setSection("chat");
                setCanQueueBuildRequests(true);
                persistRun(activeBuildRun, "playable", stagedFiles, ["Core project files are present and ready for preview"], [], "prototype-ready");
                addActivity("Playable prototype published. Continue playing and chatting while GENE builds the remaining modules and full-game content.");
              }
            } catch (stageException) {
              stageError = stageException instanceof Error ? stageException.message : "Network error during stage.";
              addActivity("Stage " + stagePath + " attempt " + stageAttempt + " network failure");
            }
          }
          if (!stageSucceeded) {
            activeBuildRun = setTaskStatus(activeBuildRun, "stage-" + index, "failed", undefined, stageError);
            persistRun(activeBuildRun, "error", stagedFiles, [], [stagePath + ": " + stageError], "repair-failed");
            payload = { ok: false, error: { code: "GENE_BUILD_STAGE_FAILED", message: "GENE could not complete " + stagePath + " after three compact attempts. " + stageError + " The project keeps a recovery checkpoint for the next attempt." } };
            responseOk = false;
            break;
          }
        }
        if (responseOk) {
          activeBuildRun = setTaskStatus(activeBuildRun, "final-content-pass", "running");
          persistRun(activeBuildRun, "booting", stagedFiles, [], [], "task-complete");
          const finalPassMessage = nextProject.kind === "app"
            ? "FINAL APP QUALITY PASS. Improve the existing complete web app without redesigning it from scratch. Inspect game.html, game.css, game.js and game-spec.json. Implement the highest-value unfinished user flows, make every existing visible control work, add field validation and visible success/error/empty/loading states where relevant, prevent duplicate form submission, preserve user input on failure, and ensure keyboard-accessible interactions. Preserve the app's existing design, data model, routes and working behavior. Update only game.js and keep compatibility with the existing HTML/CSS. Return one complete replacement game.js, not a summary. Do not claim backend persistence or authentication unless actually implemented."
            : "FULL GAME EXPANSION PASS — NOT A PROTOTYPE POLISH PASS. Inspect the existing game-spec.json, game.html, game.css, game.js and all generated modules. Preserve the playable core and its controls, then implement a meaningful amount of the planned full-game content beyond the prototype: progression, distinct missions/levels or encounters, challenge variation, rewards/unlocks, and a satisfying full-game conclusion appropriate to this genre. Use the duration estimate from this specific project's specification if present; never insert universal 20-minute/2-hour targets and never pad playtime. Keep existing modules compatible, use them when they exist, and update only game.js. Return one complete replacement game.js with the full-game behavior implemented, not a plan or summary.";
          let finalPassError = "";
          for (let finalAttempt = 1; finalAttempt <= 3 && !finalContentPassSucceeded; finalAttempt++) {
            try {
              const retryNote = finalAttempt === 1 ? "" : " RETRY " + finalAttempt + "/3. The previous final pass failed: " + finalPassError.slice(0, 700) + ". Return a smaller complete file. Do not repeat the whole design description; preserve current controls, remove verbose data/tables, and ensure the entire response is valid and closed.";
              const finalPassResponse = await fetch("/api/agent", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  ...baseRequest,
                  operation: "buildPart",
                  stagePath: "game.js",
                  message: finalPassMessage + " You MUST integrate the already generated modules by calling their documented window.GeneModules APIs where relevant. Preserve existing working input handling. Keep the response concise enough to fit a single complete file. " + retryNote,
                  project: { ...nextProject, files: { ...stagedFiles }, plan: stagedPlan }
                })
              });
              const finalPassPayload = await finalPassResponse.json().catch(() => null);
              const finalGameFile = (finalPassPayload?.result?.files || []).find((file: { path?: string }) => file.path === "game.js");
              if (finalPassResponse.ok && finalPassPayload?.ok && finalGameFile && typeof finalGameFile.content === "string" && finalGameFile.content.trim().length > 80) {
                stagedFiles["game.js"] = finalGameFile.content;
                finalContentPassSucceeded = true;
                modelUsed = finalPassPayload.model || modelUsed;
                activeBuildRun = setTaskStatus(activeBuildRun, "final-content-pass", "passed");
                persistRun(activeBuildRun, "booting", stagedFiles, ["Final content pass returned a complete game.js replacement"], [], "task-complete");
                addActivity(nextProject.kind === "app" ? "App interaction and error-state polish pass completed." : "Full-game expansion pass completed after the playable core was available.");
              } else {
                finalPassError = String(finalPassPayload?.error?.message || "The model did not return a complete, non-empty game.js replacement.");
                addActivity("Final content pass attempt " + finalAttempt + "/3 failed: " + finalPassError.slice(0, 180));
              }
            } catch (finalPassException) {
              finalPassError = finalPassException instanceof Error ? finalPassException.message : "Unknown final content pass error";
              addActivity("Final content pass attempt " + finalAttempt + "/3 failed: " + finalPassError.slice(0, 180));
            }
          }
          if (!finalContentPassSucceeded) {
            activeBuildRun = setTaskStatus(activeBuildRun, "final-content-pass", "failed", undefined, finalPassError || "Full-game expansion failed after three attempts.");
            persistRun(activeBuildRun, "stale", stagedFiles, [], ["Final content pass: " + (finalPassError || "failed after three attempts")], "repair-failed");
            addActivity("Final content pass failed after three attempts; preserving the last known-good checkpoint.");
          }
          addActivity("Checking assembled project contract and source files");
          let validationPayload: any = null;
          let validationOk = false;
          for (let validationAttempt = 0; validationAttempt < 3; validationAttempt++) {
            const validateResponse = await fetch("/api/agent", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                ...baseRequest,
                operation: "validateBuild",
                message: "Validate assembled staged project",
                project: { ...nextProject, files: stagedFiles, plan: stagedPlan }
              })
            });
            validationPayload = await validateResponse.json().catch(() => null);
            if (validateResponse.ok && validationPayload?.ok) {
              // Validation may deterministically normalize a missing spec contract.
              // Persist those normalized files into the staged snapshot before commit.
              for (const normalizedFile of (validationPayload?.result?.files || [])) {
                if (normalizedFile && typeof normalizedFile.path === "string" && typeof normalizedFile.content === "string") {
                  stagedFiles[normalizedFile.path] = normalizedFile.content;
                }
              }
              validationOk = true;
              break;
            }
            const validationError = String(validationPayload?.error?.message || "The assembled project failed validation.");
            addActivity("Final validation failed: " + validationError.slice(0, 180));
            if (validationAttempt >= 2) break;

            const repairPath = stagePaths.find(path => validationError.includes(path)) ||
              (/input handlers|no keyboard.*touch.*controller|event handlers.*found/i.test(validationError) ? "game.js" :
               /spec|title|engine|mechanic|objective|win condition|loss condition|performance budget|genre|controls/i.test(validationError) ? "game-spec.json" :
               /html|canvas|script|semantic|markup/i.test(validationError) ? "game.html" :
               /css|style|layout/i.test(validationError) ? "game.css" : "game.js");
            addActivity("Attempting targeted repair of " + repairPath + " (" + (validationAttempt + 1) + "/2)");
            let repaired = false;
            for (let repairAttempt = 1; repairAttempt <= 2 && !repaired; repairAttempt++) {
              const repairResponse = await fetch("/api/agent", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  ...baseRequest,
                  operation: "buildPart",
                  stagePath: repairPath,
                  message: "TARGETED FINAL-VALIDATION REPAIR. Change only " + repairPath + " to fix this exact validation failure: " + validationError.slice(0, 900) + ". Existing complete project files and the approved plan are in context. Preserve the requested game's/app's visual identity and working mechanics. Return one complete replacement file for " + repairPath + ", not a patch, no other files, no inline executable script tags in game.html, and no provider/AI watermark. Keep it concise and syntactically valid." + (repairAttempt === 2 ? " Previous repair attempt failed. Use the simplest safe complete implementation that fixes the reported requirement." : ""),
                  project: { ...nextProject, files: { ...stagedFiles }, plan: stagedPlan }
                })
              });
              const repairPayload = await repairResponse.json().catch(() => null);
              const repairFile = (repairPayload?.result?.files || []).find((file: { path?: string }) => file.path === repairPath);
              if (repairResponse.ok && repairPayload?.ok && repairFile && typeof repairFile.content === "string") {
                stagedFiles[repairPath] = repairFile.content;
                modelUsed = repairPayload.model || modelUsed;
                repaired = true;
                addActivity("Repaired " + repairPath + "; rerunning full-project validation");
              } else {
                addActivity("Repair attempt for " + repairPath + " failed: " + String(repairPayload?.error?.message || "no valid replacement file").slice(0, 160));
              }
            }
            if (!repaired) break;
          }
          if (!validationOk) {
            activeBuildRun = setTaskStatus(activeBuildRun, "validate-assembled", "failed", undefined, String(validationPayload?.error?.message || "Assembled source validation failed"));
            persistRun(activeBuildRun, "error", stagedFiles, [], [String(validationPayload?.error?.message || "Assembled source validation failed")], "repair-failed");
            payload = validationPayload || { ok: false, error: { message: "The assembled project failed validation after targeted repair attempts." } };
            responseOk = false;
          } else {
            if (finalContentPassSucceeded) {
              activeBuildRun = setTaskStatus(activeBuildRun, "validate-assembled", "running");
              activeBuildRun = setTaskStatus(activeBuildRun, "validate-assembled", "passed");
            } else {
              // Release validation depends on successful full-game expansion. Keep the
              // partial core, but don't mark a failed expansion as a completed release.
              activeBuildRun = setTaskStatus(activeBuildRun, "validate-assembled", "skipped", undefined, "Skipped release completion because the final-content task failed.");
            }
            activeBuildRun = { ...activeBuildRun, status: finalContentPassSucceeded ? "completed" : "failed", prototype: { ...activeBuildRun.prototype!, ready: false } };
            persistRun(activeBuildRun, finalContentPassSucceeded ? "booting" : "stale", stagedFiles,
              ["Assembled source validation passed; browser runtime still needs to render"],
              finalContentPassSucceeded ? [] : ["Final content pass failed; this is a partial build, not a complete full game/app."],
              finalContentPassSucceeded ? "prototype-ready" : "repair-failed");
            const normalizedFiles = Array.isArray(validationPayload?.result?.files) && validationPayload.result.files.length
              ? validationPayload.result.files as Array<{ path: string; content: string }>
              : stagePaths.map(path => ({ path, content: stagedFiles[path] }));
            for (const file of normalizedFiles) stagedFiles[file.path] = file.content;
            payload = {
              ok: true,
              aiMode: "multi-provider",
              model: modelUsed,
              result: {
                reply: finalContentPassSucceeded ? "Generated the playable core, expanded the full-game content, and validated the assembled source. The browser preview still needs runtime verification." : "The playable core was generated and its source validated, but the final full-game/app quality pass failed. This is a partial build, not the completed project. The last source checkpoint is preserved; retry the final build pass after resolving the reported provider or generation error.",
                plan: stagedPlan,
                files: normalizedFiles,
                complete: finalContentPassSucceeded,
                needsUserDecision: !finalContentPassSucceeded
              }
            };
          }
        }
      } else {
        const response = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...baseRequest,
            operation,
            message: prompt,
            project: nextProject
          })
        });
        payload = await response.json().catch(() => null);
        responseOk = response.ok;
      }
      if (!responseOk || !payload?.ok) {
        const error = payload?.error?.message || "GENE could not complete the request.";
        addActivity("Request failed: " + error);
        const failed = { ...nextProject, buildRun: activeBuildRun || nextProject.buildRun || null, livingPreview: activeBuildRun ? { status: "error" as const, lastKnownGoodVersion: nextProject.versions[0]?.number, updatedAt: now(), runtimeErrors: [error], currentObjectives: [], canContinuePlaying: false } : nextProject.livingPreview || null, messages: [...nextProject.messages, message("assistant", error, "error")], updatedAt: now() };
        setProject(failed);
        setNotice(error);
        return;
      }
      const result: AgentResponse = payload.result;
      addActivity("Response received from " + (payload.model || payload.aiMode || "agent"));
      if (payload.reviewedBy) addActivity("Independent code review completed by " + payload.reviewedBy);
      let files = { ...nextProject.files };
      const changedPaths: string[] = [];
      (result.files || []).forEach(file => { files[file.path] = file.content; changedPaths.push(file.path); });
      let versions = nextProject.versions;
      if (changedPaths.length) {
        if (operation === "build" || operation === "surprise") autoRepairAttempts.current = 0;
        const version: BuildVersion = {
          number: (versions[0]?.number || 0) + 1,
          label: operation === "surprise" ? "Surprise build" : operation === "build" ? "Initial build" : "AI edit",
          files: { ...files },
          createdAt: now(),
          testSummary: "Server validated required files and JavaScript syntax before returning this version. Browser runtime evidence pending."
        };
        versions = [version, ...versions].slice(0, 8);
        addActivity("Saved version " + String(version.number).padStart(3, "0") + " with " + changedPaths.length + " changed files");
      }
      if (result.plan) addActivity("Plan updated: " + result.plan.tasks.length + " task(s)");
      const assistantMessage = message("assistant", result.reply || "Done.", changedPaths.length ? "build" : result.plan ? "plan" : result.question ? "question" : undefined);
      const updated: GeneProject = {
        ...nextProject,
        name: (nextProject.name === "Untitled game" || nextProject.name === "Untitled app") ? (result.plan?.title || (isFirstIdea && operation !== "chat" && operation !== "research" ? prompt.split(/[.!?]/)[0].slice(0, 38) : nextProject.name)) : nextProject.name,
        mode: operation === "build" || operation === "edit" || operation === "surprise" ? "build" : nextProject.mode,
        answers: nextAnswers,
        question: operation === "research" || operation === "chat" ? nextProject.question : (result.question || null),
        plan: result.plan || nextProject.plan,
        files,
        versions,
        buildRun: activeBuildRun || nextProject.buildRun || null,
        livingPreview: changedPaths.length ? { status: "booting", lastKnownGoodVersion: versions[0]?.number, updatedAt: now(), runtimeErrors: [], currentObjectives: ["Waiting for browser render confirmation"], canContinuePlaying: false } : nextProject.livingPreview || null,
        activeFile: changedPaths.includes(nextProject.activeFile) ? changedPaths[0] : (changedPaths[0] || nextProject.activeFile),
        messages: [...nextProject.messages, assistantMessage],
        updatedAt: now()
      };
      setProject(current => {
        if (!current || current.id !== updated.id) return updated;
        const knownIds = new Set(current.messages.map(item => item.id));
        const appendedMessages = updated.messages.filter(item => !knownIds.has(item.id));
        const isReadOnlyReply = operation === "chat" || operation === "research";
        if (isReadOnlyReply) {
          return { ...current, messages: [...current.messages, ...appendedMessages], updatedAt: now() };
        }
        if (!buildInProgress) return updated;
        return {
          ...current,
          ...updated,
          files: { ...current.files, ...updated.files },
          versions: updated.versions,
          plan: updated.plan,
          buildRun: activeBuildRun || current.buildRun || updated.buildRun,
          livingPreview: changedPaths.length ? updated.livingPreview : current.livingPreview,
          activeFile: updated.activeFile,
          messages: [...current.messages, ...appendedMessages],
          updatedAt: now()
        };
      });
      if (changedPaths.length) {
        addActivity("Files updated: " + changedPaths.join(", "));
        setSection("chat");
        setPreviewOpen(true);
        setPreviewKey(n => n + 1);
        setRuntimeState("loaded");
        if (localAgentStatus === "connected" && localAgentToken) {
          try {
            const diskResult = await writeProjectToDisk(updated, localAgentUrl, localAgentToken);
            addActivity("Local Agent wrote version " + String(versions[0]?.number || 0).padStart(3, "0") + " to disk and validated the source.");
            setNotice("Version " + String(versions[0]?.number || 0).padStart(3, "0") + " was saved to the browser project and synced to disk: " + diskResult.projectPath);
          } catch (syncError) {
            const why = syncError instanceof Error ? syncError.message : "unknown local sync error";
            addActivity("Local Agent auto-sync failed: " + why);
            setNotice("The source version is saved in GENE, but Local Agent sync failed: " + why + ". Use Sync files to retry.");
          }
        }
      }
    } catch (error) {
      const text = explainAgentError(error);
      const failed = { ...nextProject, buildRun: nextProject.buildRun || null, livingPreview: nextProject.livingPreview || null, messages: [...nextProject.messages, message("assistant", "Request failed: " + text + ". No unverified changes were applied.", "error")] };
      setProject(current => {
        if (!current || current.id !== failed.id) return failed;
        const knownIds = new Set(current.messages.map(item => item.id));
        return {
          ...current,
          buildRun: current.buildRun,
          files: current.files,
          versions: current.versions,
          plan: current.plan,
          livingPreview: current.livingPreview,
          messages: [...current.messages, ...failed.messages.filter(item => !knownIds.has(item.id))],
          updatedAt: now()
        };
      });
      setNotice(text);
      addActivity("Network/response error: " + text);
    } finally {
      if (parallelReadOnlyRequest) setParallelChatInProgress(false);
      else setBusy(false);
      if (operation === "build" || operation === "surprise") {
        setBuildInProgress(false);
        setCanQueueBuildRequests(false);
      }
    }
  }, [project, busy, buildInProgress, canQueueBuildRequests, aiModel, searchMode, planIntent, localAgentStatus, localAgentToken, localAgentUrl]);

  useEffect(() => {
    if (busy || buildInProgress || !project || pendingBuildRequests.current.length === 0) return;
    const next = pendingBuildRequests.current.shift();
    setQueuedRequestCount(pendingBuildRequests.current.length);
    if (!next) return;
    setNotice("Processing queued request (" + (pendingBuildRequests.current.length + 1) + " remaining after this one).");
    void runAgent(next);
  }, [busy, buildInProgress, project?.id, queuedRequestCount, runAgent]);

  useEffect(() => {
    if (runtimeState !== "error" || busy || !project?.files["game.js"] || !project.files["game.html"] || autoRepairAttempts.current >= 2) return;
    autoRepairAttempts.current += 1;
    const attempt = autoRepairAttempts.current;
    const timer = window.setTimeout(() => {
      void runAgent(
        "Automated runtime repair attempt " + attempt + " of 2. The game preview failed to render or emitted a runtime error. Read the complete current project files and make the smallest safe fix. Runtime status: " + (notice || "no visible frame confirmed") + ". Return only genuinely changed files.",
        "edit",
        true
      );
    }, 450);
    return () => window.clearTimeout(timer);
  }, [runtimeState, busy, project?.id, project?.files, notice, runAgent]);

  async function verifyLocalAgent(url: string, token: string, announce = true): Promise<boolean> {
    const normalizedUrl = url.trim().replace(/\/+$/, "");
    setLocalAgentStatus("checking");
    try {
      const healthResponse = await fetch(normalizedUrl + "/health", { cache: "no-store" });
      if (!healthResponse.ok) throw new Error("Local Agent health endpoint returned HTTP " + healthResponse.status);
      const health = await healthResponse.json();
      if (health.app !== "gene-local-agent") throw new Error("The endpoint answered, but it is not a GENE Local Agent.");
      const projectsResponse = await fetch(normalizedUrl + "/api/projects", { headers: { "X-GENE-TOKEN": token }, cache: "no-store" });
      const projectsData = await projectsResponse.json().catch(() => ({}));
      if (!projectsResponse.ok || !projectsData.ok) throw new Error(projectsData?.error?.message || "Local Agent authentication failed.");
      setLocalAgentUrl(normalizedUrl);
      setLocalAgentToken(token);
      setLocalAgentWorkspace(String(health.workspace || ""));
      setLocalAgentProjects(Array.isArray(projectsData.projects) ? projectsData.projects.length : 0);
      setLocalAgentStatus("connected");
      localStorage.setItem("gene.local-agent-url", normalizedUrl);
      localStorage.setItem("gene.local-agent-token", token);
      if (announce) setNotice("Connected to GENE Local Agent. Workspace: " + String(health.workspace || "local workspace") + ".");
      return true;
    } catch (error) {
      setLocalAgentStatus("error");
      if (announce) setNotice("Local Agent connection failed: " + (error instanceof Error ? error.message : "unknown error") + ". Make sure it is running and GENE_ALLOWED_ORIGINS includes this website's origin.");
      return false;
    }
  }

  async function promptConnectLocalAgent(): Promise<{ url: string; token: string } | null> {
    const enteredUrl = window.prompt("GENE Local Agent URL", localAgentUrl || "http://127.0.0.1:38421");
    if (!enteredUrl) return null;
    const enteredToken = window.prompt("Paste the private token printed in the Local Agent terminal. Do not share it with anyone.");
    if (!enteredToken) return null;
    const url = enteredUrl.trim().replace(/\/+$/, "");
    const token = enteredToken.trim();
    const connected = await verifyLocalAgent(url, token, true);
    return connected ? { url, token } : null;
  }

  async function connectLocalAgent() {
    await promptConnectLocalAgent();
  }

  async function writeProjectToDisk(targetProject: GeneProject, url: string, token: string) {
    const normalizedUrl = url.trim().replace(/\/+$/, "");
    const response = await fetch(normalizedUrl + "/api/projects/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-GENE-TOKEN": token },
      body: JSON.stringify({
        id: targetProject.id,
        name: targetProject.name,
        initialPrompt: targetProject.initialPrompt,
        files: targetProject.files,
        plan: targetProject.plan,
        versions: targetProject.versions.slice(0, 20),
        references: (targetProject.references || []).slice(0, 12)
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data?.error?.message || "Local Agent refused the sync (HTTP " + response.status + ").");
    localStorage.setItem("gene.local-agent-sync." + targetProject.id, targetProject.updatedAt);
    setLastSyncedUpdatedAt(targetProject.updatedAt);
    setLastLocalPlayUrl(String(data.playUrl || ""));
    setLocalAgentWorkspace(String(data.projectPath || localAgentWorkspace));
    setLocalAgentStatus("connected");
    addActivity("Wrote " + data.filesWritten + " source files to " + data.projectPath);
    if (data.referenceFilesWritten) addActivity("Copied " + data.referenceFilesWritten + " reference files to disk");
    if (data.versionsWritten) addActivity("Saved " + data.versionsWritten + " historical source snapshots");
    return data;
  }

  async function syncToLocalAgent() {
    if (!project || busy) return;
    if (!Object.keys(project.files).length) {
      setNotice("Build the game source first, then sync it to real files.");
      return;
    }
    let url = localAgentUrl;
    let token = localAgentToken;
    if (localAgentStatus !== "connected" || !token) {
      const connection = await promptConnectLocalAgent();
      if (!connection) return;
      url = connection.url;
      token = connection.token;
    }
    setBusy(true);
    setNotice("");
    addActivity("Syncing actual source files to GENE Local Agent");
    try {
      const data = await writeProjectToDisk(project, url, token);
      setNotice("Wrote " + data.filesWritten + " source files to disk at " + data.projectPath + ". Local play URL: " + data.playUrl + ". Existing files were backed up in the Local Agent history folder.");
    } catch (error) {
      const why = error instanceof Error ? error.message : "network error";
      setNotice("Local file sync failed: " + why + ". A hosted HTTPS page may require GENE_ALLOWED_ORIGINS to include its exact origin.");
      addActivity("Local file sync failed: " + why);
    } finally {
      setBusy(false);
    }
  }

  function downloadAssetFile(path: string) {
    if (!project || !project.files[path]) return;
    const blob = new Blob([project.files[path]], { type: path.endsWith(".mtl") || path.endsWith(".obj") ? "text/plain" : "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = path.split("/").pop() || "asset.txt";
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function generateForgeAsset() {
    if (!project || forgeBusy || !forgePrompt.trim()) return;
    const targetId = forgeTargetId;
    let existingRecipe: unknown = null;
    if (targetId) {
      try {
        existingRecipe = JSON.parse(project.files["assets/" + targetId + "/asset.json"] || "null")?.recipe || null;
      } catch {}
      if (!existingRecipe) {
        setForgeNotice("The selected asset has no readable recipe. Start a new asset instead.");
        return;
      }
    }
    setForgeBusy(true);
    setForgeNotice("");
    addActivity((targetId ? "Editing existing mesh " + targetId : "Generating a new 3D mesh") + " through GENE Forge");
    try {
      const response = await fetch("/api/forge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: forgePrompt.trim(),
          kind: forgeKind,
          quality: forgeQuality,
          existingRecipe,
          projectStyle: [project.initialPrompt, project.plan?.summary, project.plan?.title].filter(Boolean).join("\n"),
          references: (project.references || []).slice(0, 2)
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok || !data.asset?.files?.["model.obj"] || !data.asset?.files?.["model.mtl"] || !data.asset?.files?.["asset.json"]) {
        throw new Error(data?.error?.message || "Forge returned no validated mesh files.");
      }
      const assetId = targetId || ("asset-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6));
      const prefix = "assets/" + assetId + "/";
      const manifest = {
        ...JSON.parse(data.asset.files["asset.json"]),
        assetId,
        name: data.asset.name,
        kind: data.asset.kind,
        style: data.asset.style,
        partCount: data.asset.partCount,
        triangleCount: data.asset.triangleCount,
        vertexCount: data.asset.vertexCount,
        files: { obj: prefix + "model.obj", mtl: prefix + "model.mtl" }
      };
      const files = {
        ...project.files,
        [prefix + "model.obj"]: String(data.asset.files["model.obj"]),
        [prefix + "model.mtl"]: String(data.asset.files["model.mtl"]),
        [prefix + "asset.json"]: JSON.stringify(manifest, null, 2)
      };
      const versionNumber = (project.versions[0]?.number || 0) + 1;
      const version: BuildVersion = {
        number: versionNumber,
        label: (targetId ? "Edited asset: " : "Generated asset: ") + String(data.asset.name),
        files: { ...files },
        createdAt: now(),
        testSummary: "GENE generated and validated OBJ geometry, MTL materials and an asset recipe. Game-scene integration and gameplay behavior are not yet verified."
      };
      const reply = message("assistant",
        (targetId ? "Updated" : "Generated") + " **" + data.asset.name + "**. Saved real geometry files at " + prefix + "model.obj and " + prefix + "model.mtl. The mesh contains " + Number(data.asset.triangleCount).toLocaleString() + " triangles across " + data.asset.partCount + " parts. This confirms mesh file generation; integration into the game scene is a separate step.",
        "build"
      );
      const updated: GeneProject = {
        ...project,
        files,
        versions: [version, ...project.versions].slice(0, 8),
        messages: [...project.messages, reply],
        updatedAt: now()
      };
      setProject(updated);
      setForgeTargetId(assetId);
      setForgePrompt("");
      setSection("assets");
      addActivity("Wrote " + prefix + "model.obj (" + String(data.asset.triangleCount) + " triangles)");
      addActivity("Wrote " + prefix + "model.mtl and asset recipe");
      setForgeNotice("Mesh files saved in project version " + versionNumber + ". Drag the viewport to inspect the actual generated geometry. Use Edit this asset to refine the same recipe.");
      if (localAgentStatus === "connected" && localAgentToken && updated.files["game.html"] && updated.files["game.js"]) {
        try {
          const diskResult = await writeProjectToDisk(updated, localAgentUrl, localAgentToken);
          addActivity("Forge asset and updated manifest synced to disk at " + diskResult.projectPath);
          setForgeNotice("Mesh saved as version " + versionNumber + " and synced to disk: " + diskResult.projectPath);
        } catch (error) {
          setForgeNotice("Mesh saved in GENE, but disk sync failed: " + (error instanceof Error ? error.message : "unknown error") + ". Use Sync files to retry.");
        }
      }
    } catch (error) {
      const why = error instanceof Error ? error.message : "unknown Forge error";
      setForgeNotice("Forge failed: " + why + ". No asset files were marked as generated.");
      addActivity("Forge failed: " + why);
    } finally {
      setForgeBusy(false);
    }
  }

  function removeForgeAsset(assetId: string) {
    if (!project || forgeBusy) return;
    const prefix = "assets/" + assetId + "/";
    const files = Object.fromEntries(Object.entries(project.files).filter(([path]) => !path.startsWith(prefix)));
    const versionNumber = (project.versions[0]?.number || 0) + 1;
    const version: BuildVersion = {
      number: versionNumber,
      label: "Removed asset: " + assetId,
      files: { ...files },
      createdAt: now(),
      testSummary: "Asset files were removed from this project version. Runtime integration was not automatically evaluated."
    };
    const updated: GeneProject = { ...project, files, versions: [version, ...project.versions].slice(0, 8), updatedAt: now() };
    setProject(updated);
    if (forgeTargetId === assetId) setForgeTargetId(null);
    setForgeNotice("Removed asset files in version " + versionNumber + ". Previous files remain in version history.");
    if (localAgentStatus === "connected" && localAgentToken && updated.files["game.html"] && updated.files["game.js"]) {
      void writeProjectToDisk(updated, localAgentUrl, localAgentToken).catch(error => setForgeNotice("Asset removed in browser project, but disk sync failed: " + (error instanceof Error ? error.message : "unknown error")));
    }
  }

  function openLocalAgentGame() {
    const url = lastLocalPlayUrl || (localAgentUrl.replace(/\/+$/, "") + "/play/" + encodeURIComponent(project?.id || ""));
    if (!project?.id || localAgentStatus !== "connected") {
      setNotice("Connect and sync to the Local Agent first.");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function addReferences(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const selected = Array.from(input.files || []);
    input.value = "";
    if (!project || !selected.length) return;
    const current = project.references || [];
    let totalBytes = current.reduce((sum, ref) => sum + ref.size, 0);
    const added: GeneProject["references"] = [];
    const skipped: string[] = [];
    for (const file of selected) {
      if (file.size > 450 * 1024) { skipped.push(file.name + " (over 450 KB)"); continue; }
      if (totalBytes + file.size > 950 * 1024) { skipped.push(file.name + " (project reference budget reached)"); continue; }
      if (/^image\/(jpeg|png|webp|gif)$/.test(file.type)) {
        try {
          const dataUrl = await readDataUrl(file);
          const dataBase64 = dataUrl.split(",")[1] || "";
          if (!dataBase64) { skipped.push(file.name + " (image data unreadable)"); continue; }
          added.push({ id: uid(), name: file.name, mimeType: file.type, kind: "image", dataBase64, size: file.size });
          totalBytes += file.size;
        } catch { skipped.push(file.name + " (could not read)"); }
      } else if (ALLOWED_REFERENCE_TEXT.test(file.name) || file.type.startsWith("text/") || file.type === "application/json") {
        try {
          const textContent = await readText(file);
          if (textContent.length > 60_000) { skipped.push(file.name + " (text over 60 KB)"); continue; }
          added.push({ id: uid(), name: file.name, mimeType: file.type || "text/plain", kind: "text", textContent, size: file.size });
          totalBytes += file.size;
        } catch { skipped.push(file.name + " (could not read)"); }
      } else {
        skipped.push(file.name + " (use an image or text/source file)");
      }
    }
    if (added.length) {
      setProject({ ...project, references: [...current, ...added], updatedAt: now() });
      setNotice("Attached " + added.length + " reference file(s). The selected AI provider will receive these references with the next request.");
    }
    if (skipped.length) setNotice((added.length ? "Attached " + added.length + ". " : "") + "Skipped: " + skipped.join(", "));
  }

  function removeReference(id: string) {
    if (!project) return;
    setProject({ ...project, references: (project.references || []).filter(ref => ref.id !== id), updatedAt: now() });
  }

  async function enhanceDraftPrompt() {
    if (!project || !draft.trim() || enhancingPrompt || busy) return;
    setEnhancingPrompt(true);
    setNotice("");
    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: "enhancePrompt",
          mode: "plan",
          model: aiModel,
          thinking: project.thinking,
          extendedPlanning,
          message: draft.trim(),
          project,
          history: project.messages.slice(-8).map(m => ({ role: m.role, content: m.content.slice(0, 900) })),
          answers: project.answers
        })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok || typeof payload?.result?.reply !== "string") {
        throw new Error(payload?.error?.message || "GENE couldn't enhance this prompt. Your original text is unchanged.");
      }
      setDraft(payload.result.reply.slice(0, 7000));
      setNotice("Prompt enhanced. Review it before sending; nothing has been built or changed yet.");
      addActivity("Prompt enhanced; original project files were not changed.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Prompt enhancement failed.");
    } finally {
      setEnhancingPrompt(false);
    }
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void runAgent(draft);
  };

  function startBuild() {
    if (!project) return;
    const next = { ...project, mode: "build" as Mode, question: null, updatedAt: now() };
    setProject(next);
    void runAgent(project.kind === "app" ? "Implement the approved plan as a complete, polished and interactive web app. Start with the highest-value user flow and include all required source files." : "Implement the approved plan as a complete playable game. Start with the highest-value vertical slice and include all required source files.", "build");
  }

  function surpriseMe() {
    if (!project || busy) return;
    setProject({ ...project, mode: "build", question: null });
    void runAgent(project.kind === "app" ? "Invent and build an original, polished web app with one useful central workflow. Choose smart defaults and make every visible control functional." : "Invent and build an original small browser game with one surprising central mechanic. Choose smart defaults and make it genuinely playable.", "surprise");
  }

  async function importProject(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      setNotice("Import rejected: ZIP is larger than GENE's 25 MB browser import limit.");
      return;
    }
    try {
      let manifest: any = {};
      let currentFiles: Record<string, string> = {};
      let versionsByNumber = new Map<number, BuildVersion>();
      let importedKind: ProjectKind = "game";
      let references: NonNullable<GeneProject["references"]> = [];
      if (file.name.toLowerCase().endsWith(".zip")) {
        const zip = await JSZip.loadAsync(file);
        const manifestEntry = zip.file("gene.project.json");
        if (!manifestEntry) throw new Error("This ZIP has no gene.project.json manifest.");
        manifest = JSON.parse(await manifestEntry.async("string"));
        importedKind = manifest.kind === "app" || manifest.plan?.engine === "webapp" ? "app" : "game";
        let totalChars = 0;
        for (const [path, entry] of Object.entries(zip.files)) {
          if ((entry as JSZip.JSZipObject).dir) continue;
          if (path === "gene.project.json" || path === "README.md" || path.startsWith("references/") || path.startsWith("__MACOSX/")) continue;
          const versionMatch = path.match(/^versions\/(\d+)\/(.+)$/);
          const text = await (entry as JSZip.JSZipObject).async("string");
          totalChars += text.length;
          if (totalChars > 12_000_000) throw new Error("Import rejected: extracted text exceeds the 12 MB safety limit.");
          if (versionMatch) {
            const versionNumber = Number(versionMatch[1]);
            const restPath = versionMatch[2];
            if (restPath === "version.json") {
              const meta = JSON.parse(text);
              versionsByNumber.set(versionNumber, { number: versionNumber, label: String(meta.label || "Imported version"), createdAt: String(meta.createdAt || now()), testSummary: String(meta.testSummary || "Imported snapshot; runtime verification pending."), files: {} });
            } else {
              const previous = versionsByNumber.get(versionNumber) || { number: versionNumber, label: "Imported version", createdAt: now(), testSummary: "Imported snapshot; runtime verification pending.", files: {} };
              previous.files[restPath] = text;
              versionsByNumber.set(versionNumber, previous);
            }
          } else {
            currentFiles[path] = text;
          }
        }
        const referenceMeta = Array.isArray(manifest.references) ? manifest.references : [];
        for (const meta of referenceMeta) {
          const safeName = String(meta.name || "reference").replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 120) || "reference";
          const entry = zip.file("references/" + safeName);
          if (!entry) continue;
          if (meta.kind === "image") {
            const dataBase64 = await entry.async("base64");
            references.push({ id: uid(), name: String(meta.name || safeName), mimeType: String(meta.mimeType || "image/png"), kind: "image", dataBase64, size: Number(meta.size || 0) });
          } else {
            const textContent = await entry.async("string");
            references.push({ id: uid(), name: String(meta.name || safeName), mimeType: String(meta.mimeType || "text/plain"), kind: "text", textContent, size: Number(meta.size || textContent.length) });
          }
        }
      } else if (file.name.toLowerCase().endsWith(".gene.json")) {
        const legacy = JSON.parse(await file.text());
        manifest = legacy.manifest || legacy;
        importedKind = manifest.kind === "app" || manifest.plan?.engine === "webapp" ? "app" : "game";
        currentFiles = legacy.files || {};
        if (legacy.plan) manifest.plan = legacy.plan;
        if (Array.isArray(legacy.versions)) versionsByNumber = new Map<number, BuildVersion>(legacy.versions.map((v: BuildVersion) => [v.number, v] as [number, BuildVersion]));
      } else {
        throw new Error("Choose a GENE project ZIP or legacy .gene.json export.");
      }
      currentFiles = importProjectPaths(currentFiles, importedKind);
      for (const version of versionsByNumber.values()) version.files = importProjectPaths(version.files, importedKind);
      if (!Object.keys(currentFiles).length) throw new Error("This project archive contains no source files.");
      if (!currentFiles["game.html"] || !currentFiles["game.js"]) throw new Error(importedKind === "app" ? "This app archive does not contain index.html and app.js." : "This archive does not contain both game.html and game.js.");
      const p: GeneProject = {
        id: uid(),
        name: String(manifest.name || file.name.replace(/\.(zip|gene\.json)$/i, "")),
        kind: importedKind,
        initialPrompt: String(manifest.initialPrompt || "Imported GENE project"),
        mode: "build",
        thinking: "balanced",
        messages: [message("assistant", "Imported project source from " + file.name + ". I can continue editing these files in this chat. The imported game still needs a fresh runtime check before it should be considered verified.")],
        answers: {},
        question: null,
        plan: manifest.plan || null,
        files: currentFiles,
        versions: Array.from(versionsByNumber.values()).sort((a, b) => b.number - a.number),
        activeFile: currentFiles["game.js"] ? "game.js" : Object.keys(currentFiles)[0],
        references,
        updatedAt: now()
      };
      setProject(p);
      setProjects(prev => [p, ...prev.filter(item => item.id !== p.id)].slice(0, 10));
      setSection("chat");
      setPreviewKey(n => n + 1);
      setRuntimeState("idle");
      setNotice("Imported " + Object.keys(currentFiles).length + " source file(s), " + p.versions.length + " version(s), and " + references.length + " reference(s). Runtime verification is pending.");
      addActivity("Imported project archive: " + file.name);
    } catch (error) {
      setNotice("Could not import project: " + (error instanceof Error ? error.message : "invalid archive"));
    }
  }

  function selectProjectFile(path: string) {
    if (!project) return;
    if (path !== project.activeFile && fileDirty && !window.confirm("Discard unsaved edits to " + project.activeFile + "?")) return;
    setProject({ ...project, activeFile: path });
    setEditedFile(project.files[path] || "");
    setFileDirty(false);
    setSection("files");
  }

  function renameProject() {
    if (!project) return;
    const entered = window.prompt("Rename this game project", project.name);
    if (entered === null) return;
    const name = entered.trim().replace(/\s+/g, " ").slice(0, 64);
    if (!name) { setNotice("Project name cannot be empty."); return; }
    setProject({ ...project, name, updatedAt: now() });
    setNotice("Project renamed to " + name + ".");
  }

  function createNewProject(kind: ProjectKind = "game") {
    const p = newProject(kind);
    setProject(p);
    setSection("chat");
    setNotice("");
    setActivity([]);
  }

  function deleteProject(projectId: string) {
    const target = projects.find(item => item.id === projectId) || (project?.id === projectId ? project : null);
    if (!target) return;
    if (!window.confirm("Delete the chat and local project \"" + target.name + "\"? This removes its saved browser history and cannot be undone.")) return;
    const remaining = projects.filter(item => item.id !== projectId);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(remaining));
      if (localStorage.getItem(ACTIVE_KEY) === projectId) localStorage.removeItem(ACTIVE_KEY);
    } catch {}
    setProjects(remaining);
    if (project?.id === projectId) {
      const next = remaining[0] || newProject(target.kind || "game");
      setProject(next);
      setSection("chat");
      setNotice("Deleted \"" + target.name + "\".");
    } else {
      setNotice("Deleted \"" + target.name + "\".");
    }
  }

  function loadPlayableDemo() {
    const files = playableDemoFiles();
    const stamp = now();
    const p: GeneProject = {
      ...newProject(),
      name: "Outpost: Last Light",
      initialPrompt: "A playable top-down sci-fi survival arcade game. Collect seven energy cores, evade pursuing drones, use a dash, and support keyboard plus mobile touch controls.",
      mode: "build",
      question: null,
      plan: { title: "Outpost: Last Light", summary: "Restore a dark sci-fi outpost by recovering seven energy cores while corrupted drones hunt you.", engine: "canvas2d", tasks: ["Move around the outpost", "Collect seven cores", "Evade drones and manage shield", "Dash, pause, win, lose and restart"], mechanics: ["Keyboard and touch controls", "Chasing enemies", "Collectibles and scoring", "Three-hit shield", "Dash cooldown", "Win/loss/restart states"], performanceBudget: { targetFps: 60, maxEnemies: 4, maxObjects: 80, maxParticles: 60 } },
      files,
      activeFile: "game.js",
      messages: [message("assistant", "Your first playable game is loaded: **Outpost: Last Light**. Move with WASD or arrow keys, collect all seven glowing cores, and dodge red drones. SPACE dashes, P pauses, and R restarts. Open Files to inspect or edit the actual HTML/CSS/JavaScript source.", "build")],
      versions: [{ number: 1, label: "First playable game", files: { ...files }, createdAt: stamp, testSummary: "Built-in starter source loaded. Browser preview performs visible-render telemetry; test gameplay in the live preview." }],
      updatedAt: stamp
    };
    setProject(p);
    setSection("chat");
    setRuntimeState("idle");
    setNotice("Playable sample loaded locally. No AI API key is needed to run it; configure Gemini, Groq or OpenRouter to ask the AI to modify the game.");
    setActivity(["Loaded built-in starter: Outpost: Last Light", "Source files ready for editing and export"]);
    setPreviewKey(n => n + 1);
  }

  function runBuildChecks() {
    if (!project) return;
    const files = { ...project.files };
    if (fileDirty) files[project.activeFile] = editedFile;
    const checks: BuildCheck[] = [];
    const add = (label: string, status: BuildCheckStatus, detail: string) => checks.push({ label, status, detail });
    const required = ["game.html", "game.css", "game.js", "game-spec.json"];
    const missing = required.filter(path => !files[path] || !files[path].trim());
    add("Required source files", missing.length ? "fail" : "pass", missing.length ? "Missing: " + missing.join(", ") : "HTML, CSS, JavaScript and game specification are present.");
    const html = files["game.html"] || "";
    const js = files["game.js"] || "";
    const combined = html + "\n" + js;
    let spec: any = null;
    let specParsed = false;
    try { spec = JSON.parse(files["game-spec.json"] || ""); specParsed = Boolean(spec && typeof spec === "object" && !Array.isArray(spec)); } catch {}
    const isAppSpec = project.kind === "app";
    const specValid = specParsed && typeof spec.title === "string" && Boolean(spec.title.trim()) &&
      (isAppSpec
        ? spec.engine === "webapp" && typeof spec.summary === "string" && Boolean(spec.summary.trim()) && ["features", "routes", "userFlows"].every((key: string) => Array.isArray(spec[key]) && spec[key].length > 0)
        : typeof spec.genre === "string" && Boolean(spec.genre.trim()) && ["canvas2d", "webgl3d"].includes(spec.engine) && Array.isArray(spec.mechanics) && spec.mechanics.length > 0 && Array.isArray(spec.controls) && spec.controls.length > 0 && typeof spec.objective === "string" && Boolean(spec.objective.trim()) && typeof spec.winCondition === "string" && Boolean(spec.winCondition.trim()) && typeof spec.lossCondition === "string" && Boolean(spec.lossCondition.trim()));
    add(isAppSpec ? "App specification" : "Game specification", specValid ? "pass" : "fail", specValid ? (isAppSpec ? "Title, app engine, summary, features, routes and user flows are declared." : "Title, engine, mechanics, controls, objective and end states are declared.") : "The JSON or required project-spec fields are missing or malformed.");
    let syntaxValid = false;
    let syntaxError = "";
    try { if (js.length > 500_000) throw new Error("JavaScript exceeds the 500 KB build budget."); new Function(js); syntaxValid = true; }
    catch (error) { syntaxError = error instanceof Error ? error.message : "Unknown JavaScript syntax error."; }
    add("JavaScript syntax", syntaxValid ? "pass" : "fail", syntaxValid ? "The game script parses without executing it." : syntaxError);
    if (isAppSpec) {
      const hasUI = /<(?:main|header|nav|section|form|button|h1|h2|article|input|label)\b/i.test(html);
      add("App interface", hasUI ? "pass" : "fail", hasUI ? "Semantic UI elements are present in the app source." : "No recognizable user interface elements were found.");
      const hasInput = /addEventListener\s*\(\s*["'](?:click|submit|change|input|keydown|pointerdown)["']|on(?:click|submit|change)\s*=/i.test(combined);
      add("Interactive behavior", hasInput ? "pass" : "warn", hasInput ? "Event handlers for app interactions were found." : "No common app interaction handler was detected; check its buttons and forms manually.");
    } else {
      const hasCanvas = /<canvas\b/i.test(html) || /createElement\s*\(\s*["']canvas["']\s*\)/i.test(js);
      add("Render surface", hasCanvas ? "pass" : "fail", hasCanvas ? "A canvas render surface is present." : "No canvas element or dynamically created canvas was found.");
      const engine = spec?.engine;
      const rendererValid = engine === "webgl3d" ? /getContext\s*\(\s*["'](?:webgl2?|experimental-webgl)["']|createShader\s*\(|drawArrays\s*\(|drawElements\s*\(/i.test(combined) : engine === "canvas2d" && /getContext\s*\(\s*["']2d["']|\.fillRect\s*\(|\.drawImage\s*\(|\.stroke\s*\(/i.test(combined);
      add("Renderer implementation", rendererValid ? "pass" : "fail", rendererValid ? (engine === "webgl3d" ? "WebGL shader/draw operations are referenced." : "Canvas 2D drawing operations are referenced.") : "The selected engine has no recognizable renderer operations.");
      const hasLoop = /requestAnimationFrame\s*\(|setInterval\s*\(|setTimeout\s*\(/i.test(js);
      add("Frame/update loop", hasLoop ? "pass" : "fail", hasLoop ? "A recurring animation or update loop is referenced." : "No animation or update loop was detected.");
      const hasInput = /addEventListener\s*\(\s*["'](?:keydown|keyup|pointerdown|pointerup|touchstart|click|mousedown)["']|on(?:keydown|keyup|pointerdown|touchstart|click)\s*=/i.test(combined);
      add("Player input hooks", hasInput ? "pass" : "warn", hasInput ? "Keyboard, pointer or touch input hooks were found." : "No common input handler was detected; check controls manually.");
    }
    add("Live preview", runtimeState === "rendered" ? "pass" : runtimeState === "error" ? "fail" : "warn", runtimeState === "rendered" ? "The sandbox reported a visible render signal." : runtimeState === "error" ? "The preview reported an error or did not render in time." : "Refresh or start the preview to collect runtime evidence.");
    add("Gameplay playtest", "warn", "These checks do not simulate collisions, progression, difficulty or win/loss behavior. Play the game and verify those mechanics yourself.");
    setBuildReport({ checkedAt: now(), projectUpdatedAt: project.updatedAt, checkedDirty: fileDirty, checkedFile: project.activeFile, checkedEditorContent: editedFile, checks });
    addActivity("Build checks finished: " + checks.filter(check => check.status === "pass").length + " passed, " + checks.filter(check => check.status === "warn").length + " warnings, " + checks.filter(check => check.status === "fail").length + " failed.");
  }

  function saveManualEdit() {
    if (!project) return;
    if (project.mode === "plan") {
      setNotice("Plan mode is read-only. Switch to Build mode before editing source files.");
      return;
    }
    const updatedFiles = { ...project.files, [project.activeFile]: editedFile };
    const version: BuildVersion = { number: (project.versions[0]?.number || 0) + 1, label: "Manual edit: " + project.activeFile, files: { ...updatedFiles }, createdAt: now(), testSummary: "Manual edit saved. Re-run validation before release." };
    const updatedProject = { ...project, files: updatedFiles, versions: [version, ...project.versions].slice(0, 8), updatedAt: now() };
    setProject(updatedProject);
    setFileDirty(false);
    setNotice("Saved " + project.activeFile + " as version " + version.number + ". It has not been runtime-verified yet.");
    setPreviewKey(n => n + 1);
    if (localAgentStatus === "connected" && localAgentToken) {
      void writeProjectToDisk(updatedProject, localAgentUrl, localAgentToken)
        .then(data => setNotice("Manual edit v" + version.number + " synced to disk at " + data.projectPath + ". Source checks passed; gameplay still needs runtime testing."))
        .catch(error => setNotice("Manual edit saved in GENE, but disk sync failed: " + (error instanceof Error ? error.message : "unknown error") + ". Use Sync files to retry."));
    }
  }

  function restoreVersion(version: BuildVersion) {
    if (!project) return;
    const newVersion: BuildVersion = { number: (project.versions[0]?.number || 0) + 1, label: "Restore v" + version.number, files: { ...version.files }, createdAt: now(), testSummary: "Restored snapshot; runtime verification pending." };
    const updatedProject = { ...project, files: { ...version.files }, versions: [newVersion, ...project.versions].slice(0, 8), activeFile: "game.js", updatedAt: now() };
    setProject(updatedProject);
    setSection("chat");
    setPreviewKey(n => n + 1);
    setNotice("Restored version " + version.number + " into new version " + newVersion.number + ".");
    if (localAgentStatus === "connected" && localAgentToken) {
      void writeProjectToDisk(updatedProject, localAgentUrl, localAgentToken)
        .then(data => setNotice("Restored v" + version.number + " and synced new version " + newVersion.number + " to disk at " + data.projectPath + "."))
        .catch(error => setNotice("Restored source in GENE, but disk sync failed: " + (error instanceof Error ? error.message : "unknown error") + ". Use Sync files to retry."));
    }
  }

  async function publishProject() {
    if (!project || !hasGame || publishBusy) return;
    if (!publishConfigured) {
      setNotice("To enable publishing, configure VERCEL_TOKEN, VERCEL_PROJECT_ID, and GENE_PUBLISH_PASSWORD in the GENE Vercel project, then redeploy.");
      return;
    }
    const password = window.prompt("Enter the publish password stored in GENE's GENE_PUBLISH_PASSWORD environment variable.");
    if (!password) return;
    setPublishBusy(true);
    setPublishedUrl("");
    setNotice("Preparing a standalone web build for publishing…");
    try {
      const projectKind = project.kind || "game";
      const cssName = projectKind === "app" ? "styles.css" : "game.css";
      const jsName = projectKind === "app" ? "app.js" : "game.js";
      const specName = projectKind === "app" ? "app-spec.json" : "game-spec.json";
      const title = project.plan?.title || project.name || "GENE project";
      const html = standaloneDocument(project.files["game.html"] || "", title, cssName, jsName, buildRuntimeAssetBootstrap(project.files));
      const manifest = {
        name: title, short_name: title.slice(0, 24), description: project.plan?.summary || project.initialPrompt || title,
        start_url: "./index.html", scope: "./", display: "standalone", background_color: "#101411", theme_color: "#101411",
        icons: [{ src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }]
      };
      const registerSource = "'use strict'; if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) { window.addEventListener('load', function () { navigator.serviceWorker.register('./service-worker.js').catch(function () {}); }); }";
      const cacheName = "gene-published-" + project.id.replace(/[^a-z0-9-]/gi, "").slice(0, 36);
      const workerSource = "'use strict'; const CACHE='" + cacheName + "'; const FILES=['./','./index.html','./" + cssName + "','./" + jsName + "','./" + specName + "','./manifest.webmanifest','./icon.svg','./pwa-register.js']; self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()))); self.addEventListener('activate',e=>e.waitUntil(self.clients.claim())); self.addEventListener('fetch',e=>{if(e.request.method==='GET'&&new URL(e.request.url).origin===location.origin)e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).catch(()=>caches.match('./index.html'))));});";
      const icon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="30" fill="#101411"/><path d="M91 32A43 43 0 1 0 99 83H70V67h48v10A56 56 0 1 1 105 23z" fill="#77e0a2"/><circle cx="64" cy="64" r="11" fill="#f1f7f3"/></svg>';
      const files: Array<{ path: string; content: string }> = [
        { path: "index.html", content: html },
        { path: cssName, content: project.files["game.css"] || "" },
        { path: jsName, content: project.files["game.js"] || "" },
        { path: specName, content: project.files["game-spec.json"] || "{}" },
        { path: "manifest.webmanifest", content: JSON.stringify(manifest, null, 2) },
        { path: "pwa-register.js", content: registerSource },
        { path: "service-worker.js", content: workerSource },
        { path: "icon.svg", content: icon }
      ];
      for (const [path, content] of Object.entries(project.files)) {
        if (path === "game.html" || ["game.css", "game.js", "game-spec.json"].includes(path)) continue;
        files.push({ path: exportProjectPath(path, projectKind), content });
      }
      setNotice("Uploading " + files.length + " files to Vercel and waiting for deployment status…");
      const response = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-gene-publish-password": password },
        body: JSON.stringify({ name: title, files })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) throw new Error(payload?.error?.message || "Vercel rejected this publish request.");
      setPublishedUrl(payload.url);
      setNotice(payload.ready ? "Your web project is published and ready." : "Vercel accepted the deployment. It may take a moment to finish becoming available.");
      addActivity("Published web project: " + payload.url + " (" + payload.state + ")");
    } catch (error) {
      setNotice("Publish failed: " + (error instanceof Error ? error.message : "Unknown publishing error"));
    } finally {
      setPublishBusy(false);
    }
  }

  async function buildBinary(targets: "both" | "windows" | "android") {
    if (!project || !hasGame || binaryBuildBusy || busy) return;
    if (!binaryBuildConfigured) {
      setNotice("To enable real EXE/APK builds, configure GENE_BUILD_GITHUB_TOKEN, GENE_BUILD_ENCRYPTION_KEY, and GENE_BUILD_PASSWORD in Vercel, plus GENE_BUILD_ENCRYPTION_KEY and BLOB_READ_WRITE_TOKEN in GitHub Actions secrets. See the cloud builder setup instructions in the GENE repository README.");
      return;
    }
    const buildPassword = window.prompt("Enter the cloud build password configured as GENE_BUILD_PASSWORD in Vercel.");
    if (!buildPassword) return;
    setBinaryBuildBusy(true);
    setBinaryBuildLinks(null);
    setBinaryBuildId("");
    setBinaryBuildRunUrl("");
    setNotice("Preparing a standalone build and securely submitting the source…");
    try {
      const projectKind = project.kind || "game";
      const cssName = projectKind === "app" ? "styles.css" : "game.css";
      const jsName = projectKind === "app" ? "app.js" : "game.js";
      const specName = projectKind === "app" ? "app-spec.json" : "game-spec.json";
      const title = project.plan?.title || project.name || "GENE Project";
      const mainHtml = standaloneDocument(project.files["game.html"] || "", title, cssName, jsName, buildRuntimeAssetBootstrap(project.files));
      const manifest = {
        name: title, short_name: title.slice(0, 24), description: project.plan?.summary || project.initialPrompt || title,
        start_url: "./index.html", scope: "./", display: "standalone", background_color: "#101411", theme_color: "#101411",
        icons: [{ src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }]
      };
      const icon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="30" fill="#101411"/><path d="M91 32A43 43 0 1 0 99 83H70V67h48v10A56 56 0 1 1 105 23z" fill="#77e0a2"/><circle cx="64" cy="64" r="11" fill="#f1f7f3"/></svg>';
      const files: Array<{ path: string; content: string }> = [
        { path: "index.html", content: mainHtml },
        { path: cssName, content: project.files["game.css"] || "" },
        { path: jsName, content: project.files["game.js"] || "" },
        { path: specName, content: project.files["game-spec.json"] || "{}" },
        { path: "manifest.webmanifest", content: JSON.stringify(manifest, null, 2) },
        { path: "icon.svg", content: icon }
      ];
      for (const [path, content] of Object.entries(project.files)) {
        if (path === "game.html" || ["game.css", "game.js", "game-spec.json"].includes(path)) continue;
        files.push({ path: exportProjectPath(path, projectKind), content });
      }
      setNotice("Submitting encrypted source. GitHub Actions will compile a real Windows installer and/or Android APK…");
      const response = await fetch("/api/builds", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-gene-build-password": buildPassword },
        body: JSON.stringify({ title, projectId: project.id, targets, files })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok || !payload.buildId) {
        throw new Error(payload?.error?.message || "The cloud builder rejected this project.");
      }
      const id = String(payload.buildId);
      setBinaryBuildId(id);
      addActivity("Cloud binary build queued: " + id + " (" + targets + ")");
      setNotice("Build " + id.slice(0, 8) + " queued. Preparing the real " + (targets === "both" ? "EXE and APK" : targets === "windows" ? "Windows EXE" : "Android APK") + " on cloud build machines…");
      let finalReport: any = null;
      for (let attempt = 0; attempt < 240; attempt++) {
        await new Promise(resolve => window.setTimeout(resolve, 5000));
        const statusResponse = await fetch("/api/builds/" + id, { cache: "no-store" });
        const status = await statusResponse.json().catch(() => null);
        if (!statusResponse.ok || !status?.ok) throw new Error(status?.error?.message || "Could not read cloud build status. Build ID: " + id);
        if (status.state === "success" || status.state === "partial" || status.state === "failed") {
          finalReport = status;
          break;
        }
        const seconds = (attempt + 1) * 5;
        setNotice("Cloud build " + id.slice(0, 8) + " · " + status.state + " · " + Math.floor(seconds / 60) + "m " + String(seconds % 60).padStart(2, "0") + "s elapsed. Compilers are running; keep this tab open.");
      }
      if (!finalReport) throw new Error("The build is still running after 20 minutes. Build ID: " + id + ". You can retry status checking using this ID.");
      const links = finalReport.targets || {};
      setBinaryBuildLinks(links);
      setBinaryBuildRunUrl(String(finalReport.runUrl || ""));
      const ready = Object.entries(links).filter(([, target]: [string, any]) => target?.status === "success" && target?.url).length;
      addActivity("Cloud binary build " + finalReport.state + ": " + id);
      if (finalReport.state === "success") setNotice("Build complete. GENE produced real downloadable binary files. Android output is debug-signed for device installation.");
      else if (ready) setNotice("Some outputs built successfully. Download the available file below; open the build log for the failed target.");
      else setNotice("Cloud build failed. Open the GitHub Actions run to inspect compiler logs, then retry after fixing the reported issue.");
    } catch (error) {
      setNotice("Cloud binary build error: " + (error instanceof Error ? error.message : "Unknown error"));
    } finally {
      setBinaryBuildBusy(false);
    }
  }

  async function downloadProject() {
    if (!project || packageProgress !== null) return;
    setPackageProgress(0);
    try {
    const zip = new JSZip();
    const projectKind = project.kind || "game";
    const cssName = projectKind === "app" ? "styles.css" : "game.css";
    const jsName = projectKind === "app" ? "app.js" : "game.js";
    const specName = projectKind === "app" ? "app-spec.json" : "game-spec.json";
    const projectTitle = project.plan?.title || project.name || "GENE project";
    const mainHtml = standaloneDocument(project.files["game.html"] || "", projectTitle, cssName, jsName, buildRuntimeAssetBootstrap(project.files));
    Object.entries(project.files).forEach(([path, source]) => {
      if (path === "game.html") return;
      zip.file(exportProjectPath(path, projectKind), source);
    });
    zip.file("source/game.html", project.files["game.html"] || "");
    zip.file("index.html", mainHtml);
    const webManifest = {
      name: projectTitle, short_name: projectTitle.slice(0, 24),
      description: project.plan?.summary || project.initialPrompt || projectTitle,
      start_url: "./index.html", scope: "./", display: "standalone",
      background_color: "#101411", theme_color: "#101411",
      icons: [{ src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }]
    };
    const registerSource = "'use strict'; if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) { window.addEventListener('load', function () { navigator.serviceWorker.register('./service-worker.js').catch(function () {}); }); }";
    const serviceWorkerSource = "'use strict'; const CACHE='gene-" + project.id.replace(/[^a-z0-9-]/gi, "").slice(0, 40) + "-v1'; const FILES=['./','./index.html','./" + cssName + "','./" + jsName + "','./" + specName + "','./manifest.webmanifest','./icon.svg','./pwa-register.js']; self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES.filter(Boolean))).then(()=>self.skipWaiting()))); self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('gene-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))); self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==location.origin)return;e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}return r;}).catch(()=>caches.match('./index.html'))));});";
    const iconSource = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="30" fill="#101411"/><path d="M91 32A43 43 0 1 0 99 83H70V67h48v10A56 56 0 1 1 105 23z" fill="#77e0a2"/><circle cx="64" cy="64" r="11" fill="#f1f7f3"/></svg>';
    zip.file("manifest.webmanifest", JSON.stringify(webManifest, null, 2));
    zip.file("service-worker.js", serviceWorkerSource);
    zip.file("pwa-register.js", registerSource);
    zip.file("icon.svg", iconSource);
    const safePackageName = (project.name || "gene-project").toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 48) || "gene-project";
    const desktopPackage = {
      name: safePackageName + "-desktop", version: "1.0.0", private: true, description: projectTitle,
      main: "main.cjs",
      scripts: { start: "electron .", "dist:win": "electron-builder --win nsis", "dist:mac": "electron-builder --mac", "dist:linux": "electron-builder --linux" },
      devDependencies: { electron: "^35.0.0", "electron-builder": "^26.0.0" },
      build: { appId: "studio.gene.generated", productName: projectTitle.slice(0, 80), files: ["main.cjs", "app/**/*"], directories: { output: "dist" }, win: { target: ["nsis"] }, mac: { target: ["dmg"] }, linux: { target: ["AppImage"] } }
    };
    zip.file("desktop-wrapper/package.json", JSON.stringify(desktopPackage, null, 2));
    zip.file("desktop-wrapper/main.cjs", "'use strict'; const {app,BrowserWindow}=require('electron'); const path=require('node:path'); function createWindow(){const win=new BrowserWindow({width:1280,height:800,minWidth:800,minHeight:560,backgroundColor:'#101411',autoHideMenuBar:true,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}}); win.loadFile(path.join(__dirname,'app','index.html'));} app.whenReady().then(()=>{createWindow();app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});}); app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});");
    zip.file("desktop-wrapper/README.md", "# Desktop EXE/installer source kit\n\n1. Install Node.js LTS on the build computer.\n2. Open a terminal in this folder and run npm install.\n3. On Windows run npm run dist:win; on macOS run npm run dist:mac; on Linux run npm run dist:linux.\n4. Find the installer or app image in dist/.\n\nThis kit contains the Electron wrapper and project source. It is not a precompiled EXE; the platform packaging toolchain must run on a suitable computer.");
    const androidPackage = {
      name: safePackageName + "-android", version: "1.0.0", private: true,
      scripts: { "android:init": "cap add android", "android:sync": "cap sync android", "android:open": "cap open android" },
      dependencies: { "@capacitor/android": "^7.0.0", "@capacitor/core": "^7.0.0" },
      devDependencies: { "@capacitor/cli": "^7.0.0" }
    };
    zip.file("android-wrapper/package.json", JSON.stringify(androidPackage, null, 2));
    zip.file("android-wrapper/capacitor.config.json", JSON.stringify({ appId: "studio.gene.generated", appName: projectTitle.slice(0, 80), webDir: "www", bundledWebRuntime: false }, null, 2));
    zip.file("android-wrapper/README.md", "# Android APK source kit\n\n1. Install Node.js LTS and Android Studio with the Android SDK.\n2. This kit already includes the project in www/. Run npm install, then npm run android:init and npm run android:sync.\n3. Open Android Studio with npm run android:open, select Build > Build APK(s), and retrieve the APK from the Android project output.\n\nThis is a Capacitor wrapper project, not a precompiled APK. Android SDK signing/build steps require a configured Android toolchain.");
    zip.file("android-wrapper/www/index.html", mainHtml);
    zip.file("android-wrapper/www/" + cssName, project.files["game.css"] || "");
    zip.file("android-wrapper/www/" + jsName, project.files["game.js"] || "");
    zip.file("android-wrapper/www/" + specName, project.files["game-spec.json"] || "{}");
    zip.file("android-wrapper/www/manifest.webmanifest", JSON.stringify(webManifest, null, 2));
    zip.file("android-wrapper/www/service-worker.js", serviceWorkerSource);
    zip.file("android-wrapper/www/pwa-register.js", registerSource);
    zip.file("android-wrapper/www/icon.svg", iconSource);
    zip.file("desktop-wrapper/app/index.html", mainHtml);
    zip.file("desktop-wrapper/app/" + cssName, project.files["game.css"] || "");
    zip.file("desktop-wrapper/app/" + jsName, project.files["game.js"] || "");
    zip.file("desktop-wrapper/app/" + specName, project.files["game-spec.json"] || "{}");
    zip.file("desktop-wrapper/app/manifest.webmanifest", JSON.stringify(webManifest, null, 2));
    zip.file("desktop-wrapper/app/service-worker.js", serviceWorkerSource);
    zip.file("desktop-wrapper/app/pwa-register.js", registerSource);
    zip.file("desktop-wrapper/app/icon.svg", iconSource);
    (project.references || []).forEach(ref => {
      const safeName = ref.name.replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 120) || "reference";
      if (ref.kind === "image" && ref.dataBase64) zip.file("references/" + safeName, ref.dataBase64, { base64: true });
      else if (ref.kind === "text" && typeof ref.textContent === "string") zip.file("references/" + safeName, ref.textContent);
    });
    project.versions.forEach(version => {
      const prefix = "versions/" + String(version.number).padStart(3, "0") + "/";
      Object.entries(version.files).forEach(([path, source]) => {
        if (path === "game.html") return;
        zip.file(prefix + exportProjectPath(path, projectKind), source);
      });
      zip.file(prefix + "source/game.html", version.files["game.html"] || "");
      zip.file(prefix + "index.html", standaloneDocument(version.files["game.html"] || "", projectTitle + " v" + version.number, cssName, jsName, buildRuntimeAssetBootstrap(version.files)));
      zip.file(prefix + "version.json", JSON.stringify({ number: version.number, label: version.label, createdAt: version.createdAt, testSummary: version.testSummary }, null, 2));
    });
    zip.file("gene.project.json", JSON.stringify({
      id: project.id,
      name: project.name,
      kind: project.kind || "game",
      initialPrompt: project.initialPrompt,
      updatedAt: project.updatedAt,
      plan: project.plan,
      references: (project.references || []).map(ref => ({ name: ref.name, mimeType: ref.mimeType, kind: ref.kind, size: ref.size })),
      versions: project.versions.map(v => ({ number: v.number, label: v.label, createdAt: v.createdAt, testSummary: v.testSummary }))
    }, null, 2));
    zip.file("README.md", [
      "# " + project.name,
      "",
      "Generated by GENE. These are the current project source files.",
      (project.kind === "app" ? "Open index.html in a browser or serve the folder with a local static server." : "Open game.html through a local static server for best results."),
      "Earlier source snapshots are included under versions/.",
      "",
      "Initial request: " + project.initialPrompt,
      "",
      "The root index.html is a standalone web/PWA package. desktop-wrapper contains an Electron installer project and android-wrapper contains a Capacitor project for generating an APK with Android Studio. Compiled EXE/APK binaries are not generated inside this browser session; run the included platform build steps."
    ].join("\n"));
    const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } }, metadata => setPackageProgress(Math.max(0, Math.min(100, Math.round(metadata.percent)))));
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (project.name || "gene-project").replace(/[^a-z0-9-_]+/gi, "-") + ".zip";
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    setNotice("Project ZIP packaged successfully (" + Math.round(blob.size / 1024) + " KB). This is a source bundle, not a compiled EXE/APK.");
    window.setTimeout(() => setPackageProgress(null), 900);
    } catch (error) {
      setPackageProgress(null);
      setNotice("Packaging failed: " + (error instanceof Error ? error.message : "Unknown ZIP error"));
    }
  }

  function openFullscreenGame() {
    if (!project || !previewDoc) return;
    window.open("/play/" + encodeURIComponent(project.id), "_blank", "noopener,noreferrer");
  }

  if (!project) return <main className="boot"><div className="gene-mark"><GeneMark /></div><p>Opening your workspace…</p></main>;

  const hasGame = Boolean(project.files["game.html"] && project.files["game.js"]);
  const isApp = project.kind === "app";
  const isSyncedToLocal = Boolean(localAgentStatus === "connected" && lastSyncedUpdatedAt && lastSyncedUpdatedAt === project.updatedAt);
  const reportIsCurrent = Boolean(buildReport && buildReport.projectUpdatedAt === project.updatedAt && (buildReport.checkedDirty ? fileDirty && buildReport.checkedFile === project.activeFile && buildReport.checkedEditorContent === editedFile : !fileDirty));
  const activeMessages = project.messages;
  const nav = [
    { id: "chat" as const, icon: "◉", label: "Chat" },
    { id: "files" as const, icon: "▤", label: "Files" },
    { id: "tasks" as const, icon: "☷", label: "Plan & tasks" },
    { id: "assets" as const, icon: "◇", label: "Assets" },
    { id: "versions" as const, icon: "↺", label: "Versions" }
  ];

  return (
    <main className={"gene-app " + theme} data-theme={theme}>
      <aside className="rail">
        <button className="brand" title="GENE home" onClick={() => setSection("chat")}><span className="brand-orbit"><GeneMark /></span></button>
        <div className="rail-separator" />
        {nav.map(item => <button key={item.id} className={"rail-item " + (section === item.id ? "selected" : "")} title={item.label} onClick={() => setSection(item.id)}><span>{item.icon}</span></button>)}
        <div className="rail-spacer" />
        <button className="rail-item" title="Switch theme" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}><span>{theme === "dark" ? "☼" : "☾"}</span></button>
        <button className="avatar" title="GENE 1.2 Flash"><GeneMark /></button>
      </aside>

      <aside className="project-sidebar">
        <div className="sidebar-head"><div><div className="eyebrow">WORKSPACE</div><div className="sidebar-title">GENE Studio</div></div><button className="icon-button" title="New project" onClick={() => createNewProject("game")}>＋</button></div>
        <button className="new-project" onClick={() => createNewProject("game")}><span>＋</span> New game project</button>
        <button className="new-project" onClick={() => createNewProject("app")}><span>＋</span> New web app project</button>
        <button className="import-project-button" onClick={loadPlayableDemo}>▶ Try playable demo</button>
        <input ref={projectImportRef} className="visually-hidden" type="file" accept=".zip,.gene.json,application/zip,application/json" onChange={importProject} />
        <button className="import-project-button" onClick={() => projectImportRef.current?.click()}>↥ Import project ZIP</button>
        <div className="sidebar-section-label">CURRENT PROJECT</div>
        <div className="project-card"><span className="project-dot" /><div className="project-name">{project.name}</div><small>{hasGame ? (project.kind === "app" ? "App source created" : "Playable source created") : "Design in progress"}</small><button className="project-delete" title="Delete this chat and project" onClick={() => deleteProject(project.id)}>×</button></div>
        {projects.filter(p => p.id !== project.id).length > 0 && <>
          <div className="sidebar-section-label">RECENT CHATS</div>
          {projects.filter(p => p.id !== project.id).slice(0, 5).map(p => <div key={p.id} className="recent-project-row"><button className="file-row" onClick={() => { setProject(p); setSection("chat"); setNotice(""); }}><span className="file-icon">◌</span><span>{p.name}</span></button><button className="recent-delete" title={"Delete " + p.name} onClick={() => deleteProject(p.id)}>×</button></div>)}
        </>}
        <div className="sidebar-section-label">PROJECT FILES</div>
        {Object.keys(project.files).length ? Object.keys(project.files).map(path => <button key={path} className={"file-row " + (section === "files" && project.activeFile === path ? "file-selected" : "")} onClick={() => selectProjectFile(path)}><span className="file-icon">{path.endsWith(".js") ? "JS" : path.endsWith(".css") ? "¶" : path.endsWith(".json") ? "{}" : "H"}</span><span>{fileName(path, project.kind || "game")}</span></button>) : <div className="empty-sidebar">Files appear here after GENE builds a project.</div>}
        <div className="sidebar-bottom">
          <div className="connection-row"><span className={"status-dot " + (apiReady ? "online" : "offline")} />{apiReady === null ? "Checking AI connection" : apiReady ? "AI providers ready" : "Add an AI provider key"}</div>
          <small>{apiReady ? aiModel : "Gemini, Groq or OpenRouter key required"}</small>
          <div className="agent-connection">
            <div className="connection-row"><span className={"status-dot " + (localAgentStatus === "connected" ? "online" : localAgentStatus === "error" ? "offline" : "")} />{localAgentStatus === "connected" ? "Local Agent connected" : localAgentStatus === "checking" ? "Checking Local Agent" : localAgentStatus === "error" ? "Local Agent error" : "Local Agent disconnected"}</div>
            {localAgentWorkspace && <small title={localAgentWorkspace}>{localAgentWorkspace}</small>}
            <button className="agent-connect-button" onClick={connectLocalAgent}>{localAgentStatus === "connected" ? "Agent settings" : "Connect Local Agent"}</button>
            {hasGame && localAgentStatus === "connected" && <button className="agent-connect-button" onClick={syncToLocalAgent} disabled={busy}>{isSyncedToLocal ? "Resync project files" : "Write project to disk"}</button>}
            {isSyncedToLocal && <button className="agent-connect-button" onClick={openLocalAgentGame}>{project.kind === "app" ? "Open disk-backed app ↗" : "Open disk-backed game ↗"}</button>}
          </div>
        </div>
      </aside>

      <section className="main-column">
        <header className="topbar">
          <div className="breadcrumb"><span>Projects</span><span className="crumb-slash">/</span><strong>{project.name}</strong><button className="rename-project" title="Rename project" onClick={renameProject}>✎</button><span className="saved-pill"><span className="status-dot online" /> Saved locally</span></div>
          <div className="top-actions">
            <span className="project-kind-chip">{project.kind === "app" ? "WEB APP" : "GAME"}</span>
            <div className="mode-switch" role="group" aria-label="Agent mode">
              <button className={project.mode === "plan" ? "active" : ""} onClick={() => setProject({ ...project, mode: "plan" })}>Plan</button>
              <button className={project.mode === "build" ? "active" : ""} onClick={() => setProject({ ...project, mode: "build" })}>Build</button>
            </div>
            <select className="thinking-select" value={project.thinking} aria-label="GENE 1.6 model mode" title="Flash: fast iterations · Balanced: default quality · Thinking: highest configured reasoning effort" onChange={e => setProject({ ...project, thinking: e.target.value as Thinking })}>
              <option value="fast">GENE 1.6 Flash</option><option value="balanced">GENE 1.6 Balanced</option><option value="deep">GENE 1.6 Thinking</option>
            </select>
            <button className="top-play-button" title={project.kind === "app" ? "Open the current app in a separate tab" : "Play the current game in a separate tab"} onClick={openFullscreenGame} disabled={!hasGame}>↗ Preview</button>
            <button className="mobile-preview-button" title="Open live preview" onClick={() => { setPreviewOpen(true); setExpandedPreview(true); }} disabled={!hasGame}>◫ Preview</button>
            <button className={"sync-button " + (isSyncedToLocal ? "synced" : "")} title="Write the actual project files to your computer using GENE Local Agent" onClick={syncToLocalAgent} disabled={!hasGame || busy || buildInProgress || localAgentStatus === "checking"}>{isSyncedToLocal ? "Synced to disk ✓" : "Sync files ↥"}</button>
             <button className="publish-button" title={publishConfigured ? "Publish a static web version through Vercel" : "Configure Vercel publishing credentials"} onClick={() => void publishProject()} disabled={!hasGame || busy || buildInProgress || publishBusy}>{publishBusy ? "Publishing…" : publishConfigured ? "Publish ↗" : "Publish setup"}</button>
            <select className="binary-target-select" aria-label="Binary build target" value={binaryTarget} onChange={e => setBinaryTarget(e.target.value as "both" | "windows" | "android")} disabled={binaryBuildBusy}><option value="both">EXE + APK</option><option value="windows">Windows EXE</option><option value="android">Android APK</option></select>
            <button className="binary-build-button" title={binaryBuildConfigured ? "Compile real EXE/APK on cloud build machines" : "Cloud builder needs one-time GitHub/Vercel setup"} onClick={() => void buildBinary(binaryTarget)} disabled={!hasGame || busy || buildInProgress || binaryBuildBusy}>{binaryBuildBusy ? "Building…" : binaryBuildConfigured ? "Build binary ↗" : "Build setup ↗"}</button>
            <span className="package-progress-label" aria-live="polite">{packageProgress !== null ? "Packing " + packageProgress + "%" : ""}</span><button className="icon-button subtle" title={packageProgress !== null ? "Packaging project ZIP" : "Download project source ZIP"} onClick={downloadProject} disabled={packageProgress !== null}>{packageProgress !== null ? packageProgress + "%" : "↓"}</button>
          </div>
        </header>

        {notice && <div className="notice"><span>{notice}{publishedUrl && <> <a href={publishedUrl} target="_blank" rel="noreferrer">Open published site ↗</a><button className="copy-publish-link" onClick={() => { if (!navigator.clipboard) { setNotice("Clipboard is unavailable here. Copy this link: " + publishedUrl); return; } void navigator.clipboard.writeText(publishedUrl).then(() => setNotice("Published link copied to clipboard.")).catch(() => setNotice("Could not access the clipboard. Copy this link: " + publishedUrl)); }}>Copy link</button></>}</span><button onClick={() => { setNotice(""); setPublishedUrl(""); }}>Dismiss</button></div>}

        {binaryBuildLinks && <div className="binary-build-result" role="status">
          <div className="binary-build-result-heading"><strong>Cloud build results</strong><span>{binaryBuildId ? binaryBuildId.slice(0, 8) : ""}</span></div>
          {binaryBuildRunUrl && <a className="binary-build-log-link" href={binaryBuildRunUrl} target="_blank" rel="noreferrer">Open detailed build logs ↗</a>}
          <div className="binary-build-result-links">
            {Object.entries(binaryBuildLinks).map(([target, item]) => <div className="binary-build-result-item" key={target}>
              <span className={"binary-build-state " + (item.status === "success" && item.url ? "ready" : "failed")}>{item.status === "success" && item.url ? "Ready" : item.status === "skipped" ? "Not requested" : "Failed"}</span>
              <span>{target === "windows" ? "Windows installer (.exe)" : "Android app (.apk)"}</span>
              {item.url && item.status === "success" ? <a href={item.url} target="_blank" rel="noreferrer" download={item.filename || undefined}>Download {target === "windows" ? "EXE" : "APK"} ↓</a> : <span className="binary-build-muted">No artifact</span>}
              {item.status === "success" && item.sizeBytes ? <small>{(item.sizeBytes / 1048576).toFixed(2)} MB · SHA-256 <span title={item.sha256 || ""}>{String(item.sha256 || "not reported").slice(0, 12)}</span></small> : null}
            </div>)}
          </div>
          <small>Windows output is an Electron installer. Android output is a debug-signed APK for testing and direct installation, not a Play Store release.</small>
        </div>}
        <div className={"workspace" + (!previewOpen ? " preview-minimized" : "")}>
          <section className="conversation-panel">
            {section === "chat" && <>
              {project.plan && <div className="pinned-plan-strip" role="region" aria-label="Pinned project plan">
                <div className="pinned-plan-mark">✓</div>
                <div className="pinned-plan-copy"><div className="pinned-plan-label">PINNED PROJECT PLAN <span>· {project.plan.engine === "canvas2d" ? "2D" : project.plan.engine === "webgl3d" ? "3D" : "WEB APP"}</span></div><strong>{project.plan.title}</strong><p>{project.plan.summary}</p></div>
                <div className="pinned-plan-progress">{project.buildRun ? <><strong>{project.buildRun.tasks.filter(task => task.status === "passed").length}/{project.buildRun.tasks.length}</strong><small>tasks passed</small></> : <><strong>{project.plan.tasks.length}</strong><small>planned tasks</small></>}</div>
                <button type="button" onClick={() => setSection("tasks")}>Open plan ↗</button>
              </div>}
              <div className="conversation-scroll">
                {!project.initialPrompt && project.messages.length < 2 && <div className="welcome-block">
                  <div className="welcome-orbit"><GeneMark /><i /><b /></div>
                  <div className="eyebrow">GENE 1.3 FLASH</div>
                  {project.kind === "app" ? <h1>Build an app<br /><em>worth using.</em></h1> : <h1>Make a game<br /><em>worth playing.</em></h1>}
                  <p>{project.kind === "app" ? "Describe the tool, website or dashboard you need. We\'ll plan the experience, build the real interface and refine it together." : "Tell GENE what you\'re imagining. We\'ll plan it together, then build and test the actual files."}</p>
                  <div className="starter-grid">
                    {project.kind === "app" ? <>
                      <button onClick={() => setDraft("Build a polished personal portfolio website with project cards, about and contact sections, responsive navigation and a working contact form interaction.")}><span className="starter-icon warm">↗</span><strong>Portfolio site</strong><small>Projects, about and contact</small></button>
                      <button onClick={() => setDraft("Build a clean task manager web app with add, edit, complete and delete tasks; priority, search, filters, local persistence and a useful empty state.")}><span className="starter-icon rose">✓</span><strong>Task manager</strong><small>Tasks, priorities and filters</small></button>
                      <button onClick={() => setDraft("Build a modern analytics dashboard with responsive sidebar, KPI cards, charts rendered with local SVG or CSS, date filters and working navigation between dashboard sections.")}><span className="starter-icon blue">▥</span><strong>Analytics dashboard</strong><small>KPIs, charts and filters</small></button>
                      <button onClick={surpriseMe}><span className="starter-icon violet">✦</span><strong>Surprise me</strong><small>Invent a useful web app</small></button>
                    </> : <>
                      <button onClick={() => setDraft("A 2D platformer set in an Egyptian desert, with responsive jumping, enemy patrols, coins, checkpoints and a guardian boss.")}><span className="starter-icon warm">↗</span><strong>Desert platformer</strong><small>Jump, explore, fight a guardian</small></button>
                      <button onClick={() => setDraft("A fast 2D rhythm runner with a distinctive sunset palette, jumps timed to pulses, spikes, moving platforms and three handcrafted levels.")}><span className="starter-icon rose">⌁</span><strong>Rhythm runner</strong><small>One-button precision gameplay</small></button>
                      <button onClick={() => setDraft("A compact 3D lane runner through a rainy railway yard, with lane switching, jump and slide, coins, trains, obstacles and a score chase.")}><span className="starter-icon blue">◇</span><strong>3D lane runner</strong><small>Switch lanes, jump, slide, collect</small></button>
                      <button onClick={surpriseMe}><span className="starter-icon violet">✦</span><strong>Surprise me</strong><small>Invent something unexpected</small></button>
                    </>}
                  </div>
                </div>}
                {activeMessages.map(msg => <div key={msg.id} className={"message-row " + msg.role + (msg.kind ? " kind-" + msg.kind : "")}>
                  {msg.role !== "user" && <div className="message-avatar">{msg.role === "system" ? "•" : "G"}</div>}
                  <div className="message-content">
                    {msg.role === "user" ? <div className="user-bubble">{msg.content}</div> : <div className="assistant-copy">{msg.content}</div>}
                    {msg.kind === "error" && <div className="inline-error">No verified changes were applied.</div>}
                  </div>
                </div>)}
                {project.question && <div className="question-card">
                  <div className="question-kicker">ONE DECISION AT A TIME</div>
                  <h3>{project.question.text}</h3>
                  {project.question.why && <p>{project.question.why}</p>}
                  <div className="choice-list">{(project.question.choices || []).map(choice => <button key={choice} onClick={() => void runAgent(choice)} disabled={busy}>{choice}<span>↗</span></button>)}</div>
                  <button className="text-action" onClick={() => { if(project) void runAgent("Use your recommended smart default for this decision."); }}>Use smart default</button>
                  <button className="text-action" onClick={startBuild}>Skip questions and build</button>
                </div>}
                {project.plan && <div className="plan-card">
                  <div className="plan-card-head"><span className="plan-icon">✓</span><div><div className="eyebrow">IMPLEMENTATION PLAN</div><h3>{project.plan.title}</h3></div></div>
                  <p>{project.plan.summary}</p>
                  <div className="plan-metrics"><span>{project.plan.tasks.length} tasks</span><span>{project.plan.mechanics.length} mechanics</span><span>{project.plan.engine === "canvas2d" ? "Canvas 2D" : "WebGL 3D"}</span><span>{project.plan.performanceBudget.targetFps} FPS target</span></div>
                  <ol>{project.plan.tasks.slice(0, 7).map((task, i) => <li key={task}><span>{String(i + 1).padStart(2, "0")}</span>{task}</li>)}</ol>
                  <button className="primary-button plan-build-button" onClick={startBuild} disabled={busy || buildInProgress}>{buildInProgress ? "Build in progress…" : busy ? "Working…" : "Build this plan"} <span>→</span></button>
                </div>}
                {(busy || buildInProgress || queuedRequestCount > 0) && <div className="working-row"><span className="spinner" /><div><strong>{buildInProgress ? "GENE is building" : queuedRequestCount ? "Requests queued" : "GENE is working"}</strong><small>{queuedRequestCount ? queuedRequestCount + " request(s) queued in order." : operationText(project.mode, hasGame)}{buildInProgress && canQueueBuildRequests ? " The preview is available; new chat requests queue safely." : ""}</small></div><button onClick={() => setShowActivity(!showActivity)}>{showActivity ? "Hide activity" : "View activity"}</button></div>}
                {showActivity && activity.length > 0 && <div className="activity-list">{activity.map(line => <div key={line}>{line}</div>)}</div>}
                <div ref={chatEnd} />
              </div>
              <form className="composer" onSubmit={onSubmit}>
                {project.mode === "plan" && <div className="composer-tools plan-intent-switch" role="group" aria-label="Planning intent">
                  <button type="button" className={planIntent === "create" ? "tool-active" : ""} aria-pressed={planIntent === "create"} onClick={() => setPlanIntent("create")}>Plan a new project</button>
                  <button type="button" className={planIntent === "update" ? "tool-active" : ""} aria-pressed={planIntent === "update"} onClick={() => { setPlanIntent("update"); if (project.question) setProject({ ...project, question: null }); }}>Plan an update</button>
                </div>}
                <div className="composer-toolbar"><span className="composer-context">{project.mode === "plan" ? "PLAN MODE · read-only" : "BUILD MODE · files may change"}</span><span className="composer-context">{searchMode ? "WEB RESEARCH · READ-ONLY" : project.thinking.toUpperCase() + " THINKING"}</span></div>
                <div className="composer-tools gene15-tools">
                  <label className="extended-plan-toggle"><input type="checkbox" checked={extendedPlanning} onChange={e => setExtendedPlanning(e.target.checked)} /> <span><strong>Extended planning</strong><small>Deeper phases, architecture, dependencies and test gates</small></span></label>
                  <button type="button" title="Improve the draft prompt without starting a build" onClick={enhanceDraftPrompt} disabled={!draft.trim() || enhancingPrompt || busy}>{enhancingPrompt ? "Enhancing…" : "✦ Enhance prompt"}</button>
                </div>
                {(project.references || []).length > 0 && <div className="reference-chips">{project.references.map(ref => <div key={ref.id} className="reference-chip"><span>{ref.kind === "image" ? "▧" : "▤"}</span><span title={ref.name}>{ref.name}</span><button type="button" title={"Remove " + ref.name} onClick={() => removeReference(ref.id)}>×</button></div>)}</div>}
                <textarea value={draft} onChange={e => setDraft(e.target.value)} placeholder={project.mode === "plan" ? (planIntent === "update" ? "Describe what to update, fix, or add to this project…" : "Describe your app or game, or answer GENE's question…") : hasGame ? "Ask GENE to change a feature, screen, mechanic, art, or performance…" : "Describe the app or game you want GENE to build…"} rows={3} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (draft.trim() && (!busy || canQueueBuildRequests)) void runAgent(draft); } }} />
                <input ref={referenceInputRef} className="visually-hidden" type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif,.txt,.md,.json,.js,.ts,.css,.gd,.html" onChange={addReferences} />
                <div className="composer-bottom"><div className="composer-tools"><button type="button" title="Attach reference images, documentation, or source files" onClick={() => referenceInputRef.current?.click()}>＋ Reference</button><button type="button" className={searchMode ? "tool-active" : ""} title="Research current documentation and references with Google Search grounding" onClick={() => setSearchMode(!searchMode)}>⌕ Search {searchMode ? "ON" : "web"}</button><button type="button" title="Surprise me" onClick={surpriseMe}>✦ Surprise me</button><span className="key-hint">Enter to send · Shift+Enter for newline</span></div><button className="send-button" type="submit" disabled={(busy && !canQueueBuildRequests) || !draft.trim()}>{buildInProgress && canQueueBuildRequests ? "Queue request" : busy ? "Working…" : "Send"} <span>↑</span></button></div>
              </form>
            </>}

            {section === "files" && <div className="tool-view">
              <div className="tool-view-heading"><div className="eyebrow">SOURCE CONTROL</div><h2>Project files</h2><p>These are the actual files saved with this project in this browser.</p></div>
              {!Object.keys(project.files).length ? <div className="empty-state">{project.kind === "app" ? "No source files yet. Describe the app, review the plan, then switch to Build mode to generate the real interface." : "No source files yet. Plan the game, then switch to Build mode and ask GENE to build it."}</div> : <><div className="editor-tabs">{Object.keys(project.files).map(path => <button key={path} className={project.activeFile === path ? "active" : ""} onClick={() => selectProjectFile(path)}>{fileName(path, project.kind || "game")}</button>)}</div><textarea className="code-editor" spellCheck={false} value={editedFile} onChange={e => { setEditedFile(e.target.value); setFileDirty(true); }} /><div className="editor-footer"><span>{fileDirty ? "Unsaved editor changes" : "Saved in local project state"} · {editedFile.length.toLocaleString()} characters</span><button className="primary-button" onClick={saveManualEdit} disabled={!fileDirty || project.mode === "plan"}>{project.mode === "plan" ? "Build mode required" : "Save as version"}</button></div></>}
            </div>}

            {section === "tasks" && <div className="tool-view">
              <div className="tool-view-heading"><div className="eyebrow">PLANNING & QUALITY</div><h2>Plan & tasks</h2><p>{project.kind === "app" ? "Review the scope, run source/runtime checks, then exercise the app flows and forms that matter." : "Review scope, run source/runtime smoke checks, then play the game to verify the mechanics that matter."}</p></div>
              {project.buildRun && <div className="build-check-panel">
                <div className="build-check-head"><div><div className="eyebrow">GENE 1.4 FLASH</div><h3>Build checkpoints</h3><p>Prototype target: {project.buildRun.prototype?.targetMinutes ? "~" + project.buildRun.prototype.targetMinutes + " min" : "project-specific estimate pending"} · Full-game target: {project.buildRun.fullGame?.targetMinutes ? "~" + project.buildRun.fullGame.targetMinutes + " min" : "project-specific estimate pending"}</p></div><span className={"check-status " + (project.livingPreview?.status === "error" ? "fail" : project.livingPreview?.status === "playable" ? "pass" : "warn")}>{project.livingPreview?.status === "playable" ? "Preview rendered" : project.livingPreview?.status === "error" ? "Runtime error" : "Checking preview"}</span></div>
                <div className="task-list">{project.buildRun.tasks.map(task => <div key={task.id}><span>{task.status === "passed" ? "✓" : task.status === "running" ? "…" : task.status === "failed" ? "×" : "○"}</span><p>{task.title}</p><small>{task.status}{task.attempts ? " · attempt " + task.attempts : ""}</small></div>)}</div>
                <p className="build-check-disclaimer">A validated prototype is not the full game. The full-game target requires additional content, progression, and a separate ending; rendering alone does not prove every gameplay objective.</p>
                {(project.buildRun.status === "failed" || project.buildRun.status === "recovering" || project.buildRun.tasks.some(task => task.status === "failed" || task.status === "blocked")) && <button className="primary-button" disabled={busy || buildInProgress} onClick={() => void runAgent("Resume this existing GENE build from its latest saved checkpoint. Restore checkpoint files, keep every passed task unchanged, retry only unfinished or failed tasks, then rerun final validation and repair. Do not restart from zero or claim completion unless all required tasks pass.", "build")}>Resume from checkpoint</button>}
              </div>}
              <div className="build-check-panel">
                <div className="build-check-head"><div><div className="eyebrow">QUALITY GATE</div><h3>Build checks</h3><p>{project.kind === "app" ? "Inspect project structure, syntax, interactive handlers and preview evidence." : "Inspect project structure, syntax, renderer, controls and preview evidence."}</p></div><button className="primary-button" onClick={runBuildChecks} disabled={!hasGame}>Run build checks</button></div>
                {!hasGame && <p className="build-check-empty">{project.kind === "app" ? "Build an app first to run checks on its actual source files." : "Build a game first to run checks on its actual source files."}</p>}
                {buildReport && <div className="build-check-results">
                  <div className={"build-check-summary " + (reportIsCurrent ? "current" : "stale")}><strong>{reportIsCurrent ? "Latest report" : "Report is out of date"}</strong><span>{buildReport.checks.filter(check => check.status === "pass").length} passed · {buildReport.checks.filter(check => check.status === "warn").length} warnings · {buildReport.checks.filter(check => check.status === "fail").length} failed</span></div>
                  <div className="build-check-list">{buildReport.checks.map(check => <div className="build-check-item" key={check.label}><span className={"check-status " + check.status}>{check.status === "pass" ? "✓" : check.status === "warn" ? "!" : "×"}</span><strong>{check.label}</strong><span className="check-detail">{check.detail}</span></div>)}</div>
                  <p className="build-check-timestamp">Checked {new Date(buildReport.checkedAt).toLocaleString()}{buildReport.checkedDirty ? " · includes the editor buffer" : " · saved source files"}</p>
                </div>}
                <p className="build-check-disclaimer">{project.kind === "app" ? "A visible preview does not prove every user flow works. Test forms, navigation, responsive layouts and persistence before sharing it." : "A visible render signal does not prove every mechanic works. Play the game and test movement, collisions, objectives, and restart behavior before sharing it."}</p>
              </div>
              {project.plan ? <><div className="plan-overview"><h3>{project.plan.title}</h3><p>{project.plan.summary}</p><div className="plan-metrics"><span>{project.plan.engine}</span>{project.kind === "app" ? <><span>{project.plan.mechanics.length} planned features</span><span>{project.plan.tasks.length} implementation steps</span></> : <><span>Target {project.plan.performanceBudget.targetFps} FPS</span><span>Max enemies {project.plan.performanceBudget.maxEnemies}</span></>}</div></div><div className="task-list">{project.plan.tasks.map((task, i) => <div key={task}><span>{String(i + 1).padStart(2, "0")}</span><p>{task}</p><small>{Object.keys(project.files).length ? "Source exists; verify task completion in the live game." : "Planned"}</small></div>)}</div><button className="primary-button" onClick={startBuild} disabled={busy}>Start building plan →</button></> : <div className="empty-state">{project.kind === "app" ? "No plan yet. Describe the app in Chat, then GENE will help define its screens and user flows." : "No plan yet. Describe a game in Chat, then GENE will interview you one question at a time."}</div>}
            </div>}

            {section === "assets" && <div className="tool-view forge-view">
  <div className="tool-view-heading">
    <div className="eyebrow">GENE FORGE · REAL MESH FILES</div>
    <h2>Asset workshop</h2>
    <p>Describe an asset or request changes to a saved one. The selected AI provider returns a structured part recipe; GENE turns it into actual OBJ geometry and MTL materials, then validates and saves the files in this project.</p>
  </div>
  <div className="forge-form">
    <div className="forge-form-top">
      <label>Asset type<select value={forgeKind} onChange={e => setForgeKind(e.target.value as typeof forgeKind)}><option value="prop">Prop</option><option value="character">Character</option><option value="vehicle">Vehicle</option><option value="building">Building</option><option value="environment">Environment</option><option value="weapon">Weapon</option></select></label>
      <label>Detail budget<select value={forgeQuality} onChange={e => setForgeQuality(e.target.value as typeof forgeQuality)}><option value="performance">Performance · up to 32 parts</option><option value="standard">Standard · up to 54 parts</option><option value="high">High detail · up to 76 parts</option></select></label>
    </div>
    {forgeTargetId && <div className="forge-editing"><span className="status-dot online" /> Editing the saved asset <strong>{savedAssets.find(asset => asset.id === forgeTargetId)?.name || forgeTargetId}</strong><button onClick={() => { setForgeTargetId(null); setForgePrompt(""); setForgeNotice(""); }}>Create new asset instead</button></div>}
    <textarea className="forge-prompt" value={forgePrompt} onChange={e => setForgePrompt(e.target.value)} placeholder={forgeTargetId ? "Describe the changes to this exact mesh — e.g. make the wheels larger, lower the cabin, and add protective side panels." : "Describe the mesh — e.g. a compact metro maintenance rover with four chunky wheels, a sloped glass cabin, protective bumpers, yellow safety markings and a coherent industrial silhouette."} rows={3} />
    <div className="forge-form-bottom"><span>{apiReady ? "AI connected · mesh generation uses the selected model" : "Configure Gemini, Groq, or OpenRouter · no fake local generation"}</span><button className="primary-button" onClick={() => void generateForgeAsset()} disabled={forgeBusy || !forgePrompt.trim() || apiReady !== true}>{forgeBusy ? <><span className="spinner small-spinner" /> Generating mesh…</> : forgeTargetId ? "Apply mesh edits" : "Generate 3D mesh"} <span>↗</span></button></div>
    {forgeNotice && <div className="forge-notice">{forgeNotice}</div>}
  </div>
  <div className="forge-assets-heading"><div><div className="eyebrow">PROJECT ASSETS</div><h3>Saved meshes <span>{savedAssets.length}</span></h3></div><span>OBJ · MTL · JSON recipe</span></div>
  {savedAssets.length === 0 ? <div className="empty-state forge-empty"><div className="asset-symbol">◇</div><strong>No generated meshes yet</strong><p>Start with a prop, vehicle, character, weapon, or building. A successful result creates real files under <code>assets/&lt;asset-id&gt;/</code>. Mesh generation is not the same thing as importing it into a game scene; integration is a separate, testable change.</p></div> : <div className="forge-asset-grid">
    {savedAssets.map(asset => <article className="forge-asset-card" key={asset.id}>
      <div className="forge-asset-card-title"><div><strong>{asset.name}</strong><small>{asset.kind} · {asset.style}</small></div><button className="icon-button" title="Remove this asset from the project" onClick={() => removeForgeAsset(asset.id)}>×</button></div>
      {project.files[asset.objPath] ? <ObjViewport obj={project.files[asset.objPath]} mtl={project.files[asset.mtlPath] || ""} label={asset.name} /> : <div className="forge-missing-mesh">OBJ file missing</div>}
      <div className="forge-asset-stats"><span>{asset.partCount} parts</span><span>{asset.triangleCount.toLocaleString()} triangles</span></div>
      <div className="forge-asset-actions"><button className="primary-button" onClick={() => { setForgeTargetId(asset.id); setForgeKind((["character","vehicle","building","environment","prop","weapon"].includes(asset.kind) ? asset.kind : "prop") as typeof forgeKind); setForgePrompt(""); setForgeNotice("You are editing the same saved recipe. Describe the changes you want; GENE will generate a new version of this mesh."); }}>Edit with AI</button><button className="secondary-button" onClick={() => downloadAssetFile(asset.objPath)}>OBJ ↓</button><button className="secondary-button" onClick={() => downloadAssetFile(asset.mtlPath)}>MTL ↓</button></div>
    </article>)}
  </div>}
</div>}{section === "versions" && <div className="tool-view"><div className="tool-view-heading"><div className="eyebrow">RECOVERY</div><h2>Versions</h2><p>Every successful source-changing response creates a local snapshot. Restoring creates another snapshot, so history stays intact.</p></div>{project.versions.length ? <div className="version-list">{project.versions.map(version => <div key={version.number} className="version-item"><div className="version-number">v{String(version.number).padStart(3, "0")}</div><div className="version-meta"><strong>{version.label}</strong><small>{new Date(version.createdAt).toLocaleString()} · {Object.keys(version.files).length} files</small><p>{version.testSummary}</p></div><button className="secondary-button" onClick={() => restoreVersion(version)}>Restore</button></div>)}</div> : <div className="empty-state">No versions yet. A version is created when GENE returns files or you save a manual edit.</div>}</div>}
          </section>

          {previewOpen ? <aside className={"preview-panel" + (expandedPreview ? " expanded" : "")}>
            <div className="preview-header"><div className="preview-title"><span className="live-dot" /><div><strong>Live preview</strong><small>{hasGame ? runtimeLabel(runtimeState) : "Waiting for first build"}</small></div></div><div className="preview-actions"><button type="button" className={customEditMode ? "tool-active" : ""} title="Select an element in the live preview to edit it with GENE" disabled={!hasGame} onClick={() => { setCustomEditMode(value => !value); setNotice(customEditMode ? "Custom edit selection cancelled." : "Click an element in the preview. GENE will identify it and prepare an edit prompt."); }}>✎ Select to edit</button><button title="Minimize preview" onClick={() => { setPreviewOpen(false); setExpandedPreview(false); setCustomEditMode(false); }}>–</button><button title={runtimeState === "error" ? "Refresh preview after an error" : "Refresh preview"} onClick={() => { setPreviewKey(n => n + 1); setRuntimeState("idle"); setCustomEditMode(false); }}>↻</button><button title="Open fullscreen game" disabled={!hasGame} onClick={openFullscreenGame}>⛶</button></div></div>
            <div className="preview-stage">{hasGame ? <iframe key={previewKey} ref={iframeRef} title="GENE live game preview" sandbox={isApp ? "allow-scripts allow-forms" : "allow-scripts"} srcDoc={previewDoc} /> : <div className="preview-placeholder"><div className="preview-illustration"><span className="mountain m1" /><span className="mountain m2" /><span className="sun" /><span className="player-shape" /></div><div className="preview-placeholder-text"><strong>Your game, live.</strong><span>Build a project to run the actual generated source here.</span></div></div>}</div>
            {expandedPreview && hasGame && <form className="expanded-live-editor" onSubmit={event => { event.preventDefault(); if (draft.trim() && !busy) void runAgent(draft); }}>
              <div className="expanded-live-editor-label"><span className="live-dot" /> EDIT LIVE <span>Chat edits update this preview</span></div>
              <textarea value={draft} onChange={event => setDraft(event.target.value)} rows={2} placeholder="Describe what to change in the game or app…" aria-label="Edit the live preview" />
              <button type="submit" disabled={busy || !draft.trim()}>{busy ? "Applying…" : "Apply edit"} <span>↑</span></button>
            </form>}
            <div className="preview-footer"><span className={"status-dot " + (runtimeState === "rendered" ? "online" : runtimeState === "error" ? "offline" : "")} />{hasGame ? runtimeLabel(runtimeState) : (project.kind === "app" ? "No app loaded" : "No game loaded")}{isSyncedToLocal && <button onClick={openLocalAgentGame}>Open disk game ↗</button>}<button onClick={downloadProject}>Export project ↓</button></div>
            {expandedPreview && hasGame && <button className="close-expanded" title="Close expanded preview" onClick={() => setExpandedPreview(false)}>Close expanded preview ×</button>}
          </aside> : <button className="preview-reopen-tab" title="Reopen live preview" onClick={() => setPreviewOpen(true)}><span className="live-dot" /> Preview <span>↗</span></button>}
        </div>
        <footer className="statusbar"><div><span className="status-dot online" /> Workspace local state</div><div>{Object.keys(project.files).length} source files <span className="status-divider">·</span> {project.versions.length} versions <span className="status-divider">·</span> {project.thinking} mode</div><button onClick={() => setShowActivity(!showActivity)}>Activity {showActivity ? "▾" : "▴"}</button></footer>
      </section>
    </main>
  );
}

function isConversationOnly(text: string) {
  const value = text.trim().toLowerCase();
  const asksToChange = /\b(add|make|change|fix|improve|remove|replace|implement|create|update|rewrite|refactor|optimize|increase|decrease|move|redesign|build|generate|give the player|put|delete|modify|design)\b/.test(value);
  const startsAsQuestion = /^(what|why|how|can you explain|explain|tell me|suggest|should we|should i|could we|is it|does it|will it|which|would it|what if|give me ideas|can i|do i)\b/.test(value);
  return startsAsQuestion && !asksToChange;
}

function operationText(mode: Mode, hasGame: boolean) {
  if (mode === "plan") return "Checking the idea and next design decision…";
  return hasGame ? "Reading and editing existing source…" : "Generating a complete first playable slice…";
}
function runtimeLabel(state: "idle" | "loaded" | "rendered" | "error") {
  if (state === "rendered") return "Visible render signal";
  if (state === "loaded") return "Runtime loaded · render not yet confirmed";
  if (state === "error") return "Runtime error";
  return "Checking runtime…";
}