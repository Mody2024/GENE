"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentResponse, BuildVersion, GeneProject, Mode, ProjectKind, Thinking } from "./lib/types";
import JSZip from "jszip";
import ObjViewport from "./components/ObjViewport";
import { playableDemoFiles } from "./lib/starter-game";

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
function now() { return new Date().toISOString(); }
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

type BuildCheckStatus = "pass" | "warn" | "fail";
type BuildCheck = { label: string; status: BuildCheckStatus; detail: string };
type BuildReport = { checkedAt: string; projectUpdatedAt: string; checkedDirty: boolean; checkedFile: string; checkedEditorContent: string; checks: BuildCheck[] };

export default function Home() {
  const [project, setProject] = useState<GeneProject | null>(null);
  const [projects, setProjects] = useState<GeneProject[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [apiReady, setApiReady] = useState<boolean | null>(null);
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
      if (event.data?.type === "gene-runtime") {
        const state = event.data.state === "rendered" ? "rendered" : event.data.state === "error" ? "error" : "loaded";
        setRuntimeState(state);
        if (state === "rendered") {
          setProject(current => current && current.versions.length ? {
            ...current,
            versions: current.versions.map((v, index) => index === 0 ? { ...v, testSummary: "Server source checks passed. Browser runtime reported a visible render surface." } : v)
          } : current);
        }
        if (state === "error") {
          const errorText = event.data.message || "unknown runtime error";
          setNotice("The game runtime reported an error: " + errorText);
          setProject(current => current && current.versions.length ? {
            ...current,
            versions: current.versions.map((v, index) => index === 0 ? { ...v, testSummary: "Runtime check failed: " + errorText } : v)
          } : current);
        }
      }
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, []);

  useEffect(() => {
    if (!project || !project.files["game.html"] || !project.files["game.js"] || runtimeState === "rendered" || runtimeState === "error") return;
    const timer = window.setTimeout(() => {
      setRuntimeState("error");
      setNotice("GENE could not confirm a visible game frame. The source exists, but this build is not verified as playable.");
      setProject(projectNow => projectNow && projectNow.versions.length ? {
        ...projectNow,
        versions: projectNow.versions.map((v, index) => index === 0 ? { ...v, testSummary: "Unverified: no visible render signal received within five seconds." } : v)
      } : projectNow);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [project?.id, project?.files, previewKey, runtimeState]);

  const previewDoc = useMemo(() => {
    if (!project || !project.files["game.html"] || !project.files["game.js"]) return "";
    if (project.kind === "app") {
      const html = project.files["game.html"].replace(/<script[\s\S]*?<\/script>/gi, "");
      const css = (project.files["game.css"] || "").replace(/<\/style/gi, "<\\/style");
      const js = (project.files["game.js"] || "").replace(/<\/script/gi, "<\\/script");
      const monitor = [
        "(function(){",
        "function report(){try{var b=document.body;var visible=!!(b&&b.children.length&&(b.innerText.trim().length>0||b.querySelector('button,input,main,section,nav,form,canvas')));parent.postMessage({type:'gene-runtime',state:visible?'rendered':'loaded',renderer:'webapp'},'*');}catch(e){parent.postMessage({type:'gene-runtime',state:'error',renderer:'webapp',message:String(e)},'*');}}",
        "window.addEventListener('error',function(e){parent.postMessage({type:'gene-runtime',state:'error',renderer:'webapp',message:e.message||'app script error'},'*');});",
        "if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',report);else report();setTimeout(report,500);setTimeout(report,1400);",
        "})();"
      ].join("\n");
      return "<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1,maximum-scale=1'><style>html,body{margin:0;min-height:100%;width:100%;font-family:Inter,Arial,sans-serif}*{box-sizing:border-box}" + css + "</style></head><body data-gene-project-kind='app'>" + html + "<script>" + js + "<\/script><script>" + monitor + "<\/script></body></html>";
    }
    const html = project.files["game.html"].replace(/<script[\s\S]*?<\/script>/gi, "");
    const css = (project.files["game.css"] || "").replace(/<\/style/gi, "<\\/style");
    const js = (project.files["game.js"] || "").replace(/<\/script/gi, "<\\/script");
    const spec = project.files["game-spec.json"] || "{}";
    const engine = (() => { try { return JSON.parse(spec).engine === "webgl3d" ? "webgl3d" : "canvas2d"; } catch { return "canvas2d"; } })();
    const monitor = [
      "(function(){",
      "function report(){try{var c=document.getElementById('game-canvas')||document.querySelector('canvas');if(!c){parent.postMessage({type:'gene-runtime',state:'loaded',renderer:'unknown'},'*');return;}var spec={};try{spec=JSON.parse(document.body.getAttribute('data-gene-spec')||'{}')}catch(e){}if(document.body.getAttribute('data-gene-engine')==='webgl3d'){var gl=c.getContext('webgl2')||c.getContext('webgl')||c.getContext('experimental-webgl');if(!gl){parent.postMessage({type:'gene-runtime',state:'error',renderer:'webgl',message:'WebGL context unavailable'},'*');return;}requestAnimationFrame(function(){try{var w=gl.drawingBufferWidth||1,h=gl.drawingBufferHeight||1,pixels=new Uint8Array(w*h*4),step=Math.max(4,Math.floor(pixels.length/5000/4)*4),n=0;gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,pixels);var base=[pixels[0]||0,pixels[1]||0,pixels[2]||0];for(var i=0;i<pixels.length;i+=step){if(pixels[i+3]>0&&(Math.abs(pixels[i]-base[0])+Math.abs(pixels[i+1]-base[1])+Math.abs(pixels[i+2]-base[2])>36))n++;}parent.postMessage({type:'gene-runtime',state:n>12?'rendered':'loaded',visiblePixels:n,renderer:'webgl'},'*');}catch(e){parent.postMessage({type:'gene-runtime',state:'error',renderer:'webgl',message:String(e)},'*');}});return;}var ctx=c.getContext('2d');if(!ctx){parent.postMessage({type:'gene-runtime',state:'error',renderer:'canvas2d',message:'Canvas 2D context unavailable'},'*');return;}var w=c.width||1,h=c.height||1,d=ctx.getImageData(0,0,w,h).data,n=0,step=Math.max(4,Math.floor(d.length/5000/4)*4),base=[d[0]||0,d[1]||0,d[2]||0];for(var i=0;i<d.length;i+=step){if(d[i+3]>0&&(Math.abs(d[i]-base[0])+Math.abs(d[i+1]-base[1])+Math.abs(d[i+2]-base[2])>36))n++;}parent.postMessage({type:'gene-runtime',state:n>12?'rendered':'loaded',visiblePixels:n,renderer:'canvas2d'},'*');}catch(e){parent.postMessage({type:'gene-runtime',state:'error',message:String(e)},'*');}}",
      "window.addEventListener('error',function(e){parent.postMessage({type:'gene-runtime',state:'error',message:e.message||'script error'},'*');});",
      "setTimeout(report,900);setTimeout(report,2200);",
      "})();"
    ].join("\n");
    const instrumentation = "(function(){var original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,attributes){if(typeof type==='string'&&/webgl/i.test(type)){attributes=Object.assign({},attributes||{},{preserveDrawingBuffer:true});}return original.call(this,type,attributes);};})();";
    return "<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no'><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#101419;color:#fff;font-family:Inter,Arial,sans-serif}*{box-sizing:border-box}" + css + "</style></head><body data-gene-spec='" + spec.replace(/&/g,"&amp;").replace(/'/g,"&#39;") + "' data-gene-engine='" + engine + "'><script>" + instrumentation + "<\/script>" + html + "<script>" + js + "<\/script><script>" + monitor + "<\/script></body></html>";
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
    if (!project || busy || !text.trim()) return;
    const prompt = text.trim();
    const isFirstIdea = !project.initialPrompt;
    const answerKey = operationOverride ? undefined : project.question?.id;
    const nextAnswers = answerKey ? { ...project.answers, [answerKey]: prompt } : project.answers;
    let operation = operationOverride || "chat";
    if (!operationOverride) {
      if (searchMode) operation = "research";
      else if (isConversationOnly(prompt)) operation = "chat";
      else if (project.mode === "plan") operation = project.question ? "interview" : project.initialPrompt ? "plan" : "interview";
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
    setProject(nextProject);
    setDraft("");
    setBusy(true);
    setNotice("");
    setRuntimeState("idle");
    setActivity([]);
    addActivity("Request accepted: " + operation);
    setSection("chat");
    try {
      if (operation === "interview") addActivity("Preparing the next interview decision");
      if (operation === "plan") addActivity("Generating an implementation plan");
      if (operation === "build" || operation === "surprise") addActivity("Requesting " + (nextProject.kind === "app" ? "web app" : "game") + " source files from the model");
      if (operation === "edit") addActivity("Reading current project source and applying a targeted edit");
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation,
          mode: operation === "build" || operation === "edit" || operation === "surprise" ? "build" : nextProject.mode,
          message: prompt,
          model: aiModel,
          thinking: nextProject.thinking,
          project: nextProject,
          history: nextProject.messages.slice(-12).map(m => ({ role: m.role, content: m.content })),
          answers: nextAnswers
        })
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        const error = payload?.error?.message || "GENE could not complete the request.";
        addActivity("Request failed: " + error);
        const failed = { ...nextProject, messages: [...nextProject.messages, message("assistant", error, "error")], updatedAt: now() };
        setProject(failed);
        setNotice(error);
        return;
      }
      const result: AgentResponse = payload.result;
      addActivity("Response received from " + (payload.model || payload.aiMode || "agent"));
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
        name: result.plan?.title || ((nextProject.name === "Untitled game" || nextProject.name === "Untitled app") && isFirstIdea && operation !== "chat" && operation !== "research" ? prompt.split(/[.!?]/)[0].slice(0, 38) : nextProject.name),
        mode: operation === "build" || operation === "edit" || operation === "surprise" ? "build" : nextProject.mode,
        answers: nextAnswers,
        question: operation === "research" || operation === "chat" ? nextProject.question : (result.question || null),
        plan: result.plan || nextProject.plan,
        files,
        versions,
        activeFile: changedPaths.includes(nextProject.activeFile) ? nextProject.activeFile : (changedPaths[0] || nextProject.activeFile),
        messages: [...nextProject.messages, assistantMessage],
        updatedAt: now()
      };
      setProject(updated);
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
      const text = error instanceof Error ? error.message : "Network error";
      const failed = { ...nextProject, messages: [...nextProject.messages, message("assistant", "Request failed: " + text + ". No unverified changes were applied.", "error")] };
      setProject(failed);
      setNotice(text);
      addActivity("Network/response error: " + text);
    } finally {
      setBusy(false);
    }
  }, [project, busy, aiModel, searchMode, localAgentStatus, localAgentToken, localAgentUrl]);

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
      setNotice("Attached " + added.length + " reference file(s). Gemini will receive these references with the next request.");
    }
    if (skipped.length) setNotice((added.length ? "Attached " + added.length + ". " : "") + "Skipped: " + skipped.join(", "));
  }

  function removeReference(id: string) {
    if (!project) return;
    setProject({ ...project, references: (project.references || []).filter(ref => ref.id !== id), updatedAt: now() });
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
    setNotice("Playable sample loaded locally. No Gemini API key is needed to run it; add a key to ask the AI to modify the game.");
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

  async function downloadProject() {
    if (!project) return;
    const zip = new JSZip();
    Object.entries(project.files).forEach(([path, source]) => zip.file(exportProjectPath(path, project.kind || "game"), source));
    (project.references || []).forEach(ref => {
      const safeName = ref.name.replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 120) || "reference";
      if (ref.kind === "image" && ref.dataBase64) zip.file("references/" + safeName, ref.dataBase64, { base64: true });
      else if (ref.kind === "text" && typeof ref.textContent === "string") zip.file("references/" + safeName, ref.textContent);
    });
    project.versions.forEach(version => {
      const prefix = "versions/" + String(version.number).padStart(3, "0") + "/";
      Object.entries(version.files).forEach(([path, source]) => zip.file(prefix + exportProjectPath(path, project.kind || "game"), source));
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
      "Open game.html through a local static server for best results.",
      "Earlier source snapshots are included under versions/.",
      "",
      "Initial request: " + project.initialPrompt,
      "",
      "Important: download is source packaging, not a platform-specific EXE build."
    ].join("\\n"));
    const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (project.name || "gene-project").replace(/[^a-z0-9-_]+/gi, "-") + ".zip";
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function openFullscreenGame() {
    if (!project || !previewDoc) return;
    window.open("/play/" + encodeURIComponent(project.id), "_blank", "noopener,noreferrer");
  }

  if (!project) return <main className="boot"><div className="gene-mark">G</div><p>Opening your workspace…</p></main>;

  const hasGame = Boolean(project.files["game.html"] && project.files["game.js"]);
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
        <button className="brand" title="GENE home" onClick={() => setSection("chat")}><span className="brand-orbit">G</span></button>
        <div className="rail-separator" />
        {nav.map(item => <button key={item.id} className={"rail-item " + (section === item.id ? "selected" : "")} title={item.label} onClick={() => setSection(item.id)}><span>{item.icon}</span></button>)}
        <div className="rail-spacer" />
        <button className="rail-item" title="Switch theme" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}><span>{theme === "dark" ? "☼" : "☾"}</span></button>
        <button className="avatar" title="GENE 1.2 Flash">G</button>
      </aside>

      <aside className="project-sidebar">
        <div className="sidebar-head"><div><div className="eyebrow">WORKSPACE</div><div className="sidebar-title">GENE Studio</div></div><button className="icon-button" title="New project" onClick={() => createNewProject("game")}>＋</button></div>
        <button className="new-project" onClick={() => createNewProject("game")}><span>＋</span> New game project</button>
        <button className="new-project" onClick={() => createNewProject("app")}><span>＋</span> New web app project</button>
        <button className="import-project-button" onClick={loadPlayableDemo}>▶ Try playable demo</button>
        <input ref={projectImportRef} className="visually-hidden" type="file" accept=".zip,.gene.json,application/zip,application/json" onChange={importProject} />
        <button className="import-project-button" onClick={() => projectImportRef.current?.click()}>↥ Import project ZIP</button>
        <div className="sidebar-section-label">CURRENT PROJECT</div>
        <div className="project-card"><span className="project-dot" /><div className="project-name">{project.name}</div><small>{hasGame ? (project.kind === "app" ? "App source created" : "Playable source created") : "Design in progress"}</small></div>
        {projects.filter(p => p.id !== project.id).length > 0 && <>
          <div className="sidebar-section-label">RECENT PROJECTS</div>
          {projects.filter(p => p.id !== project.id).slice(0, 5).map(p => <button key={p.id} className="file-row recent-project-row" onClick={() => { setProject(p); setSection("chat"); setNotice(""); }}><span className="file-icon">◌</span><span>{p.name}</span></button>)}
        </>}
        <div className="sidebar-section-label">PROJECT FILES</div>
        {Object.keys(project.files).length ? Object.keys(project.files).map(path => <button key={path} className={"file-row " + (section === "files" && project.activeFile === path ? "file-selected" : "")} onClick={() => selectProjectFile(path)}><span className="file-icon">{path.endsWith(".js") ? "JS" : path.endsWith(".css") ? "¶" : path.endsWith(".json") ? "{}" : "H"}</span><span>{fileName(path, project.kind || "game")}</span></button>) : <div className="empty-sidebar">Files appear here after GENE builds a project.</div>}
        <div className="sidebar-bottom">
          <div className="connection-row"><span className={"status-dot " + (apiReady ? "online" : "offline")} />{apiReady === null ? "Checking AI connection" : apiReady ? "Gemini connected" : "Gemini key missing"}</div>
          <small>{apiReady ? aiModel : "AI builds require a server-side key"}</small>
          <div className="agent-connection">
            <div className="connection-row"><span className={"status-dot " + (localAgentStatus === "connected" ? "online" : localAgentStatus === "error" ? "offline" : "")} />{localAgentStatus === "connected" ? "Local Agent connected" : localAgentStatus === "checking" ? "Checking Local Agent" : localAgentStatus === "error" ? "Local Agent error" : "Local Agent disconnected"}</div>
            {localAgentWorkspace && <small title={localAgentWorkspace}>{localAgentWorkspace}</small>}
            <button className="agent-connect-button" onClick={connectLocalAgent}>{localAgentStatus === "connected" ? "Agent settings" : "Connect Local Agent"}</button>
            {hasGame && localAgentStatus === "connected" && <button className="agent-connect-button" onClick={syncToLocalAgent} disabled={busy}>{isSyncedToLocal ? "Resync project files" : "Write project to disk"}</button>}
            {isSyncedToLocal && <button className="agent-connect-button" onClick={openLocalAgentGame}>Open disk-backed game ↗</button>}
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
            <select className="thinking-select" value={project.thinking} aria-label="Thinking mode" onChange={e => setProject({ ...project, thinking: e.target.value as Thinking })}>
              <option value="fast">Fast</option><option value="balanced">Balanced</option><option value="deep">Deep</option>
            </select>
            <button className="top-play-button" title={project.kind === "app" ? "Open the current app in a separate tab" : "Play the current game in a separate tab"} onClick={openFullscreenGame} disabled={!hasGame}>↗ Preview</button>
            <button className="mobile-preview-button" title="Open live preview" onClick={() => { setPreviewOpen(true); setExpandedPreview(true); }} disabled={!hasGame}>◫ Preview</button>
            <button className={"sync-button " + (isSyncedToLocal ? "synced" : "")} title="Write the actual project files to your computer using GENE Local Agent" onClick={syncToLocalAgent} disabled={!hasGame || busy || localAgentStatus === "checking"}>{isSyncedToLocal ? "Synced to disk ✓" : "Sync files ↥"}</button>
            <button className="icon-button subtle" title="Download project ZIP" onClick={downloadProject}>↓</button>
          </div>
        </header>

        {notice && <div className="notice"><span>{notice}</span><button onClick={() => setNotice("")}>Dismiss</button></div>}

        <div className="workspace">
          <section className="conversation-panel">
            {section === "chat" && <>
              <div className="conversation-scroll">
                {!project.initialPrompt && project.messages.length < 2 && <div className="welcome-block">
                  <div className="welcome-orbit"><span>G</span><i /><b /></div>
                  <div className="eyebrow">GENE 1.2 FLASH</div>
                  <h1>Make a game<br /><em>worth playing.</em></h1>
                  <p>Tell GENE what you're imagining. We'll plan it together, then build and test the actual files.</p>
                  <div className="starter-grid">
                    <button onClick={() => setDraft("A 2D platformer set in an Egyptian desert, with responsive jumping, enemy patrols, coins, checkpoints and a guardian boss.")}><span className="starter-icon warm">↗</span><strong>Desert platformer</strong><small>Jump, explore, fight a guardian</small></button>
                    <button onClick={() => setDraft("A fast 2D rhythm runner with a distinctive neon-free sunset palette, jumps timed to pulses, spikes, moving platforms and 3 handcrafted levels.")}><span className="starter-icon rose">⌁</span><strong>Rhythm runner</strong><small>One-button precision gameplay</small></button>
                    <button onClick={() => setDraft("A compact 3D lane runner through a rainy railway yard, with lane switching, jump and slide, coins, trains, obstacles and a score chase.")}><span className="starter-icon blue">◇</span><strong>3D lane runner</strong><small>Switch lanes, jump, slide, collect</small></button>
                    <button onClick={surpriseMe}><span className="starter-icon violet">✦</span><strong>Surprise me</strong><small>Invent something unexpected</small></button>
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
                  <button className="primary-button plan-build-button" onClick={startBuild} disabled={busy}>{busy ? "Working…" : "Build this plan"} <span>→</span></button>
                </div>}
                {busy && <div className="working-row"><span className="spinner" /><div><strong>GENE is working</strong><small>{operationText(project.mode, hasGame)}</small></div><button onClick={() => setShowActivity(!showActivity)}>{showActivity ? "Hide activity" : "View activity"}</button></div>}
                {showActivity && activity.length > 0 && <div className="activity-list">{activity.map(line => <div key={line}>{line}</div>)}</div>}
                <div ref={chatEnd} />
              </div>
              <form className="composer" onSubmit={onSubmit}>
                <div className="composer-toolbar"><span className="composer-context">{project.mode === "plan" ? "PLAN MODE · read-only" : "BUILD MODE · files may change"}</span><span className="composer-context">{searchMode ? "GOOGLE SEARCH GROUNDING · READ-ONLY" : project.thinking.toUpperCase() + " THINKING"}</span></div>
                {(project.references || []).length > 0 && <div className="reference-chips">{project.references.map(ref => <div key={ref.id} className="reference-chip"><span>{ref.kind === "image" ? "▧" : "▤"}</span><span title={ref.name}>{ref.name}</span><button type="button" title={"Remove " + ref.name} onClick={() => removeReference(ref.id)}>×</button></div>)}</div>}
                <textarea value={draft} onChange={e => setDraft(e.target.value)} placeholder={project.mode === "plan" ? "Describe your game or answer GENE's question…" : hasGame ? "Ask GENE to change a mechanic, art, level, or performance…" : "Describe the game you want GENE to build…"} rows={3} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (draft.trim() && !busy) void runAgent(draft); } }} />
                <input ref={referenceInputRef} className="visually-hidden" type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif,.txt,.md,.json,.js,.ts,.css,.gd,.html" onChange={addReferences} />
                <div className="composer-bottom"><div className="composer-tools"><button type="button" title="Attach game art, documentation, or source files" onClick={() => referenceInputRef.current?.click()}>＋ Reference</button><button type="button" className={searchMode ? "tool-active" : ""} title="Research current documentation and references with Google Search grounding" onClick={() => setSearchMode(!searchMode)}>⌕ Search {searchMode ? "ON" : "web"}</button><button type="button" title="Surprise me" onClick={surpriseMe}>✦ Surprise me</button><span className="key-hint">Enter to send · Shift+Enter for newline</span></div><button className="send-button" type="submit" disabled={busy || !draft.trim()}>{busy ? "Working…" : "Send"} <span>↑</span></button></div>
              </form>
            </>}

            {section === "files" && <div className="tool-view">
              <div className="tool-view-heading"><div className="eyebrow">SOURCE CONTROL</div><h2>Project files</h2><p>These are the actual files saved with this project in this browser.</p></div>
              {!Object.keys(project.files).length ? <div className="empty-state">No source files yet. Plan the game, then switch to Build mode and ask GENE to build it.</div> : <><div className="editor-tabs">{Object.keys(project.files).map(path => <button key={path} className={project.activeFile === path ? "active" : ""} onClick={() => selectProjectFile(path)}>{path}</button>)}</div><textarea className="code-editor" spellCheck={false} value={editedFile} onChange={e => { setEditedFile(e.target.value); setFileDirty(true); }} /><div className="editor-footer"><span>{fileDirty ? "Unsaved editor changes" : "Saved in local project state"} · {editedFile.length.toLocaleString()} characters</span><button className="primary-button" onClick={saveManualEdit} disabled={!fileDirty || project.mode === "plan"}>{project.mode === "plan" ? "Build mode required" : "Save as version"}</button></div></>}
            </div>}

            {section === "tasks" && <div className="tool-view">
              <div className="tool-view-heading"><div className="eyebrow">PLANNING & QUALITY</div><h2>Plan & tasks</h2><p>Review scope, run source/runtime smoke checks, then play the game to verify the mechanics that matter.</p></div>
              <div className="build-check-panel">
                <div className="build-check-head"><div><div className="eyebrow">QUALITY GATE</div><h3>Build checks</h3><p>Inspect project structure, syntax, renderer, controls and preview evidence.</p></div><button className="primary-button" onClick={runBuildChecks} disabled={!hasGame}>Run build checks</button></div>
                {!hasGame && <p className="build-check-empty">Build a game first to run checks on its actual source files.</p>}
                {buildReport && <div className="build-check-results">
                  <div className={"build-check-summary " + (reportIsCurrent ? "current" : "stale")}><strong>{reportIsCurrent ? "Latest report" : "Report is out of date"}</strong><span>{buildReport.checks.filter(check => check.status === "pass").length} passed · {buildReport.checks.filter(check => check.status === "warn").length} warnings · {buildReport.checks.filter(check => check.status === "fail").length} failed</span></div>
                  <div className="build-check-list">{buildReport.checks.map(check => <div className="build-check-item" key={check.label}><span className={"check-status " + check.status}>{check.status === "pass" ? "✓" : check.status === "warn" ? "!" : "×"}</span><strong>{check.label}</strong><span className="check-detail">{check.detail}</span></div>)}</div>
                  <p className="build-check-timestamp">Checked {new Date(buildReport.checkedAt).toLocaleString()}{buildReport.checkedDirty ? " · includes the editor buffer" : " · saved source files"}</p>
                </div>}
                <p className="build-check-disclaimer">A visible render signal does not prove every mechanic works. Play the game and test movement, collisions, objectives, and restart behavior before sharing it.</p>
              </div>
              {project.plan ? <><div className="plan-overview"><h3>{project.plan.title}</h3><p>{project.plan.summary}</p><div className="plan-metrics"><span>{project.plan.engine}</span><span>Target {project.plan.performanceBudget.targetFps} FPS</span><span>Max enemies {project.plan.performanceBudget.maxEnemies}</span></div></div><div className="task-list">{project.plan.tasks.map((task, i) => <div key={task}><span>{String(i + 1).padStart(2, "0")}</span><p>{task}</p><small>{Object.keys(project.files).length ? "Source exists; verify task completion in the live game." : "Planned"}</small></div>)}</div><button className="primary-button" onClick={startBuild} disabled={busy}>Start building plan →</button></> : <div className="empty-state">No plan yet. Describe a game in Chat, then GENE will interview you one question at a time.</div>}
            </div>}

            {section === "assets" && <div className="tool-view forge-view">
  <div className="tool-view-heading">
    <div className="eyebrow">GENE FORGE · REAL MESH FILES</div>
    <h2>Asset workshop</h2>
    <p>Describe an asset or request changes to a saved one. Gemini returns a structured part recipe; GENE turns it into actual OBJ geometry and MTL materials, then validates and saves the files in this project.</p>
  </div>
  <div className="forge-form">
    <div className="forge-form-top">
      <label>Asset type<select value={forgeKind} onChange={e => setForgeKind(e.target.value as typeof forgeKind)}><option value="prop">Prop</option><option value="character">Character</option><option value="vehicle">Vehicle</option><option value="building">Building</option><option value="environment">Environment</option><option value="weapon">Weapon</option></select></label>
      <label>Detail budget<select value={forgeQuality} onChange={e => setForgeQuality(e.target.value as typeof forgeQuality)}><option value="performance">Performance · up to 32 parts</option><option value="standard">Standard · up to 54 parts</option><option value="high">High detail · up to 76 parts</option></select></label>
    </div>
    {forgeTargetId && <div className="forge-editing"><span className="status-dot online" /> Editing the saved asset <strong>{savedAssets.find(asset => asset.id === forgeTargetId)?.name || forgeTargetId}</strong><button onClick={() => { setForgeTargetId(null); setForgePrompt(""); setForgeNotice(""); }}>Create new asset instead</button></div>}
    <textarea className="forge-prompt" value={forgePrompt} onChange={e => setForgePrompt(e.target.value)} placeholder={forgeTargetId ? "Describe the changes to this exact mesh — e.g. make the wheels larger, lower the cabin, and add protective side panels." : "Describe the mesh — e.g. a compact metro maintenance rover with four chunky wheels, a sloped glass cabin, protective bumpers, yellow safety markings and a coherent industrial silhouette."} rows={3} />
    <div className="forge-form-bottom"><span>{apiReady ? "Gemini connected · mesh generation uses the selected model" : "Gemini API key required · no fake local generation"}</span><button className="primary-button" onClick={() => void generateForgeAsset()} disabled={forgeBusy || !forgePrompt.trim() || apiReady !== true}>{forgeBusy ? <><span className="spinner small-spinner" /> Generating mesh…</> : forgeTargetId ? "Apply mesh edits" : "Generate 3D mesh"} <span>↗</span></button></div>
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

          <aside className={"preview-panel " + (!previewOpen ? "collapsed" : "") + (expandedPreview ? " expanded" : "")}>
            <div className="preview-header"><div className="preview-title"><span className="live-dot" /><div><strong>Live preview</strong><small>{hasGame ? runtimeLabel(runtimeState) : "Waiting for first build"}</small></div></div><div className="preview-actions"><button title={previewOpen ? "Minimize preview" : "Open preview"} onClick={() => setPreviewOpen(!previewOpen)}>{previewOpen ? "–" : "□"}</button><button title="Refresh preview" onClick={() => { setPreviewKey(n => n + 1); setRuntimeState("idle"); }}>↻</button><button title="Open fullscreen game" disabled={!hasGame} onClick={openFullscreenGame}>⛶</button></div></div>
            {previewOpen && <><div className="preview-stage">{hasGame ? <iframe key={previewKey} ref={iframeRef} title="GENE live game preview" sandbox="allow-scripts" srcDoc={previewDoc} /> : <div className="preview-placeholder"><div className="preview-illustration"><span className="mountain m1" /><span className="mountain m2" /><span className="sun" /><span className="player-shape" /></div><div className="preview-placeholder-text"><strong>Your game, live.</strong><span>Build a project to run the actual generated source here.</span></div></div>}</div><div className="preview-footer"><span className={"status-dot " + (runtimeState === "rendered" ? "online" : runtimeState === "error" ? "offline" : "")} />{hasGame ? runtimeLabel(runtimeState) : (project.kind === "app" ? "No app loaded" : "No game loaded")}{isSyncedToLocal && <button onClick={openLocalAgentGame}>Open disk game ↗</button>}<button onClick={downloadProject}>Export project ↓</button></div></>}
            {expandedPreview && hasGame && <button className="close-expanded" title="Close expanded preview" onClick={() => setExpandedPreview(false)}>Close expanded preview ×</button>}
          </aside>
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