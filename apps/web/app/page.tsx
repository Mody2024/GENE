"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentResponse, BuildVersion, GeneProject, Mode, Thinking } from "./lib/types";
import JSZip from "jszip";

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
function newProject(): GeneProject {
  return {
    id: uid(),
    name: "Untitled game",
    initialPrompt: "",
    mode: "plan",
    thinking: "balanced",
    messages: [message("assistant", "Hey, I'm GENE. Tell me the game you're imagining. I'll ask one meaningful question at a time, then we can review the plan before building.")],
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
function fileName(path: string) { return path.split("/").pop() || path; }

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
  const [showActivity, setShowActivity] = useState(false);
  const [searchMode, setSearchMode] = useState(false);
  const [activity, setActivity] = useState<string[]>([]);
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
      const list: GeneProject[] = stored.map(item => ({ ...item, references: item.references || [] }));
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
    const merged = [project, ...projects.filter(p => p.id !== project.id)].slice(0, 30);
    setProjects(prev => {
      const next = [project, ...prev.filter(p => p.id !== project.id)].slice(0, 30);
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
    const html = project.files["game.html"].replace(/<script[\s\S]*?<\/script>/gi, "");
    const css = (project.files["game.css"] || "").replace(/<\/style/gi, "<\\/style");
    const js = (project.files["game.js"] || "").replace(/<\/script/gi, "<\\/script");
    const spec = project.files["game-spec.json"] || "{}";
    const monitor = [
      "(function(){",
      "function report(){try{var c=document.getElementById('game-canvas')||document.querySelector('canvas');if(!c){parent.postMessage({type:'gene-runtime',state:'loaded'},'*');return;}var ctx=c.getContext('2d');if(ctx){var w=Math.min(c.width||1,80),h=Math.min(c.height||1,60),d=ctx.getImageData(0,0,w,h).data,n=0;for(var i=3;i<d.length;i+=4){if(d[i]>0)n++;}parent.postMessage({type:'gene-runtime',state:n>12?'rendered':'loaded',visiblePixels:n},'*');}else{var gl=c.getContext('webgl')||c.getContext('experimental-webgl');parent.postMessage({type:'gene-runtime',state:gl?'rendered':'loaded'},'*');}}catch(e){parent.postMessage({type:'gene-runtime',state:'error',message:String(e)},'*');}}",
      "window.addEventListener('error',function(e){parent.postMessage({type:'gene-runtime',state:'error',message:e.message||'script error'},'*');});",
      "setTimeout(report,900);setTimeout(report,2200);",
      "})();"
    ].join("\n");
    return "<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no'><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#101419;color:#fff;font-family:Inter,Arial,sans-serif}*{box-sizing:border-box}" + css + "</style></head><body data-gene-spec='" + spec.replace(/&/g,"&amp;").replace(/'/g,"&#39;") + "'>" + html + "<script>" + js + "<\/script><script>" + monitor + "<\/script></body></html>";
  }, [project?.files, project?.id, previewKey]);

  const addActivity = (entry: string) => setActivity(prev => [new Date().toLocaleTimeString() + "  " + entry, ...prev].slice(0, 80));

  const runAgent = useCallback(async (text: string, operationOverride?: string, silent = false) => {
    if (!project || busy || !text.trim()) return;
    const prompt = text.trim();
    const isFirstIdea = !project.initialPrompt;
    const answerKey = project.question?.id;
    const nextAnswers = answerKey ? { ...project.answers, [answerKey]: prompt } : project.answers;
    let operation = operationOverride || "chat";
    if (!operationOverride) {
      if (searchMode) operation = "research";
      else if (project.mode === "plan") operation = project.plan ? "plan" : "interview";
      else if (!Object.keys(project.files).length) operation = "build";
      else operation = isConversationOnly(prompt) ? "chat" : "edit";
    }
    if (operation === "research") setSearchMode(false);
    if (operation === "surprise") {
      operation = "surprise";
    }
    const nextProject: GeneProject = {
      ...project,
      initialPrompt: isFirstIdea ? prompt : project.initialPrompt,
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
      if (operation === "build" || operation === "surprise") addActivity("Requesting game source files from the model");
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
        versions = [version, ...versions];
        addActivity("Saved version " + String(version.number).padStart(3, "0") + " with " + changedPaths.length + " changed files");
      }
      if (result.plan) addActivity("Plan updated: " + result.plan.tasks.length + " task(s)");
      const assistantMessage = message("assistant", result.reply || "Done.", changedPaths.length ? "build" : result.plan ? "plan" : result.question ? "question" : undefined);
      const updated: GeneProject = {
        ...nextProject,
        name: result.plan?.title || (nextProject.name === "Untitled game" && isFirstIdea ? prompt.split(/[.!?]/)[0].slice(0, 38) : nextProject.name),
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
  }, [project, busy, aiModel, searchMode]);

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
    void runAgent("Implement the approved plan as a complete playable game. Start with the highest-value vertical slice and include all required source files.", "build");
  }

  function surpriseMe() {
    if (!project || busy) return;
    setProject({ ...project, mode: "build", question: null });
    void runAgent("Invent and build an original small browser game with one surprising central mechanic. Choose smart defaults and make it genuinely playable.", "surprise");
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
      let references: NonNullable<GeneProject["references"]> = [];
      if (file.name.toLowerCase().endsWith(".zip")) {
        const zip = await JSZip.loadAsync(file);
        const manifestEntry = zip.file("gene.project.json");
        if (!manifestEntry) throw new Error("This ZIP has no gene.project.json manifest.");
        manifest = JSON.parse(await manifestEntry.async("string"));
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
        currentFiles = legacy.files || {};
        if (legacy.plan) manifest.plan = legacy.plan;
        if (Array.isArray(legacy.versions)) versionsByNumber = new Map<number, BuildVersion>(legacy.versions.map((v: BuildVersion) => [v.number, v] as [number, BuildVersion]));
      } else {
        throw new Error("Choose a GENE project ZIP or legacy .gene.json export.");
      }
      if (!Object.keys(currentFiles).length) throw new Error("This project archive contains no game source files.");
      if (!currentFiles["game.html"] || !currentFiles["game.js"]) throw new Error("This archive does not contain both game.html and game.js.");
      const p: GeneProject = {
        id: uid(),
        name: String(manifest.name || file.name.replace(/\.(zip|gene\.json)$/i, "")),
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

  function createNewProject() {
    const p = newProject();
    setProject(p);
    setSection("chat");
    setNotice("");
    setActivity([]);
  }

  function saveManualEdit() {
    if (!project) return;
    if (project.mode === "plan") {
      setNotice("Plan mode is read-only. Switch to Build mode before editing source files.");
      return;
    }
    const updatedFiles = { ...project.files, [project.activeFile]: editedFile };
    const version: BuildVersion = { number: (project.versions[0]?.number || 0) + 1, label: "Manual edit: " + project.activeFile, files: { ...updatedFiles }, createdAt: now(), testSummary: "Manual edit saved. Re-run validation before release." };
    setProject({ ...project, files: updatedFiles, versions: [version, ...project.versions], updatedAt: now() });
    setFileDirty(false);
    setNotice("Saved " + project.activeFile + " as version " + version.number + ". It has not been runtime-verified yet.");
    setPreviewKey(n => n + 1);
  }

  function restoreVersion(version: BuildVersion) {
    if (!project) return;
    const newVersion: BuildVersion = { number: (project.versions[0]?.number || 0) + 1, label: "Restore v" + version.number, files: { ...version.files }, createdAt: now(), testSummary: "Restored snapshot; runtime verification pending." };
    setProject({ ...project, files: { ...version.files }, versions: [newVersion, ...project.versions], activeFile: "game.js", updatedAt: now() });
    setSection("chat");
    setPreviewKey(n => n + 1);
    setNotice("Restored version " + version.number + " into new version " + newVersion.number + ".");
  }

  async function downloadProject() {
    if (!project) return;
    const zip = new JSZip();
    Object.entries(project.files).forEach(([path, source]) => zip.file(path, source));
    (project.references || []).forEach(ref => {
      const safeName = ref.name.replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 120) || "reference";
      if (ref.kind === "image" && ref.dataBase64) zip.file("references/" + safeName, ref.dataBase64, { base64: true });
      else if (ref.kind === "text" && typeof ref.textContent === "string") zip.file("references/" + safeName, ref.textContent);
    });
    project.versions.forEach(version => {
      const prefix = "versions/" + String(version.number).padStart(3, "0") + "/";
      Object.entries(version.files).forEach(([path, source]) => zip.file(prefix + path, source));
      zip.file(prefix + "version.json", JSON.stringify({ number: version.number, label: version.label, createdAt: version.createdAt, testSummary: version.testSummary }, null, 2));
    });
    zip.file("gene.project.json", JSON.stringify({
      id: project.id,
      name: project.name,
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
        <div className="sidebar-head"><div><div className="eyebrow">WORKSPACE</div><div className="sidebar-title">GENE Studio</div></div><button className="icon-button" title="New project" onClick={createNewProject}>＋</button></div>
        <button className="new-project" onClick={createNewProject}><span>＋</span> New game project</button>
        <input ref={projectImportRef} className="visually-hidden" type="file" accept=".zip,.gene.json,application/zip,application/json" onChange={importProject} />
        <button className="import-project-button" onClick={() => projectImportRef.current?.click()}>↥ Import project ZIP</button>
        <div className="sidebar-section-label">CURRENT PROJECT</div>
        <div className="project-card"><span className="project-dot" /><div className="project-name">{project.name}</div><small>{hasGame ? "Playable source created" : "Design in progress"}</small></div>
        {projects.filter(p => p.id !== project.id).length > 0 && <>
          <div className="sidebar-section-label">RECENT PROJECTS</div>
          {projects.filter(p => p.id !== project.id).slice(0, 5).map(p => <button key={p.id} className="file-row recent-project-row" onClick={() => { setProject(p); setSection("chat"); setNotice(""); }}><span className="file-icon">◌</span><span>{p.name}</span></button>)}
        </>}
        <div className="sidebar-section-label">PROJECT FILES</div>
        {Object.keys(project.files).length ? Object.keys(project.files).map(path => <button key={path} className={"file-row " + (section === "files" && project.activeFile === path ? "file-selected" : "")} onClick={() => { setProject({ ...project, activeFile: path }); setSection("files"); }}><span className="file-icon">{path.endsWith(".js") ? "JS" : path.endsWith(".css") ? "¶" : path.endsWith(".json") ? "{}" : "H"}</span><span>{fileName(path)}</span></button>) : <div className="empty-sidebar">Files appear here after GENE builds a project.</div>}
        <div className="sidebar-bottom">
          <div className="connection-row"><span className={"status-dot " + (apiReady ? "online" : "offline")} />{apiReady === null ? "Checking AI connection" : apiReady ? "Gemini connected" : "Gemini key missing"}</div>
          <small>{apiReady ? aiModel : "AI builds require a server-side key"}</small>
        </div>
      </aside>

      <section className="main-column">
        <header className="topbar">
          <div className="breadcrumb"><span>Projects</span><span className="crumb-slash">/</span><strong>{project.name}</strong><span className="saved-pill"><span className="status-dot online" /> Saved locally</span></div>
          <div className="top-actions">
            <div className="mode-switch" role="group" aria-label="Agent mode">
              <button className={project.mode === "plan" ? "active" : ""} onClick={() => setProject({ ...project, mode: "plan" })}>Plan</button>
              <button className={project.mode === "build" ? "active" : ""} onClick={() => setProject({ ...project, mode: "build" })}>Build</button>
            </div>
            <select className="thinking-select" value={project.thinking} aria-label="Thinking mode" onChange={e => setProject({ ...project, thinking: e.target.value as Thinking })}>
              <option value="fast">Fast</option><option value="balanced">Balanced</option><option value="deep">Deep</option>
            </select>
            <button className="icon-button subtle" title="Download project file" onClick={downloadProject}>↓</button>
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
              {!Object.keys(project.files).length ? <div className="empty-state">No source files yet. Plan the game, then switch to Build mode and ask GENE to build it.</div> : <><div className="editor-tabs">{Object.keys(project.files).map(path => <button key={path} className={project.activeFile === path ? "active" : ""} onClick={() => { setProject({ ...project, activeFile: path }); setEditedFile(project.files[path]); setFileDirty(false); }}>{path}</button>)}</div><textarea className="code-editor" spellCheck={false} value={editedFile} onChange={e => { setEditedFile(e.target.value); setFileDirty(true); }} /><div className="editor-footer"><span>{fileDirty ? "Unsaved editor changes" : "Saved in local project state"} · {editedFile.length.toLocaleString()} characters</span><button className="primary-button" onClick={saveManualEdit} disabled={!fileDirty || project.mode === "plan"}>{project.mode === "plan" ? "Build mode required" : "Save as version"}</button></div></>}
            </div>}

            {section === "tasks" && <div className="tool-view"><div className="tool-view-heading"><div className="eyebrow">PLANNING</div><h2>Plan & tasks</h2><p>Review the scope before building. Plan mode itself does not change source files.</p></div>{project.plan ? <><div className="plan-overview"><h3>{project.plan.title}</h3><p>{project.plan.summary}</p><div className="plan-metrics"><span>{project.plan.engine}</span><span>Target {project.plan.performanceBudget.targetFps} FPS</span><span>Max enemies {project.plan.performanceBudget.maxEnemies}</span></div></div><div className="task-list">{project.plan.tasks.map((task, i) => <div key={task}><span>{String(i + 1).padStart(2, "0")}</span><p>{task}</p><small>{Object.keys(project.files).length ? "Build source exists; task completion requires runtime tests." : "Planned"}</small></div>)}</div><button className="primary-button" onClick={startBuild} disabled={busy}>Start building plan →</button></> : <div className="empty-state">No plan yet. Describe a game in Chat, then GENE will interview you one question at a time.</div>}</div>}

            {section === "assets" && <div className="tool-view"><div className="tool-view-heading"><div className="eyebrow">GENE FORGE</div><h2>Assets</h2><p>Asset generation is not reported as complete unless real files are returned and validated.</p></div><div className="asset-notice"><div className="asset-symbol">◇</div><div><strong>Project asset pipeline</strong><p>This current web milestone generates self-contained game code. Dedicated image-to-3D workers, Blender integration, UV editing and rigging are later Forge milestones—not silently simulated here.</p></div></div><button className="secondary-button" onClick={() => setDraft("Create an asset specification and procedural low-poly mesh source for the current game. Explain the geometry and save real source files if supported.")}>Ask GENE about project assets</button></div>}

            {section === "versions" && <div className="tool-view"><div className="tool-view-heading"><div className="eyebrow">RECOVERY</div><h2>Versions</h2><p>Every successful source-changing response creates a local snapshot. Restoring creates another snapshot, so history stays intact.</p></div>{project.versions.length ? <div className="version-list">{project.versions.map(version => <div key={version.number} className="version-item"><div className="version-number">v{String(version.number).padStart(3, "0")}</div><div className="version-meta"><strong>{version.label}</strong><small>{new Date(version.createdAt).toLocaleString()} · {Object.keys(version.files).length} files</small><p>{version.testSummary}</p></div><button className="secondary-button" onClick={() => restoreVersion(version)}>Restore</button></div>)}</div> : <div className="empty-state">No versions yet. A version is created when GENE returns files or you save a manual edit.</div>}</div>}
          </section>

          <aside className={"preview-panel " + (!previewOpen ? "collapsed" : "") + (expandedPreview ? " expanded" : "")}>
            <div className="preview-header"><div className="preview-title"><span className="live-dot" /><div><strong>Live preview</strong><small>{hasGame ? runtimeLabel(runtimeState) : "Waiting for first build"}</small></div></div><div className="preview-actions"><button title={previewOpen ? "Minimize preview" : "Open preview"} onClick={() => setPreviewOpen(!previewOpen)}>{previewOpen ? "–" : "□"}</button><button title="Refresh preview" onClick={() => { setPreviewKey(n => n + 1); setRuntimeState("idle"); }}>↻</button><button title="Open fullscreen game" disabled={!hasGame} onClick={openFullscreenGame}>⛶</button></div></div>
            {previewOpen && <><div className="preview-stage">{hasGame ? <iframe key={previewKey} ref={iframeRef} title="GENE live game preview" sandbox="allow-scripts" srcDoc={previewDoc} /> : <div className="preview-placeholder"><div className="preview-illustration"><span className="mountain m1" /><span className="mountain m2" /><span className="sun" /><span className="player-shape" /></div><div className="preview-placeholder-text"><strong>Your game, live.</strong><span>Build a project to run the actual generated source here.</span></div></div>}</div><div className="preview-footer"><span className={"status-dot " + (runtimeState === "rendered" ? "online" : runtimeState === "error" ? "offline" : "")} />{hasGame ? runtimeLabel(runtimeState) : "No game loaded"}<button onClick={downloadProject}>Export project ↓</button></div></>}
            {expandedPreview && hasGame && <button className="close-expanded" onClick={() => setExpandedPreview(false)}>Close expanded preview ×</button>}
          </aside>
        </div>
        <footer className="statusbar"><div><span className="status-dot online" /> Workspace local state</div><div>{Object.keys(project.files).length} source files <span className="status-divider">·</span> {project.versions.length} versions <span className="status-divider">·</span> {project.thinking} mode</div><button onClick={() => setShowActivity(!showActivity)}>Activity {showActivity ? "▾" : "▴"}</button></footer>
      </section>
    </main>
  );
}

function isConversationOnly(text: string) {
  const value = text.trim().toLowerCase();
  const asksToChange = /\\b(add|make|change|fix|improve|remove|replace|implement|create|update|rewrite|refactor|optimize|increase|decrease|move|redesign|build|generate|give the player|put|delete)\\b/.test(value);
  const startsAsQuestion = /^(what|why|how|can you explain|explain|tell me|suggest|should we|should i|could we|is it|does it|will it|which|would it|what if|give me ideas)\\b/.test(value);
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