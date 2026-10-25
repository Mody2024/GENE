"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentResponse, BuildVersion, BuildRun, FileChange, GeneProject, Mode, ProjectKind, ResearchBundle, Thinking } from "./lib/types";
import { checkpointBuild, createBuildRun, recoverFromCheckpoint, resumeBuild, setTaskStatus } from "./lib/build-orchestrator";
import JSZip from "jszip";
import ObjViewport from "./components/ObjViewport";
import SceneStudio from "./components/SceneStudio";
import AudioStudio from "./components/AudioStudio";
import ArtStudio from "./components/ArtStudio";
import DesignDocPanel from "./components/DesignDocPanel";
import InterviewCard from "./components/InterviewCard";
import ResearchCard from "./components/ResearchCard";
import ProjectGallery from "./components/ProjectGallery";
import { createProjectCoverSvg } from "./lib/project-cover.mjs";
import LiveRunPanel, { type LiveRun } from "./components/LiveRunPanel";
import { describeChanges, summarizeChanges } from "./lib/diff-stats.mjs";
import { backoffMs, classifyFailure, repairTargetsFor, retryGuidance } from "./lib/error-recovery.mjs";
import { buildDesignDoc } from "./lib/design-doc";
import { playableDemoFiles } from "./lib/starter-game";
import { buildRuntimeAssetBootstrap } from "./lib/runtime-assets";
import { buildRuntimeSceneBootstrap } from "./lib/runtime-scene";
import { buildRuntimeAudioBootstrap } from "./lib/runtime-audio";
import { mergeConcurrentSourceChanges } from "./lib/project-memory";
import { buildProjectStorageCandidates } from "./lib/project-storage";
import { readDurableProjectSnapshot, writeDurableProjectSnapshot } from "./lib/project-persistence";
import { analyzeProjectScripts } from "./lib/code-safety.mjs";
import { inspectProjectFilePaths } from "./lib/project-file-safety.mjs";
import { orderRuntimeModulePaths } from "./lib/runtime-module-order.mjs";
import { createToolApproval } from "./lib/tool-permissions.mjs";

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

type ToolApprovalEntry = { tool: "forge3d" | "forge2d"; approval: ReturnType<typeof createToolApproval> };
function approvalPrompt(tool: string, input: any): string {
  const label = tool === "research" ? "Research" : tool === "researchAssetImport" ? "Research image import" : tool === "agentResearch" ? "AI web research" : tool === "forge3d" ? "3D Forge generation" : "2D Forge generation";
  const detail = (tool === "researchAssetImport"
    ? [input?.title, input?.sourceUrl, input?.sourcePage, "License: " + String(input?.license || "not stated")].filter(Boolean).join(" · ")
    : String(input?.query || input?.prompt || input?.message || input?.project?.initialPrompt || "project request")).trim().slice(0, tool === "researchAssetImport" ? 560 : 240);
  return "Allow this tool call?\n\nTool: " + label + "\nPurpose / exact request: " + detail +
    "\n\nThis approval applies only to these inputs and this call. Gene will not run it if you choose Cancel.";
}
function buildNestedToolApprovals(body: any): { entries: ToolApprovalEntry[]; summary: string[] } {
  const entries: ToolApprovalEntry[] = [], summary: string[] = [];
  const prompt = String(body.message || body.project?.initialPrompt || "");
  const kind = body.project?.kind === "app" ? "app" : "game";
  const operation = body.operation;
  if (!["build", "surprise"].includes(operation) || kind !== "game") return { entries, summary };
  const wants3D = body.project?.projectIntent === "game-3d" || body.project?.preferredEngine === "webgl3d" ||
    body.project?.plan?.engine === "webgl3d" || /\b(3d|three[- ]dimensional|webgl|third[- ]person|first[- ]person)\b/i.test(prompt);
  const quality = body.thinking === "fast" ? "performance" : body.thinking === "deep" ? "high" : "standard";
  if (wants3D) {
    const lower = prompt.toLowerCase();
    const requested: Array<{ kind: string; prompt: string }> = [
      { kind: "character", prompt: "Create the main playable character for this game. " + prompt },
      { kind: "environment", prompt: "Create a recognizable environment landmark and ground-contact forms for this game world. " + prompt }
    ];
    if (/\b(vehicle|truck|car|van|driving|racing|bus)\b/i.test(lower)) requested.push({ kind: "vehicle", prompt: "Create the main vehicle for this game. " + prompt });
    if (/\b(furniture|chair|table|sofa|bed|cabinet|crate|prop)\b/i.test(lower) && requested.length < 3) requested.push({ kind: "prop", prompt: "Create the most important gameplay prop for this game. " + prompt });
    const projectStyle = String(body.project?.plan?.summary || body.project?.initialPrompt || "").slice(0, 1200);
    for (const item of requested.slice(0, 3)) {
      const input = { prompt: item.prompt.slice(0, 3900), kind: item.kind, quality, projectStyle, nativeOnly: true };
      entries.push({ tool: "forge3d", approval: createToolApproval("forge3d", input) });
      summary.push("3D Forge: " + item.kind + " — " + input.prompt.slice(0, 110));
    }
  } else {
    const explicit2D = body.project?.preferredEngine === "canvas2d" || body.project?.plan?.engine === "canvas2d";
    const noEngine = !body.project?.preferredEngine && !body.project?.plan?.engine;
    if (explicit2D || (noEngine && !/\b(3d|three[- ]dimensional|webgl|third[- ]person|first[- ]person)\b/i.test(prompt))) {
      const lower = prompt.toLowerCase();
      const requested = [
        { kind: "character", prompt: "Create the main recognizable 2D playable character sprite for this game. " + prompt },
        { kind: /city|street|platform|tile|level|maze|map|world|forest|dungeon|terrain/i.test(lower) ? "tileset" : "background",
          prompt: "Create a matching 2D " + (/city|street|platform|tile|level|maze|map|world|forest|dungeon|terrain/i.test(lower) ? "game tileset" : "game background") + " for this game. " + prompt }
      ];
      for (const item of requested) {
        const input = { prompt: item.prompt.slice(0, 300), kind: item.kind, quality, style: "project-matched stylized game art" };
        entries.push({ tool: "forge2d", approval: createToolApproval("forge2d", input) });
        summary.push("2D Forge: " + item.kind + " — " + input.prompt.slice(0, 110));
      }
    }
  }
  return { entries, summary };
}
async function fetchWithToolApproval(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = String(input);
  let payload: any = null;
  if (typeof init?.body === "string") { try { payload = JSON.parse(init.body); } catch { payload = null; } }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return fetch(input, init);
  let tool: string | null = null;
  if (/\/api\/research\/import(?:\?|$)/.test(url)) tool = "researchAssetImport";
  else if (/\/api\/research(?:\?|$)/.test(url)) tool = "research";
  else if (/\/api\/forge\/2d(?:\?|$)/.test(url)) tool = "forge2d";
  else if (/\/api\/forge(?:\?|$)/.test(url)) tool = "forge3d";
  if (tool) {
    if (typeof window !== "undefined" && !window.confirm(approvalPrompt(tool, payload))) throw new DOMException("Tool call canceled by the user.", "AbortError");
    payload.toolApproval = createToolApproval(tool, payload);
    return fetch(input, { ...init, body: JSON.stringify(payload) });
  }
  if (/\/api\/agent(?:\?|$)/.test(url)) {
    if (payload.operation === "research") {
      if (typeof window !== "undefined" && !window.confirm(approvalPrompt("agentResearch", payload))) throw new DOMException("AI research canceled by the user.", "AbortError");
      payload.toolApproval = createToolApproval("agentResearch", payload);
    }
    const batch = buildNestedToolApprovals(payload);
    if (batch.entries.length) {
      const message = "GENE wants to run the following specialist tool calls as one explicit batch:\n\n" + batch.summary.map((item, index) => (index + 1) + ". " + item).join("\n") +
        "\n\nApprove this exact batch? Each listed call will receive its own call-scoped approval. Cancel skips all Forge calls; the AI build may continue without those generated assets.";
      if (typeof window !== "undefined" && window.confirm(message)) payload.toolApprovals = batch.entries;
      else payload.toolApprovals = [];
    }
    return fetch(input, { ...init, body: JSON.stringify(payload) });
  }
  return fetch(input, init);
}

function uid() {
  return "p-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
}
type ProjectFileTreeNode = { name: string; path: string; kind: "folder" | "file"; children: ProjectFileTreeNode[] };

function buildProjectFileTree(paths: string[]): ProjectFileTreeNode[] {
  const root: ProjectFileTreeNode[] = [];
  for (const path of [...paths].sort((a, b) => a.localeCompare(b))) {
    const parts = path.split("/");
    let level = root;
    let currentPath = "";
    parts.forEach((name, index) => {
      currentPath = currentPath ? currentPath + "/" + name : name;
      const kind = index === parts.length - 1 ? "file" : "folder";
      let node = level.find(item => item.name === name && item.kind === kind);
      if (!node) {
        node = { name, path: currentPath, kind, children: [] };
        level.push(node);
      }
      level = node.children;
    });
  }
  const sortTree = (nodes: ProjectFileTreeNode[]) => {
    nodes.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "folder" ? -1 : 1));
    nodes.forEach(node => sortTree(node.children));
  };
  sortTree(root);
  return root;
}

function ProjectFileTree({ nodes, activeFile, onSelect, depth = 0 }: {
  nodes: ProjectFileTreeNode[];
  activeFile: string;
  onSelect: (path: string) => void;
  depth?: number;
}) {
  return <div className="project-file-tree-list">
    {nodes.map(node => node.kind === "folder"
      ? <details className="project-file-tree-folder" key={node.path} open>
          <summary className="project-file-tree-folder-label" style={{ paddingLeft: depth * 10 + 8 }}><span aria-hidden="true">⌄</span>{node.name}</summary>
          <ProjectFileTree nodes={node.children} activeFile={activeFile} onSelect={onSelect} depth={depth + 1} />
        </details>
      : <button type="button" key={node.path} className={"project-file-tree-file" + (activeFile === node.path ? " active" : "")}
          style={{ paddingLeft: depth * 10 + 22 }} onClick={() => onSelect(node.path)} title={node.path}>
          <span aria-hidden="true">▤</span>{node.name}
        </button>)}
  </div>;
}

function GeneMark({ className = "" }: { className?: string }) {
  return <svg className={"gene-logo-svg " + className} viewBox="0 0 48 48" role="img" aria-label="GENE genie lamp and wish spark mark">
    <path className="gene-logo-orbit" d="M8 13C13 5.8 23 3.8 30.2 7.8" fill="none" stroke="#cda75e" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M24 22.5c-5.8-2.8-6.8-7.7-3.3-11.1 2.9-2.8 8.2-1.8 9.3 1.8.6 2-.4 3.7-2 4.7" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
    <path d="M15 26.2 7.4 23.8l5.8 6.1M14 26.5c.4 6.1 5.1 10 11.2 10 6.2 0 10.5-3.8 10.8-9.4l-6.2-2.7-2.5 2.1H19.8l-4.8-1.9Z" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M18 39.2h14.2M34.8 27.2c3.8-.2 5.7 2.3 4.7 5.1-.7 1.9-2.5 2.7-4.1 2.1" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    <path className="gene-logo-spark" d="m37.2 7.2 1.5 3.7 3.7 1.5-3.7 1.5-1.5 3.7-1.5-3.7-3.7-1.5 3.7-1.5z" fill="#cda75e" />
    <circle cx="9" cy="9" r="1.5" fill="#cda75e" />
  </svg>;
}
function now() { return new Date().toISOString(); }
function explainAgentError(error: unknown, code?: unknown): string {
  const rawMessage = (error instanceof Error ? error.message : String(error || "Unknown error")).replace(/\b(?:sk-[A-Za-z0-9_-]{8,}|AIza[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, "[redacted]").replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]").slice(0, 1800);
  const raw = (rawMessage + " " + String(code || "")).trim();
  if (/OPENROUTER_CREDITS_OR_PAID_ROUTE|insufficient credits|not enough credits|payment required|paid route/i.test(raw)) return "GENE only uses free AI models, and none of its free backups was available for this request. No project changes were applied. GENE re-discovers free models automatically, so just retry in a minute or add another free Gemini key.";
  if (/OPENROUTER_KEY_REJECTED|GEMINI_KEY_REJECTED|invalid api key|unauthorized|\b401\b|\b403\b/i.test(raw)) return "An AI provider rejected its API key or account access. Check the relevant secret in your deployment settings, then redeploy. Your existing project files were preserved.";
  if (/OPENROUTER_RATE_LIMITED|rate.?limit|resource_exhausted|quota exceeded|\b429\b/i.test(raw)) return "An AI provider quota or rate limit was reached. This does not necessarily mean the model is paid. Wait for capacity to return or configure another available model/key. Your existing project files were preserved.";
  if (/OPENROUTER_FALLBACK_FAILED/i.test(raw)) {
    // The server message already names the free models it tried and the provider detail; show it with keys redacted.
    return rawMessage.replace(/\b(?:sk-[A-Za-z0-9_-]{8,}|AIza[A-Za-z0-9_-]{20,})\b/g, "[redacted]").slice(0, 700);
  }
  if (/GEMINI_CAPACITY_BUSY|overloaded|high demand|temporarily unavailable/i.test(raw)) return "The AI service is temporarily busy. GENE tried its configured fallback path but did not get a successful response. Retry shortly; your existing project files were preserved.";
  if (/timeout|timed out|aborted|ETIMEDOUT|GEMINI_TIMEOUT/i.test(raw)) return "The AI request timed out before it finished. Completed checkpoints and existing project files were preserved; retry with a smaller task.";
  if (/failed to fetch|networkerror|network request failed|offline/i.test(raw)) return "GENE could not reach its server. Check your connection and deployment status, then retry. Your last saved project version was preserved.";
  if (/GENE_VALIDATION_FAILED|422|stale or missing|unsafe project path|Build rejected/i.test(raw)) return "GENE rejected the generated change during validation to protect your project. Try a smaller, more specific change. Details: " + raw.slice(0, 500);
  if (/GEMINI_OUTPUT_TRUNCATED|GEMINI_OUTPUT_INVALID|output limit|malformed JSON/i.test(raw)) return "The AI response was incomplete or could not be validated. GENE preserved the current project and can retry this stage with a smaller implementation.";
  return raw.slice(0, 900) || "GENE encountered an unexpected error. Your last saved project version was preserved; inspect the activity log and retry.";
}
function message(role: "user" | "assistant" | "system", content: string, kind?: "question" | "plan" | "build" | "error", retry?: { prompt: string; operation: string }, extras?: { research?: ResearchBundle; changes?: FileChange[] }) {
  return { id: uid(), role, content, createdAt: now(), kind, ...(retry ? { retry } : {}), ...(extras?.research ? { research: extras.research } : {}), ...(extras?.changes?.length ? { changes: extras.changes } : {}) };
}
function newProject(kind: ProjectKind = "game", preferredEngine?: GeneProject["preferredEngine"], projectIntent?: GeneProject["projectIntent"]): GeneProject {
  const targetIntent = projectIntent || (kind === "app" ? "webapp" : preferredEngine === "webgl3d" ? "game-3d" : preferredEngine === "canvas2d" ? "game-2d" : "auto");
  return {
    id: uid(),
    name: "New project",
    kind,
    preferredEngine,
    projectIntent: targetIntent,
    initialPrompt: "",
    mode: "plan",
    thinking: "balanced",
    messages: [message("assistant", targetIntent === "game-2d" ? "Your 2D game workspace is ready. GENE will keep the Canvas 2D target through planning and generation." : targetIntent === "game-3d" ? "Your 3D game workspace is ready. GENE will keep the WebGL 3D target through planning and generation." : targetIntent === "website" ? "Your website workspace is ready. GENE will prioritize content hierarchy, responsive pages, navigation and accessible interactions." : targetIntent === "webapp" ? "Your web app workspace is ready. GENE will prioritize user workflows, application states and working interactions." : "Hey, I'm GENE. Choose a target or describe what you want to create. I'll help plan it, build the actual project files and refine them in the workspace.")],
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
function inferProjectKind(prompt: string, fallback: ProjectKind): ProjectKind {
  const value = prompt.toLowerCase();
  const appIntent = /\b(website|web site|web app|webapp|dashboard|landing page|portfolio site|e-commerce|ecommerce|storefront|admin panel|saas|browser app|mobile app|task manager|calculator app|chat app|productivity app|website builder|tool|platform)\b/.test(value);
  const gameIntent = /\b(game|gameplay|platformer|runner|rpg|fps|shooter|survival|metroidvania|racing|puzzle game|multiplayer|boss fight|level|enemy ai|character controller|2d game|3d game|simulator)\b/.test(value);
  if (appIntent && !gameIntent) return "app";
  if (gameIntent && !appIntent) return "game";
  return fallback;
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

/** Ordered exported paths of every project script except the main one, so extra modules load in exports too. */
function moduleScriptPaths(files: Record<string, string>, kind: ProjectKind): string[] {
  return orderRuntimeModulePaths(files).map(path => exportProjectPath(path, kind));
}
function standaloneDocument(source: string, title: string, cssName: string, jsName: string, runtimeBootstrap = "", modulePaths: string[] = []) {
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
    '</head>\n<body>\n' + body + '\n' + runtimeBootstrap + '\n' + modulePaths.map(path => '<script src="' + path.replace(/"/g, "&quot;") + '" defer></script>').join("\n") + '\n<script src="' + jsName + '" defer></script>\n<script src="pwa-register.js" defer></script>\n</body>\n</html>';
}


type BuildCheckStatus = "pass" | "warn" | "fail";
type BuildCheck = { label: string; status: BuildCheckStatus; detail: string };
type BuildReport = { checkedAt: string; projectUpdatedAt: string; checkedDirty: boolean; checkedFile: string; checkedEditorContent: string; checks: BuildCheck[] };

export default function Home() {
  const [project, setProject] = useState<GeneProject | null>(null);
  const [projects, setProjects] = useState<GeneProject[]>([]);
  const [draft, setDraft] = useState("");
  const [interactionMode, setInteractionMode] = useState<"chat" | "plan" | "build">("chat");
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
  const activeRunControllers = useRef(new Set<AbortController>());
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
  const [freeModels, setFreeModels] = useState<string[]>([]);
  const researchedProjects = useRef<Set<string>>(new Set());
  const [section, setSection] = useState<"chat" | "projects" | "files" | "tasks" | "assets" | "scene" | "audio" | "versions">("chat");
  const [fileSearch, setFileSearch] = useState("");
  const [previewOpen, setPreviewOpen] = useState(true);
  const [previewKey, setPreviewKey] = useState(0);
  const [expandedPreview, setExpandedPreview] = useState(false);
  const [editedFile, setEditedFile] = useState("");
  const [fileDirty, setFileDirty] = useState(false);
  const [notice, setNotice] = useState("");
  const [persistenceWarning, setPersistenceWarning] = useState("");
  const [persistenceReady, setPersistenceReady] = useState(false);
  const [runtimeState, setRuntimeState] = useState<"idle" | "loaded" | "rendered" | "error">("idle");
  const [buildReport, setBuildReport] = useState<BuildReport | null>(null);
  const [showActivity, setShowActivity] = useState(false);
  const [searchMode, setSearchMode] = useState(false);
  const [liveRun, setLiveRun] = useState<LiveRun | null>(null);
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
  const [forgeMode, setForgeMode] = useState<"3d" | "2d">("3d");
  const [forge2DKind, setForge2DKind] = useState<"character" | "tileset" | "ui" | "background" | "icon">("character");
  const [forgeBusy, setForgeBusy] = useState(false);
  const [forgeTargetId, setForgeTargetId] = useState<string | null>(null);
  const [forgeNotice, setForgeNotice] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [themeReady, setThemeReady] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const chatEnd = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const referenceInputRef = useRef<HTMLInputElement>(null);
  const projectImportRef = useRef<HTMLInputElement>(null);
  const autoRepairAttempts = useRef(0);
  const runtimeRefreshAttempts = useRef(0);
  const lastRuntimeError = useRef("");

  useEffect(() => {
    let cancelled = false;
    const hydrate = async () => {
      let list: GeneProject[] = [];
      let activeId = "";
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const stored: GeneProject[] = raw ? JSON.parse(raw) : [];
        list = stored.slice(0, 8).map(item => ({ ...item, kind: item.kind === "app" || item.plan?.engine === "webapp" ? "app" : "game", references: item.references || [], versions: (item.versions || []).slice(0, 8) }));
        activeId = localStorage.getItem(ACTIVE_KEY) || "";
      } catch {
        list = [];
      }

      // Restore the durable IndexedDB snapshot when localStorage is empty or unreadable.
      if (!list.length) {
        try {
          const snapshot = await readDurableProjectSnapshot();
          if (snapshot?.projects.length) {
            list = snapshot.projects.slice(0, 8).map(item => ({ ...item, kind: item.kind === "app" || item.plan?.engine === "webapp" ? "app" : "game", references: item.references || [], versions: (item.versions || []).slice(0, 8) }));
            activeId = snapshot.activeProjectId;
          }
        } catch {
          // Continue with the localStorage compatibility path when IndexedDB is unavailable.
        }
      }
      if (cancelled) return;
      const active = list.find(p => p.id === activeId) || list[0] || newProject();
      setProjects(list.length ? list : [active]);
      setProject(active);
      try {
        const savedTheme = localStorage.getItem("gene.theme");
        if (savedTheme === "light" || savedTheme === "dark") setTheme(savedTheme);
      } catch {}
      setPersistenceReady(true);
      setThemeReady(true);
      fetch("/api/health").then(r => r.json()).then(d => {
        if (cancelled) return;
        setApiReady(Boolean(d.aiConfigured));
        setPublishConfigured(Boolean(d.publishConfigured));
        setBinaryBuildConfigured(Boolean(d.binaryBuildConfigured));
        if (d.model) setAiModel(d.model);
        if (Array.isArray(d.freeModels?.openrouter)) setFreeModels(d.freeModels.openrouter.slice(0, 4));
      }).catch(() => { if (!cancelled) setApiReady(false); });
    };
    void hydrate();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!project || !persistenceReady) return;
    const merged = [project, ...projects.filter(p => p.id !== project.id)].slice(0, 8);
    setProjects(prev => [project, ...prev.filter(p => p.id !== project.id)].slice(0, 8));

    let savedStrategy: string | null = null;
    try {
      for (const candidate of buildProjectStorageCandidates(merged)) {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(candidate.projects));
          localStorage.setItem(ACTIVE_KEY, project.id);
          savedStrategy = candidate.strategy;
          break;
        } catch {
          // Quota errors are expected during fallback attempts; try a smaller snapshot.
        }
      }
    } catch {
      savedStrategy = null;
    }

    // Prefer the full IndexedDB snapshot when localStorage is unavailable or over quota.
    const warningForStrategy = (strategy: string | null) => {
      if (strategy === "full") return "";
      if (strategy === "trim-history") return "Browser storage was nearly full. GENE saved your current source but trimmed older chat, versions, and checkpoints. Export a project ZIP as an extra backup.";
      if (strategy === "active-project") return "Browser storage was full. GENE kept the active project and its current source, but trimmed older projects and history. Export a project ZIP to back it up.";
      if (strategy === "active-project-minimal") return "Browser storage is critically low. GENE kept the active source but removed saved versions and checkpoint history. Export the project ZIP now to create a separate backup.";
      return "GENE could not save this change to browser storage. It may be lost if you refresh or close this tab. Export the project ZIP now and free browser storage before continuing.";
    };
    void writeDurableProjectSnapshot(merged, project.id).then(() => {
      setPersistenceWarning(savedStrategy === null ? "" : warningForStrategy(savedStrategy));
    }).catch(() => {
      setPersistenceWarning(warningForStrategy(savedStrategy));
    });

  }, [project]);

  useEffect(() => {
    if (!project) return;
    const nextContent = project.files[project.activeFile] || "";
    if (!fileDirty) setEditedFile(nextContent);
  }, [project?.id, project?.activeFile, project?.files, fileDirty]);

  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [project?.messages.length, busy]);

  useEffect(() => {
    // Do not overwrite a saved theme with the SSR-safe default before hydration
    // has read the user's preference from localStorage.
    if (!themeReady) return;
    localStorage.setItem("gene.theme", theme);
    document.documentElement.dataset.theme = theme;
  }, [theme, themeReady]);

  useEffect(() => {
    const handleWorkspaceKeys = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setShowNewProjectDialog(true);
        return;
      }
      if (event.key === "Escape" && showNewProjectDialog) setShowNewProjectDialog(false);
    };
    window.addEventListener("keydown", handleWorkspaceKeys);
    return () => window.removeEventListener("keydown", handleWorkspaceKeys);
  }, [showNewProjectDialog]);

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
      if (event.data?.type === "gene-runtime" && event.data.state === "gameplay-event") {
        const eventName = String(event.data.event?.name || "unknown").slice(0, 40);
        addActivity("Game-reported gameplay event: " + eventName + " (self-reported telemetry only; not independent gameplay verification).");
        setNotice("Game-reported event: " + eventName + ". This is telemetry from the generated game, not independent proof that the mechanic works.");
        return;
      }
      if (event.data?.type === "gene-runtime" && event.data.state === "input-observed") {
        const inputType = String(event.data.inputType || "user input").slice(0, 40);
        setNotice("The preview received " + inputType + ". This confirms input reached the game frame, not that gameplay responded. Verify movement, interaction, and the core objective.");
        setProject(current => current ? {
          ...current,
          livingPreview: current.livingPreview ? {
            ...current.livingPreview,
            currentObjectives: ["Input reached the preview; confirm the game reacted", "Verify interaction and the core objective", "Check restart or reset behavior where available"],
            updatedAt: now()
          } : current.livingPreview
        } : current);
        return;
      }
      if (event.data?.type === "gene-runtime") {
        const state = event.data.state === "rendered" ? "rendered" : event.data.state === "error" ? "error" : "loaded";
        const diagnostics = event.data.diagnostics;
        const missingVisualEvidence = diagnostics?.playabilityAssessment === "audio-without-visual-evidence" || diagnostics?.playabilityAssessment === "no-visual-render-evidence";
        if (state !== "rendered" && missingVisualEvidence && Number(diagnostics.elapsedMs) >= 1500) {
          const audioOnly = diagnostics.playabilityAssessment === "audio-without-visual-evidence";
          setNotice(audioOnly
            ? "Audio/media is present, but GENE has not observed visible game rendering after startup. This may be an audio-only or blank build; check the renderer, camera, scene and game loop before treating it as playable."
            : "GENE has not observed visible game rendering after startup. The build may be blank or its renderer may have failed; check the scene, camera, drawing loop and runtime errors before treating it as playable.");
        }
        setRuntimeState(current => current === "rendered" && state === "loaded" ? "rendered" : state);
        if (state === "rendered") {
          // A confirmed successful render ends the previous recovery streak.
          // A future independent crash must receive its own repair attempts.
          autoRepairAttempts.current = 0;
          runtimeRefreshAttempts.current = 0;
          setProject(current => current ? {
            ...current,
            buildRun: current.buildRun ? { ...current.buildRun, prototype: current.buildRun.prototype ? { ...current.buildRun.prototype, ready: true } : current.buildRun.prototype, updatedAt: now() } : current.buildRun,
            livingPreview: { status: "rendered", lastKnownGoodVersion: current.versions[0]?.number, updatedAt: now(), runtimeErrors: [], currentObjectives: ["Verify player controls, interaction, and the core gameplay loop"], canContinuePlaying: true },
            versions: current.versions.map((v, index) => index === 0 ? { ...v, testSummary: "Source checks passed; browser runtime reported a visible render surface. Gameplay objectives still require manual verification." } : v)
          } : current);
        }
        if (state === "error") {
          const errorText = String(event.data.message || event.data.stack || "unknown runtime error").slice(0, 1200);
          lastRuntimeError.current = errorText;
          // Browser previews can hit a transient iframe/context race. Retry the
          // actual preview once before invoking the AI repair path; never loop reloads.
          if (runtimeRefreshAttempts.current < 1) {
            runtimeRefreshAttempts.current += 1;
            setNotice("Preview hit a runtime error. GENE is automatically restarting the live preview once…");
            window.setTimeout(() => {
              setPreviewOpen(true);
              setPreviewKey(value => value + 1);
              setRuntimeState("loaded");
            }, 350);
            return;
          }
          setNotice("The live preview reported a runtime error: " + errorText + " — source is preserved; GENE will attempt a targeted repair. Use Refresh preview to retry manually if needed.");
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
    const moduleScripts = orderRuntimeModulePaths(project.files)
      .map(path => [path, project.files[path]] as const)
      .map(([path, source]) => "(function(){\n/* GENE isolated module: " + path + " */\n" + source.replace(/<\/script/gi, "<\\/script") + "\n}).call(window);")
      .join("\n;\n");
    if (project.kind === "app") {
      const html = project.files["game.html"].replace(/<script[\s\S]*?<\/script>/gi, "");
      const css = (project.files["game.css"] || "").replace(/<\/style/gi, "<\\/style");
      const js = (project.files["game.js"] || "").replace(/<\/script/gi, "<\\/script");
      const monitor = [
        "(function(){",
        "function report(){if(window.__geneFrameConfirmed)return;try{var b=document.body;var visible=!!(b&&b.children.length&&(b.innerText.trim().length>0||b.querySelector('button,input,main,section,nav,form,canvas')));if(visible)window.__geneFrameConfirmed=true;parent.postMessage({type:'gene-runtime',state:visible?'rendered':'loaded',renderer:'webapp'},'*');}catch(e){parent.postMessage({type:'gene-runtime',state:'error',renderer:'webapp',message:String(e)},'*');}}",
        "window.addEventListener('error',function(e){parent.postMessage({type:'gene-runtime',state:'error',renderer:'webapp',message:(e.message||'app script error')+(e.filename?' @ '+e.filename.split('/').pop()+':'+e.lineno+':'+e.colno:''),stack:e.error&&e.error.stack?String(e.error.stack).slice(0,900):''},'*');});",
        "window.addEventListener('unhandledrejection',function(e){var r=e.reason;parent.postMessage({type:'gene-runtime',state:'error',renderer:'webapp',message:'Unhandled promise rejection: '+String(r&&r.message||r||'unknown rejection'),stack:r&&r.stack?String(r.stack).slice(0,900):''},'*');});",
        "if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',report);else report();[250,600,1100,1900,3000,4200].forEach(function(ms){setTimeout(report,ms);});",
        "})();"
      ].join("\n");
      return "<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1,maximum-scale=1'><meta http-equiv='Content-Security-Policy' content=\"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' data:; img-src data: blob:; font-src data: blob:; media-src data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'; frame-src 'none'\"><style>html,body{margin:0;min-height:100%;width:100%;font-family:Inter,Arial,sans-serif}*{box-sizing:border-box}" + css + "</style></head><body data-gene-project-kind='app'>" + html + "<script>" + monitor + "<\/script>" + (moduleScripts ? "<script>" + moduleScripts + "<\/script>" : "") + "<script>" + js + "<\/script></body></html>";
    }
    const html = project.files["game.html"].replace(/<script[\s\S]*?<\/script>/gi, "");
    const css = (project.files["game.css"] || "").replace(/<\/style/gi, "<\\/style");
    const js = (project.files["game.js"] || "").replace(/<\/script/gi, "<\\/script");
    const spec = project.files["game-spec.json"] || "{}";
    const engine = (() => { try { return JSON.parse(spec).engine === "webgl3d" ? "webgl3d" : "canvas2d"; } catch { return "canvas2d"; } })();
    const monitor = [
      "(function(){",
      "function report(){if(window.__geneFrameConfirmed)return;try{var c=document.getElementById('game-canvas')||document.querySelector('canvas');if(!c){var b=document.body;var controls=b&&b.querySelector('button,input,select,textarea,[role=button],[role=radio],[role=option],a[href],form,[tabindex]');var visible=!!(b&&b.children.length&&(b.innerText.trim().length>0||controls));if(visible){window.__geneFrameConfirmed=true;parent.postMessage({type:'gene-runtime',state:'rendered',renderer:'dom-text-game',controls:!!controls},'*');}else{parent.postMessage({type:'gene-runtime',state:'loaded',renderer:'dom-text-game'},'*');}return;}var spec={};try{spec=JSON.parse(document.body.getAttribute('data-gene-spec')||'{}')}catch(e){}if(document.body.getAttribute('data-gene-engine')==='webgl3d'){var gl;window.__geneRuntimeMonitorProbe=true;try{gl=c.getContext('webgl2')||c.getContext('webgl')||c.getContext('experimental-webgl');}finally{window.__geneRuntimeMonitorProbe=false;}if(!gl){parent.postMessage({type:'gene-runtime',state:'error',renderer:'webgl',message:'WebGL context unavailable'},'*');return;}requestAnimationFrame(function(){try{var w=gl.drawingBufferWidth||1,h=gl.drawingBufferHeight||1,pixels=new Uint8Array(w*h*4),step=Math.max(4,Math.floor(pixels.length/5000/4)*4),n=0,alpha=0,samples=0,colors=Object.create(null);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,pixels);for(var i=0;i<pixels.length;i+=step){samples++;if(pixels[i+3]>0){alpha++;var key=pixels[i]+','+pixels[i+1]+','+pixels[i+2];if(!colors[key]){colors[key]=1;n++;}}}var diag=window.GENE_DIAGNOSTICS&&window.GENE_DIAGNOSTICS.snapshot?window.GENE_DIAGNOSTICS.snapshot():null;var geometryDraws=diag&&Number(diag.webglDrawCalls)||0;if(geometryDraws>0&&((n>1&&alpha>12)||(alpha>12&&alpha<samples*0.9)))window.__geneFrameConfirmed=true;parent.postMessage({type:'gene-runtime',state:window.__geneFrameConfirmed?'rendered':'loaded',visiblePixels:n,opaquePixels:alpha,geometryDrawCalls:geometryDraws,renderer:'webgl',diagnostics:diag},'*');}catch(e){parent.postMessage({type:'gene-runtime',state:'error',renderer:'webgl',message:String(e)},'*');}});return;}var ctx;window.__geneRuntimeMonitorProbe=true;try{ctx=c.getContext('2d');}finally{window.__geneRuntimeMonitorProbe=false;}if(!ctx){parent.postMessage({type:'gene-runtime',state:'error',renderer:'canvas2d',message:'Canvas 2D context unavailable'},'*');return;}var w=c.width||1,h=c.height||1,d=ctx.getImageData(0,0,w,h).data,n=0,alpha=0,samples=0,step=Math.max(4,Math.floor(d.length/5000/4)*4),colors=Object.create(null);for(var i=0;i<d.length;i+=step){samples++;if(d[i+3]>0){alpha++;var key=d[i]+','+d[i+1]+','+d[i+2];if(!colors[key]){colors[key]=1;n++;}}}var diag=window.GENE_DIAGNOSTICS&&window.GENE_DIAGNOSTICS.snapshot?window.GENE_DIAGNOSTICS.snapshot():null;var drawOps=diag&&Number(diag.canvasEntityOps)||0;if(drawOps>0&&((n>1&&alpha>12)||(alpha>12&&alpha<samples*0.9)))window.__geneFrameConfirmed=true;parent.postMessage({type:'gene-runtime',state:window.__geneFrameConfirmed?'rendered':'loaded',visiblePixels:n,opaquePixels:alpha,canvasDrawOps:drawOps,renderer:'canvas2d',diagnostics:diag},'*');}catch(e){parent.postMessage({type:'gene-runtime',state:'error',message:String(e)},'*');}}",
      "window.addEventListener('error',function(e){parent.postMessage({type:'gene-runtime',state:'error',message:(e.message||'script error')+(e.filename?' @ '+e.filename.split('/').pop()+':'+e.lineno+':'+e.colno:''),stack:e.error&&e.error.stack?String(e.error.stack).slice(0,900):''},'*');});",
      "window.addEventListener('unhandledrejection',function(e){var r=e.reason;parent.postMessage({type:'gene-runtime',state:'error',message:'Unhandled promise rejection: '+String(r&&r.message||r||'unknown rejection'),stack:r&&r.stack?String(r.stack).slice(0,900):''},'*');});",
      "window.addEventListener('message',function(e){if(e.data&&e.data.type==='gene-custom-edit-mode'){window.__geneCustomEdit=!!e.data.enabled;document.documentElement.style.cursor=window.__geneCustomEdit?'crosshair':'';}});",
      "document.addEventListener('click',function(e){if(!window.__geneCustomEdit)return;var el=e.target;if(!el||el===document.body||el===document.documentElement)return;e.preventDefault();e.stopPropagation();parent.postMessage({type:'gene-custom-selection',tag:el.tagName||'element',id:el.id||'',classes:typeof el.className==='string'?el.className:'',text:(el.innerText||el.getAttribute&&el.getAttribute('aria-label')||'').slice(0,90)},'*');},true);",
      "[250,650,1200,2000,3200,4300].forEach(function(ms){setTimeout(report,ms);});",
      "})();"
    ].join("\n");
    const instrumentation = "(function(){var AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;var all=[];function Wrapped(a){var c=new AC(a);all.push(c);return c;}Wrapped.prototype=AC.prototype;try{window.AudioContext=Wrapped;window.webkitAudioContext=Wrapped;}catch(e){}function unlock(){all.forEach(function(c){if(c.state==='suspended'){try{c.resume();}catch(e){}}});}['pointerdown','touchstart','keydown','click'].forEach(function(t){window.addEventListener(t,unlock,true);});})();(function(){var original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,attributes){if(typeof type==='string'&&/webgl/i.test(type)){attributes=Object.assign({},attributes||{},{preserveDrawingBuffer:true});}return original.call(this,type,attributes);};})();";
    const assetBootstrap = buildRuntimeAssetBootstrap(project.files) + buildRuntimeSceneBootstrap(project.files) + buildRuntimeAudioBootstrap(project.files);
    return "<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no'><meta http-equiv='Content-Security-Policy' content=\"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' data:; img-src data: blob:; font-src data: blob:; media-src data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'; frame-src 'none'\"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#101419;color:#fff;font-family:Inter,Arial,sans-serif}*{box-sizing:border-box}" + css + "</style></head><body data-gene-spec='" + spec.replace(/&/g,"&amp;").replace(/'/g,"&#39;") + "' data-gene-engine='" + engine + "'><script>" + instrumentation + "<\/script>" + assetBootstrap + html + "<script>" + monitor + "<\/script>" + (moduleScripts ? "<script>" + moduleScripts + "<\/script>" : "") + "<script>" + js + "<\/script></body></html>";
  }, [project?.files, project?.id, previewKey]);

  const designDoc = useMemo(() => {
    if (!project) return null;
    const hasDecisions = Boolean(project.plan) || Object.keys(project.answers || {}).length > 0;
    return hasDecisions ? buildDesignDoc(project) : null;
    // The document is derived data; recompute only when the inputs it reads change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id, project?.answers, project?.plan, project?.name, project?.initialPrompt, project?.kind]);

  /** Merge files into the project with a functional update so batch saves never clobber each other. */
  function addProjectFiles(entries: Record<string, string | null>, label: string, createVersion = true) {
    setProject(prev => {
      if (!prev) return prev;
      const files = { ...prev.files };
      for (const [path, content] of Object.entries(entries)) {
        if (content === null) delete files[path];
        else files[path] = content;
      }
      const version: BuildVersion = {
        number: (prev.versions[0]?.number || 0) + 1,
        label,
        files: { ...files },
        createdAt: now(),
        testSummary: "Asset files saved. Integration into gameplay still needs verification in the preview."
      };
      return { ...prev, files, versions: createVersion ? [version, ...prev.versions].slice(0, 8) : prev.versions, updatedAt: now() };
    });
    setPreviewKey(n => n + 1);
  }

  function addResearchNote(topic: string, notes: string) {
    setProject(prev => {
      if (!prev) return prev;
      const name = "research-notes.md";
      const reference = { id: uid(), name, mimeType: "text/markdown", kind: "text" as const, textContent: notes.slice(0, 20_000), size: notes.length };
      const others = (prev.references || []).filter(item => item.name !== name);
      return { ...prev, references: [...others, reference], updatedAt: now() };
    });
    addActivity("Saved research notes for “" + topic.slice(0, 60) + "” as a builder reference.");
  }

  // Research now runs visibly per request inside runAgent and is attached to the message that used it.


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

  const saved2DAssets = useMemo(() => {
    if (!project) return [];
    return Object.entries(project.files)
      .filter(([path]) => /^assets\/[a-zA-Z0-9_-]+\/asset-2d\.json$/.test(path))
      .map(([path, source]) => {
        const id = path.split("/")[1];
        let manifest: any = {};
        try { manifest = JSON.parse(source); } catch {}
        return { id, name: String(manifest.name || id), kind: String(manifest.kind || "character"), svgPath: "assets/" + id + "/sprite.svg", manifestPath: path, width: Number(manifest.width || 0), height: Number(manifest.height || 0), frames: Number(manifest.frames || 1) };
      });
  }, [project?.files, project?.id]);

  const savedResearchImages = useMemo(() => {
    if (!project) return [];
    return Object.entries(project.files)
      .filter(([path]) => /^assets\/[a-zA-Z0-9_-]+\/asset\.json$/.test(path))
      .map(([manifestPath, source]) => {
        let manifest: any = {};
        try { manifest = JSON.parse(source); } catch {}
        if (manifest.kind !== "reference-image") return null;
        const imagePath = Object.keys(manifest.contentIntegrity?.files || {}).find(path => /\/reference\.(?:png|jpe?g|webp)$/i.test(path)) || "";
        return { id: String(manifest.assetId || manifestPath.split("/")[1]), name: String(manifest.name || "Research reference"), manifestPath, imagePath, license: String(manifest.provenance?.license || "License not recorded"), attribution: String(manifest.provenance?.attribution || ""), sourcePage: String(manifest.provenance?.sourcePage || "") };
      })
      .filter((asset): asset is NonNullable<typeof asset> => Boolean(asset?.imagePath && project.files[asset.imagePath]));
  }, [project?.files, project?.id]);

  const addActivity = (entry: string) => {
    const safeEntry = entry
      .replace(/\b(?:sk-[A-Za-z0-9_-]{8,}|AIza[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, "[redacted]")
      .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
      .slice(0, 900);
    const level = /failed|error|reject|timeout|unavailable|blocked/i.test(safeEntry) ? "ERROR" : /retry|recover|attempt|repair/i.test(safeEntry) ? "RETRY" : /passed|completed|saved|published|verified/i.test(safeEntry) ? "OK" : "WORK";
    setActivity(prev => [new Date().toLocaleTimeString() + "  " + level + " · " + safeEntry, ...prev].slice(0, 100));
  };

  const stopActiveRun = useCallback(() => {
    const active = [...activeRunControllers.current];
    if (!active.length && !pendingBuildRequests.current.length) return;
    for (const controller of active) controller.abort();
    activeRunControllers.current.clear();
    pendingBuildRequests.current = [];
    setQueuedRequestCount(0);
    setBusy(false);
    setParallelChatInProgress(false);
    setBuildInProgress(false);
    setCanQueueBuildRequests(false);
    setNotice("Stopped. No new AI stages will be scheduled. The last saved project version is preserved.");
    addActivity("Stopped the active run and cleared queued requests.");
  }, []);

  // A run belongs to the project it started in. Switching/creating a project must cancel
  // its in-flight requests so a stale generation cannot keep running in the background.
  const lastRunProjectId = useRef(project?.id || "");
  useEffect(() => {
    const nextProjectId = project?.id || "";
    const previousProjectId = lastRunProjectId.current;
    lastRunProjectId.current = nextProjectId;
    if (!previousProjectId || previousProjectId === nextProjectId) return;
    for (const controller of activeRunControllers.current) controller.abort();
    activeRunControllers.current.clear();
    pendingBuildRequests.current = [];
    setQueuedRequestCount(0);
    setBusy(false);
    setParallelChatInProgress(false);
    setBuildInProgress(false);
    setCanQueueBuildRequests(false);
    setNotice("Switched projects. Work from the previous project was cancelled; its last saved version remains available.");
    addActivity("Project changed; aborted previous project requests and cleared its queue.");
  }, [project?.id, addActivity]);
  
  const runAgent = useCallback(async (text: string, operationOverride?: string, silent = false) => {
    if (!project || !text.trim()) return;
    const prompt = text.trim();
    const isReadOnlyConversation = !operationOverride && (interactionMode === "chat" || isConversationOnly(prompt));
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
    const runController = new AbortController();
    activeRunControllers.current.add(runController);
    const runFetch = (input: RequestInfo | URL, init?: RequestInit) => {
      if (runController.signal.aborted) throw new DOMException("Run cancelled", "AbortError");
      return fetchWithToolApproval(input, { ...init, signal: runController.signal });
    };
    const isFirstIdea = !project.initialPrompt;
    const inferredKind = isFirstIdea ? inferProjectKind(prompt, project.kind || "game") : project.kind || "game";
    const answerKey = operationOverride || planIntent === "update" ? undefined : project.question?.id;
    const nextAnswers = answerKey ? { ...project.answers, [answerKey]: prompt } : project.answers;
    let operation = operationOverride || "chat";
    if (!operationOverride) {
      const hasSource = Object.keys(project.files).length > 0;
      const asksForChange = /\b(add|make|change|fix|improve|remove|replace|implement|create|update|rewrite|refactor|optimize|increase|decrease|move|redesign|build|generate|modify|adjust|remap|integrate|repair|polish)\b/i.test(prompt);
      const explicitBuildIntent = /\b(build|implement|generate|code|start building|apply (?:the )?(?:plan|changes)|make the changes|edit the files)\b/i.test(prompt);
      if (searchMode) operation = "research";
      // Workspace mode is authoritative: plan updates must not fall through into build/edit.
      else if (interactionMode === "plan") operation = planIntent === "update" && project.initialPrompt ? "plan" : project.plan ? "plan" : "interview";
      // Chat is conversational by default. Explicit implementation can still mutate source.
      else if (interactionMode === "chat" && !explicitBuildIntent) operation = "chat";
      else if (isConversationOnly(prompt)) operation = "chat";
      else if (hasSource && asksForChange) operation = "edit";
      else if (!hasSource) operation = "build";
      else operation = "edit";
    }
    if (!operationOverride && operation === "build" && !project.plan && !Object.keys(project.files).length && !project.question &&
        !/\b(skip (?:the )?interview|no questions|without (?:an? )?interview|build immediately|just build|use sensible defaults|don't ask|do not ask)\b/i.test(prompt)) {
      operation = "interview";
    }
    // A pending interview is a stateful workflow: every answer must advance
    // the interview rather than falling through to a build/edit operation.
    if (project.question && !operationOverride) operation = "interview";
    if (operation === "research") setSearchMode(false);
    if (operation === "surprise") {
      operation = "surprise";
    }
    let nextProject: GeneProject = {
      ...project,
      // Automatic runtime repair is a source mutation and must never be blocked
      // merely because the user last left the workspace in read-only Plan mode.
      mode: silent && operationOverride === "edit" ? "build" : project.mode,
      kind: inferredKind,
      preferredEngine: inferredKind === "app" ? "webapp" : project.preferredEngine === "webapp" ? undefined : project.preferredEngine,
      name: isFirstIdea && /^(untitled (game|app)|new project)$/i.test(project.name) ? "New project" : project.name,
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
    if (operation !== "build" && operation !== "surprise") {
      setLiveRun({ id: uid(), operation, prompt: silent ? "Repairing a runtime error reported by the live preview" : prompt, startedAt: Date.now(), stage: "context", files: Object.entries(nextProject.files).map(([path, content]) => ({ path, size: String(content).length })) });
    }
    setNotice("");
    if (!parallelReadOnlyRequest) {
      setRuntimeState("idle");
      setActivity([]);
    }
    if (operation === "build" || operation === "surprise") setShowActivity(true);
    addActivity("Request accepted: " + operation);
    setSection("chat");
    try {
      if (runController.signal.aborted) throw new DOMException("Run cancelled", "AbortError");
      const chatNeedsResearch = operation === "chat" && (
        /\b(search|research|look up|find sources|sources for|check online|browse the web|verify online|latest|current|today|this week|recent|up[- ]to[- ]date|documentation|what changed|release date|version of|news about|who is|what is|what are|when is|when did|where is|why does|why is|how does|how do|how much|how many|which is|compare|versus|vs\.?|price|cost|available|supported|compatible)\b/i.test(prompt) ||
        (prompt.trim().length >= 55 && /[?؟]/.test(prompt) && !/\b(write me|make me|create me|tell me a story|roleplay|brainstorm|imagine)\b/i.test(prompt))
      );
      // Research runs automatically for planning/building and chat questions that
      // depend on current or externally verifiable facts. The explicit web-research
      // toggle can still force a search for any prompt.
      const needsResearch = !silent && (
        operation === "research" ||
        (nextProject.visualResearch !== false && (
          chatNeedsResearch ||
          (operation === "interview" && !(nextProject.references || []).some(item => item.name === "research-notes.md")) ||
          ((operation === "build" || operation === "surprise" || operation === "plan") && !(nextProject.references || []).some(item => item.name === "research-notes.md"))
        ))
      );
      if (needsResearch) {
        const researchQuery = operation === "research"
          ? prompt.slice(0, 900)
          : [nextProject.initialPrompt, prompt, nextProject.plan?.title, nextProject.plan?.summary, ...(nextProject.plan?.mechanics || []), nextProject.answers?.genre, nextProject.answers?.fantasy].filter(Boolean).join(" ").slice(0, 900);
        setLiveRun(current => current ? { ...current, stage: "research", research: { topic: researchQuery, status: "running" } } : current);
        addActivity("Researching “" + researchQuery.slice(0, 70) + "” (Wikipedia, Wikimedia Commons, Poly Haven)");
        try {
          const researchResponse = await runFetch("/api/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: researchQuery, kind: nextProject.kind === "app" ? "app" : "game", engine: nextProject.plan?.engine || nextProject.preferredEngine || "auto", images: true }) });
          const researchData = await researchResponse.json().catch(() => null);
          if (researchResponse.ok && researchData?.ok && researchData.bundle && typeof researchData.notes === "string" && researchData.notes.trim()) {
            const imageData: Array<{ id?: string; name: string; mimeType: string; dataBase64: string; byteSize?: number; sha256?: string }> = Array.isArray(researchData.imageData) ? researchData.imageData : [];
            const note = { id: uid(), name: "research-notes.md", mimeType: "text/markdown", kind: "text" as const, textContent: String(researchData.notes).slice(0, 20000), size: String(researchData.notes).length };
            const kept = (nextProject.references || []).filter(item => item.name !== note.name && !/^research-image-/.test(item.name));
            // The model accepts at most 4 reference images; the user's own attachments always win.
            const freeSlots = Math.max(0, 4 - kept.filter(item => item.kind === "image").length);
            const imageRefs = imageData.slice(0, freeSlots).map((image, index) => { const sourceImage = (researchData.bundle.images || []).find((candidate: any) => candidate.id === image.id) || {}; return { id: uid(), sourceId: String(image.id || ""), name: "research-image-" + (index + 1) + "-" + String(image.name || "reference").replace(/[^A-Za-z0-9]+/g, "-").slice(0, 40) + (image.mimeType === "image/png" ? ".png" : image.mimeType === "image/webp" ? ".webp" : ".jpg"), mimeType: image.mimeType, kind: "image" as const, dataBase64: image.dataBase64, size: Number(image.byteSize || Math.round(image.dataBase64.length * 0.75)), byteSize: Number(image.byteSize || 0), sha256: String(image.sha256 || ""), source: String(sourceImage.source || ""), sourceUrl: String(sourceImage.full || sourceImage.thumb || ""), sourcePage: String(sourceImage.page || ""), license: String(sourceImage.license || ""), attribution: String(sourceImage.credit || "") }; });
            const bundle: ResearchBundle = { ...researchData.bundle, sent: { notes: true, images: imageRefs.length } };
            const references = [...kept, note, ...imageRefs];
            const attach = (messages: GeneProject["messages"]) => { const index = messages.map(item => item.role).lastIndexOf("user"); return index < 0 ? messages : messages.map((item, position) => position === index ? { ...item, research: bundle } : item); };
            nextProject = { ...nextProject, references, messages: attach(nextProject.messages) };
            setProject(current => current && current.id === nextProject.id ? { ...current, references, messages: attach(current.messages), updatedAt: now() } : current);
            researchedProjects.current.add(nextProject.id);
            setLiveRun(current => current ? { ...current, research: { topic: researchQuery, status: "done", images: bundle.images.length, facts: bundle.facts.length } } : current);
            addActivity("Attached research to your message: " + bundle.images.length + " images, " + bundle.facts.length + " facts, " + (bundle.models.length + bundle.engineModels.length) + " models, " + (bundle.music.styles.length + bundle.music.tracks.length) + " music references. Sent to GENE: notes + " + imageRefs.length + " image(s).");
          } else {
            setLiveRun(current => current ? { ...current, research: { topic: researchQuery, status: "failed" } } : current);
            addActivity("Research was unavailable or incomplete; GENE will mark assumptions and continue without inventing sources.");
          }
        } catch {
          if (runController.signal.aborted) throw new DOMException("Run cancelled", "AbortError");
          setLiveRun(current => current ? { ...current, research: { topic: researchQuery, status: "failed" } } : current);
          addActivity("Research request failed; preserving the project and continuing with explicitly labeled assumptions.");
        }
      }
      if (operation === "interview") addActivity("Preparing the next interview decision");
      if (operation === "plan") addActivity("Generating an implementation plan");
      if (operation === "build" || operation === "surprise") addActivity("Requesting " + (nextProject.kind === "app" ? "web app" : "game") + " source files from the model");
      if (operation === "edit") addActivity("Reading current project source and applying a targeted edit");
      let payload: any;
      let responseOk = true;
      const baseRequest = {
        mode: operation === "build" || operation === "edit" || operation === "surprise" || operation === "buildPart" ? "build" : nextProject.mode,
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
        let forge2DStageContext = "";
        // Stage actual Forge artwork into the same staged project before game.js is authored.
        // This is the client coordinator path used by normal builds (which call buildPart, not build).
        const buildEngine = nextProject.plan?.engine || nextProject.preferredEngine || "canvas2d";
        if (!recovery && nextProject.kind !== "app" && buildEngine === "canvas2d") {
          const promptText = String(nextProject.initialPrompt || nextProject.name || "2D game");
          const lowerPrompt = promptText.toLowerCase();
          const requestedAssets = [
            { kind: "character", prompt: "Main playable 2D character sprite for: " + promptText },
            { kind: /city|street|platform|tile|level|maze|map|world|forest|dungeon|terrain/i.test(lowerPrompt) ? "tileset" : "background",
              prompt: "Matching 2D game " + (/city|street|platform|tile|level|maze|map|world|forest|dungeon|terrain/i.test(lowerPrompt) ? "tileset" : "background") + " for: " + promptText }
          ];
          try {
            addActivity("Connecting GENE Forge 2D to the staged game build");
            const forgeResults = await Promise.all(requestedAssets.map(async assetRequest => {
              try {
                const response = await runFetch("/api/forge/2d", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ prompt: assetRequest.prompt.slice(0, 300), kind: assetRequest.kind, quality: nextProject.thinking === "fast" ? "performance" : nextProject.thinking === "deep" ? "high" : "standard", style: "project-matched stylized game art" })
                });
                const data = await response.json().catch(() => null);
                if (!response.ok || !data?.ok || typeof data?.asset?.svg !== "string" || !data?.asset?.manifest) return null;
                return { ...assetRequest, asset: data.asset };
              } catch { return null; }
            }));
            for (const item of forgeResults) {
              if (!item) continue;
              const base = "assets/forge2d/" + item.kind;
              stagedFiles[base + ".svg"] = String(item.asset.svg);
              const sourceIntegrity = item.asset.manifest.contentIntegrity;
              const projectIntegrityFiles = sourceIntegrity?.files ? {
                [base + ".svg"]: sourceIntegrity.files["sprite.svg"],
                ...Object.fromEntries(Object.entries(item.asset.frameFiles || {}).map(([frameName]) => [base + "/frames/" + frameName, sourceIntegrity.files["frames/" + frameName]]))
              } : undefined;
              stagedFiles[base + ".json"] = JSON.stringify({ ...item.asset.manifest, kind: item.kind, name: item.asset.name, source: "GENE Native 2D Forge", qualityReport: item.asset.qualityReport, contentIntegrity: sourceIntegrity ? { ...sourceIntegrity, files: projectIntegrityFiles } : undefined }, null, 2);
              for (const [frameName, frameSvg] of Object.entries(item.asset.frameFiles || {})) {
                stagedFiles[base + "/frames/" + frameName] = String(frameSvg);
              }
            }
            const generated = forgeResults.filter(Boolean) as Array<{kind:string;asset:any}>;
            if (generated.length) {
              forge2DStageContext = "\n\nGENE FORGE 2D GENERATED ASSETS (already added to this staged project): " +
                JSON.stringify(generated.map(item => ({ kind: item.kind, name: item.asset.name, svg: "assets/forge2d/" + item.kind + ".svg", manifest: "assets/forge2d/" + item.kind + ".json", width: item.asset.manifest.width, height: item.asset.manifest.height, frames: item.asset.manifest.frames }))) +
                "\nActually load and render these local SVG assets in game.js (canvas Image/drawImage or equivalent), with graceful onerror fallback. Do not put executable code in game.html. Do not claim Forge integration unless the source loads and uses these assets.";
              addActivity("GENE Forge 2D generated and staged " + generated.map(item => item.kind).join(" and ") + "; wiring them into game.js");
            } else {
              addActivity("GENE Forge 2D did not return a validated asset; continuing without claiming generated artwork");
            }
          } catch {
            addActivity("GENE Forge 2D unavailable for this build; preserving the staged build and continuing without generated assets");
          }
        }
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
        // Requeue the final validation stages before resuming. This keeps the
        // resume helper strict (it refuses idle all-passed runs) and avoids
        // invoking it twice against the same stale checkpoint state.
        const recoveryBuildRun = recovery ? {
          ...recovery.run,
          tasks: recovery.run.tasks.map(task =>
            task.id === "final-content-pass" || task.id === "validate-assembled"
              ? { ...task, status: "queued" as const, lastError: undefined }
              : task
          ),
          status: "recovering" as const
        } : null;
        activeBuildRun = recoveryBuildRun
          ? { ...resumeBuild(recoveryBuildRun), status: "running" }
          : createBuildRun({
              projectId: nextProject.id,
              tasks: buildTasks,
              prototypeObjectives: ["Boot and render", "Core controls and gameplay loop", "Reach a meaningful prototype conclusion"],
              fullGameContent: (nextProject.plan?.tasks || []).concat(["Distinct content beyond the playable prototype", "Meaningful progression and challenge variation", "Complete full-game ending"])
            });
        activeBuildRun = { ...activeBuildRun, status: "running" };
        if (recovery) addActivity("Resuming from checkpoint " + (recovery.run.checkpoints[recovery.run.checkpoints.length - 1]?.id || "latest") + "; previously passed file stages will be preserved.");
        setProject({ ...nextProject, buildRun: activeBuildRun, livingPreview: { status: "booting", updatedAt: now(), runtimeErrors: [], currentObjectives: ["Generating a playable project"], canContinuePlaying: false } });
        addActivity("GENE 2.0 build coordinator started with " + buildTasks.length + " dependency-aware tasks; checkpoints are enabled.");
        const persistRun = (run: BuildRun, previewStatus: "booting" | "stale" | "error" = "booting", sourceFiles: Record<string, string> = stagedFiles, passed: string[] = [], failed: string[] = [], reason: "task-complete" | "prototype-ready" | "repair-failed" = "task-complete") => {
          activeBuildRun = checkpointBuild(run, sourceFiles, { passed, failed }, reason, "Resume from this source snapshot and retry only unfinished or failed tasks.");
          setProject(current => current && current.id === nextProject.id ? { ...current, buildRun: activeBuildRun, livingPreview: { status: previewStatus, lastKnownGoodVersion: current.versions[0]?.number, updatedAt: now(), runtimeErrors: failed, currentObjectives: activeBuildRun?.prototype?.completedObjectives || [], canContinuePlaying: false } } : current);
          setLiveRun(current => current ? { ...current, build: { tasks: run.tasks.map(task => ({ id: task.id, title: task.title, status: task.status })), total: run.tasks.length, passed: run.tasks.filter(task => task.status === "passed").length, activeTask: run.tasks.find(task => task.status === "running")?.title } } : current);
        };
        let finalContentPassSucceeded = false;
        let autoSplitGameJs = false;
        const resumedStages = stagePaths.filter((_, stageIndex) => activeBuildRun?.tasks.find(task => task.id === "stage-" + stageIndex)?.status === "passed");
        if (resumedStages.length) addActivity("Checkpoint recovery: kept completed stage" + (resumedStages.length === 1 ? "" : "s") + " unchanged (" + resumedStages.join(", ") + ").");
        for (let index = 0; index < stagePaths.length; index++) {
          const stagePath = stagePaths[index];
          if (activeBuildRun.tasks.find(task => task.id === "stage-" + index)?.status === "passed") continue;
          activeBuildRun = setTaskStatus(activeBuildRun, "stage-" + index, "running");
          setLiveRun(current => current ? { ...current, build: { tasks: activeBuildRun!.tasks.map(task => ({ id: task.id, title: task.title, status: task.status })), total: activeBuildRun!.tasks.length, passed: activeBuildRun!.tasks.filter(task => task.status === "passed").length, activeTask: activeBuildRun!.tasks.find(task => task.status === "running")?.title } } : current);
          setProject(current => current && current.id === nextProject.id ? { ...current, buildRun: activeBuildRun } : current);
          addActivity("Build stage " + (index + 1) + ": generating " + stagePath + " (" + stagePaths.length + " files in the current manifest)");
          let stageSucceeded = false;
          let stageError = "";
          for (let stageAttempt = 1; stageAttempt <= 5 && !stageSucceeded; stageAttempt++) {
            const stageProject: GeneProject = { ...nextProject, files: { ...stagedFiles }, plan: stagedPlan };
            const stageMessage = "Create one complete file for staged build " + (index + 1) + " of " + stagePaths.length + ". Requested file path: " + stagePath + ". " + (stagePath === "game.js" ? forge2DStageContext : "") + " " +
              "Use the original project idea in the project context as the source of truth. " +
              (index === 0
                ? "This is stage 1. Return only game-spec.json and include the complete structured implementation plan in the JSON response. Include additionalFiles as an optional array of safe relative file paths required by this project (do not list the four core files there); use it for genuinely needed data, SVG, model/material, audio, text or module files, not filler. For webgl3d, include up to two useful modelRequests with stable id, kind, prompt and quality fields so GENE can generate real OBJ/MTL meshes through Forge; describe exact game-specific silhouettes and use performance for low-poly requests, high for explicit high-detail requests. Keep the spec concise and valid. Choose a small but polished first playable version; defer secondary features. Also return an architecture blueprint in the spec: architecture.modules must list each planned file with its exact path, responsibility, provided API, required APIs, and dependency order; architecture.dataFlow must explain how player input reaches gameplay state, rendering, and save/progression systems. Choose names and a hierarchy that fit this specific game instead of copying a universal template. Every declared JavaScript module must own a meaningful feature, be connected to game.js, and have a concrete acceptance check. Prefer fewer complete, connected systems over many empty modules."
                : /\.(?:m?js|cjs)$/i.test(stagePath) && stagePath !== "game.js"
                  ? "The approved plan and earlier staged files are in project context. Return only the requested module " + stagePath + ". It must be a browser-compatible classic script (no import/export), initialize window.GeneModules if absent, and expose its real reusable API as window.GeneModules[" + JSON.stringify(stagePath.split("/").pop()?.replace(/\.(?:m?js|cjs)$/i, "")) + "]. The key must match this filename exactly so the final runtime can call it. Keep it self-contained and safe if initialized before game.js. Match the project's actual features; do not add fake placeholder APIs. Implement the responsibility named for this path, expose a small documented API under the filename-derived GeneModules key, and keep private variables scoped inside an IIFE. Do not access another module's private state directly; communicate through its declared API. Include safe initialization and return a meaningful result or explicit error for invalid input."
                  : "The approved plan and earlier staged files are in project context. Return only " + stagePath + " with complete, compact, working source consistent with all previous files and every path in game-spec.json.additionalFiles. For game.js, wire the declared module APIs into actual gameplay rather than leaving them unused. Initialize and validate the shared module registry, call each required API in the planned dependency order, and make missing APIs fail visibly rather than silently skipping mechanics. Keep the main loop, input, state updates, collision/rules, rendering, win/loss flow and reset coherent; keep state ownership explicit between systems. Do not repeat other files or return partial snippets. Preserve the core request; prefer reliable core mechanics over scope.") +
              "GAMEPLAY CONTROLS ARE REQUIRED: implement every control the genre implies, visibly inside the game UI, and wire it to real state changes. For DOM/text/quiz games, use semantic clickable buttons and keyboard-accessible interactions, show selected/correct/incorrect feedback, update score and progress, and make Next/Continue/Restart/Lifeline/Menu controls functional. For a Who Wants to Be a Millionaire-style game, include four clickable answers, question progression, a money ladder, answer feedback, working lifelines only if shown, and restart/game-over behavior. Add visible focus styles, accessible labels, touch-friendly targets and a short control hint. Never render a nonfunctional control; hide features that are not implemented. Validate real interactions in the browser and fix missing handlers before marking complete." +
              (stageAttempt > 1 ? " RETRY " + stageAttempt + "/5: the previous attempt for this file failed: " + stageError.slice(0, 500) + ". " + (stageAttempt === 2 ? "DIAGNOSE FIRST: identify the specific missing contract or syntax issue from the failure, then produce a complete smaller file. Preserve the requested path and exact module API." : "CHANGE APPROACH: do not repeat the failed structure. Simplify the algorithm or split responsibilities into declared modules, preserve the core behavior, and verify every identifier and referenced path.") + " Remove secondary details, not required functionality. Ensure strict valid JSON around the file content and valid syntax inside the file." + (/truncat|MAX_TOKENS|unterminated string|output limit/i.test(stageError) ? " OUTPUT-CUTOFF RECOVERY: the previous response exceeded the output limit; shrink this file by at least 35%, omit optional effects and verbose comments, reduce repeated objects, and close every JSON/code string and brace while preserving core mechanics." : "") : "") + (stageAttempt === 3 ? " ALTERNATE IMPLEMENTATION: replace the failed algorithm with a simpler but complete one; remove optional effects and verify every identifier." : stageAttempt === 4 ? " SECOND ALTERNATE: use a different state layout or control flow from previous attempts, keep only essential mechanics, and ensure all dependencies exist." : stageAttempt === 5 ? " FINAL RECOVERY: return the smallest complete, bootable implementation of this exact file; no optional systems, repeated data, or unconnected modules." : "");
            try {
              const stageResponse = await runFetch("/api/agent", {
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
                addActivity("Stage " + stagePath + " attempt " + stageAttempt + "/5 failed: " + stageError.slice(0, 180));
                if (/API key|account access|OPENROUTER_KEY_REJECTED|GEMINI_KEY_REJECTED|unauthorized|invalid api key/i.test(stageError)) {
                  addActivity("Stopping duplicate attempts because the configured provider credentials were rejected; provider fallback has already run for this request.");
                  break;
                }
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
                    // Every game gets one real, reusable audio runtime unless the user explicitly asks for silence.
                    // The module must be integrated by the staged architecture rather than existing as an unused file.
                    if (!/(?:no sound|without sound|silent game|no audio|mute by default)/.test(scopeText)) {
                      plannedModules.push("src/systems/audio-manager.js");
                    }
                    if (spec.engine === "webgl3d") plannedModules.push("src/systems/camera-controller.js");
                    // A module is justified by a feature, not by a fixed template.
                    if (/touch|mobile|keyboard|wasd|arrow keys|controller|gamepad|input/.test(scopeText)) plannedModules.push("src/systems/input.js");
                    if (/progression|upgrade|unlock|level up|score chase|campaign|wave|difficulty/.test(scopeText)) plannedModules.push("src/systems/progression.js");
                    if (/multiple levels|level design|spawn table|procedural|enemy waves|collectibles|content system/.test(scopeText)) plannedModules.push("src/systems/content.js");
                    if (/story|dialogue|quest|mission|chapter|level|campaign|narrative|cutscene/.test(scopeText)) plannedModules.push("src/systems/narrative.js");
                    if (/combat|enemy|enemies|boss|weapon|shoot|attack|damage|survival/.test(scopeText)) plannedModules.push("src/systems/combat.js");
                    if (/3d|third.person|first.person|open.world|driving|vehicle|world.exploration/.test(scopeText)) plannedModules.push("src/systems/world.js", "src/systems/camera.js");
                    if (/co.op|local.multiplayer|two.player|split.screen|controller|gamepad/.test(scopeText)) plannedModules.push("src/systems/multiplayer.js");
                    if (/puzzle|craft|build|upgrade|skill.tree|resource|economy/.test(scopeText)) plannedModules.push("src/systems/economy.js");
                    // Genre-first architecture: add a coherent set of systems for the actual game,
                    // rather than relying only on broad keyword-triggered generic modules.
                    const genreArchitectures: Array<{ pattern: RegExp; modules: string[] }> = [
                      { pattern: /psychological horror|survival horror|horror mystery|horror game|haunted|detective mystery|investigation game|mystery adventure/, modules: ["src/world/exploration.js", "src/systems/interactions.js", "src/systems/evidence.js", "src/systems/atmosphere-audio.js", "src/systems/narrative.js", "src/systems/save-system.js"] },
                      { pattern: /subway surfer|endless runner|runner game|infinite runner/, modules: ["src/systems/runner-movement.js", "src/systems/obstacles.js", "src/systems/collectibles.js", "src/systems/progression.js"] },
                      { pattern: /minecraft|voxel sandbox|sandbox survival|crafting survival|open.?world survival/, modules: ["src/world/world-generator.js", "src/world/voxel-system.js", "src/systems/inventory.js", "src/systems/crafting.js", "src/systems/building.js", "src/systems/save-system.js"] },
                      { pattern: /base.?building strategy|real.?time strategy|\brts\b|city builder|colony sim|tower defense/, modules: ["src/world/grid-map.js", "src/systems/building.js", "src/systems/resource-economy.js", "src/systems/unit-control.js", "src/systems/pathfinding.js", "src/systems/save-system.js"] },
                      { pattern: /metroidvania|2d platformer|platform adventure|precision platformer/, modules: ["src/player/platformer-controller.js", "src/world/level-geometry.js", "src/systems/checkpoints.js", "src/systems/abilities.js", "src/systems/enemy-ai.js", "src/systems/save-system.js"] },
                      { pattern: /role.?playing game|\brpg\b|action rpg|jrpg/, modules: ["src/player/character-stats.js", "src/systems/quests.js", "src/systems/dialogue.js", "src/systems/inventory.js", "src/systems/equipment.js", "src/systems/save-system.js"] },
                      { pattern: /first.?person shooter|\bfps\b|arena shooter|tactical shooter/, modules: ["src/systems/weapons.js", "src/systems/enemy-ai.js", "src/systems/combat.js", "src/systems/aim-camera.js", "src/systems/wave-director.js"] },
                      { pattern: /racing game|car racing|driving simulator|vehicle game/, modules: ["src/vehicle/vehicle-controller.js", "src/world/track-layout.js", "src/systems/race-director.js", "src/systems/vehicle-camera.js"] },
                      { pattern: /puzzle game|logic puzzle|escape room|brain teaser/, modules: ["src/systems/puzzle-state.js", "src/systems/level-content.js", "src/systems/hint-system.js", "src/systems/progression.js"] }
                    ];
                    const matchedGenre = genreArchitectures.find(genre => genre.pattern.test(scopeText));
                    if (matchedGenre) plannedModules.push(...matchedGenre.modules);
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
                    /\.(?:m?js|cjs)$/i.test(path) ||
                    /^assets\/[a-zA-Z0-9_-]+\/(?:model\.obj|model\.mtl|asset\.json)$/i.test(path);
                  const safeManifest = [...new Set(candidates.filter((path: unknown): path is string =>
                    safe(path) && !core.has(path) && isRuntimeLoadablePath(path)
                  ))].slice(0, 96);
                  const omittedUnsupportedAssets = candidates.filter((path: unknown) =>
                    typeof path === "string" && safe(path) && !core.has(path) && !isRuntimeLoadablePath(path)
                  );
                  if (spec.engine === "webgl3d") {
                    const modelRequests = Array.isArray(spec.modelRequests) && spec.modelRequests.length
                      ? spec.modelRequests.slice(0, 2)
                      : [
                          { id: "hero", kind: "character", prompt: "Create the main playable character/avatar for this exact 3D game: " + (nextProject.initialPrompt || spec.title) + ". Strong readable silhouette, coherent proportions, layered primary/secondary forms, distinctive palette, grounded pivot and a design readable from the gameplay camera." },
                          { id: "landmark", kind: "environment", prompt: "Create one signature environment landmark or gameplay prop for this exact 3D game: " + (nextProject.initialPrompt || spec.title) + ". Clear silhouette, functional geometry, coherent materials, layered detail and scale readable from the gameplay camera." }
                        ];
                    const generatedModels: Array<{ id: string; role: string; name: string; quality: string; files: { obj: string; mtl: string; manifest: string } }> = [];
                    for (const request of modelRequests) {
                      const rawId = String(request?.id || request?.name || "game-asset").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "game-asset";
                      const assetId = rawId.startsWith("asset-") ? rawId : "asset-" + rawId;
                      const prefix = "assets/" + assetId + "/";
                      const quality = ["performance", "standard", "high"].includes(String(request?.quality)) ? String(request.quality)
                        : /low.?poly|stylized|low.?end|performance/i.test([nextProject.initialPrompt, prompt, String(request?.prompt || "")].join(" ")) ? "performance"
                        : /photoreal|ultra.?detail|high.?detail|high.?quality|realistic/i.test([nextProject.initialPrompt, prompt, String(request?.prompt || "")].join(" ")) ? "high" : "standard";
                      if (stagedFiles[prefix + "model.obj"] && stagedFiles[prefix + "model.mtl"] && stagedFiles[prefix + "asset.json"]) {
                        generatedModels.push({ id: assetId, role: String(request?.role || request?.kind || "asset"), name: assetId, quality, files: { obj: prefix + "model.obj", mtl: prefix + "model.mtl", manifest: prefix + "asset.json" } });
                        continue;
                      }
                      try {
                        setLiveRun(current => current ? { ...current, stage: "forge", forge: { asset: assetId, status: "connecting", detail: "Calling the native modelling tool · " + quality + " detail" } } : current);
                        addActivity("Connecting to GENE Forge for " + assetId + " (" + quality + " detail); requesting a structured mesh recipe.");
                        setLiveRun(current => current ? { ...current, stage: "forge", forge: { asset: assetId, status: "modelling", detail: "Building mesh parts, assigning colours/materials, and validating geometry" } } : current);
                        addActivity("GENE Forge is modelling " + assetId + ": building mesh parts, assigning per-part colours/materials, and validating geometry.");
                        const forgeResponse = await runFetch("/api/forge", {
                          method: "POST", headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            prompt: String(request?.prompt || ("Create a distinctive " + String(request?.kind || "prop") + " for " + spec.title + ". " + nextProject.initialPrompt)).slice(0, 3800),
                            kind: ["character", "vehicle", "building", "environment", "prop", "weapon"].includes(String(request?.kind)) ? String(request.kind) : "prop",
                            quality,
                            projectStyle: [nextProject.initialPrompt, nextProject.plan?.summary, spec.artDirection, spec.visualStyle].filter(Boolean).join("\n").slice(0, 1600),
                            references: [...(nextProject.references || []).filter(ref => ref.kind === "text").slice(0, 2), ...(nextProject.references || []).filter(ref => ref.kind === "image" && ref.dataBase64).slice(0, 2)]
                          })
                        });
                        const forgeData = await forgeResponse.json().catch(() => null);
                        const meshFiles = forgeData?.asset?.files;
                        if (!forgeResponse.ok || !forgeData?.ok || typeof meshFiles?.["model.obj"] !== "string" || typeof meshFiles?.["model.mtl"] !== "string" || typeof meshFiles?.["asset.json"] !== "string") {
                          addActivity("Forge could not produce " + assetId + ": " + String(forgeData?.error?.message || "no validated mesh returned") + ". No placeholder model was written.");
                          continue;
                        }
                        const manifest = JSON.parse(meshFiles["asset.json"]);
                        manifest.assetId = assetId;
                        manifest.name = String(forgeData.asset.name || assetId);
                        manifest.kind = String(forgeData.asset.kind || request?.kind || "prop");
                        manifest.style = String(forgeData.asset.style || quality);
                        manifest.partCount = Number(forgeData.asset.partCount || manifest.partCount || 0);
                        manifest.triangleCount = Number(forgeData.asset.triangleCount || manifest.triangleCount || 0);
                        manifest.vertexCount = Number(forgeData.asset.vertexCount || manifest.vertexCount || 0);
                        manifest.qualityProfile = quality;
                        manifest.files = { obj: prefix + "model.obj", mtl: prefix + "model.mtl" };
                        stagedFiles[prefix + "model.obj"] = String(meshFiles["model.obj"]);
                        stagedFiles[prefix + "model.mtl"] = String(meshFiles["model.mtl"]);
                        stagedFiles[prefix + "asset.json"] = JSON.stringify(manifest, null, 2);
                        safeManifest.push(prefix + "model.obj", prefix + "model.mtl", prefix + "asset.json");
                        generatedModels.push({ id: assetId, role: String(request?.role || request?.kind || "asset"), name: manifest.name, quality, files: { obj: prefix + "model.obj", mtl: prefix + "model.mtl", manifest: prefix + "asset.json" } });
                        setLiveRun(current => current ? { ...current, stage: "forge", forge: { asset: assetId, status: "done", detail: Number(forgeData.asset.partCount || 0) + " parts · " + Number(forgeData.asset.triangleCount || 0) + " triangles · OBJ/MTL/JSON exported" } } : current);
                        addActivity("Forge produced actual OBJ/MTL geometry for " + assetId + " (" + Number(forgeData.asset.triangleCount || 0) + " triangles).");
                      } catch (modelError) {
                        setLiveRun(current => current ? { ...current, stage: "forge", forge: { asset: assetId, status: "failed", detail: (modelError instanceof Error ? modelError.message : "unknown modelling error").slice(0, 180) } } : current);
                        addActivity("Forge request failed for " + assetId + ": " + (modelError instanceof Error ? modelError.message : "unknown modelling error") + ". No fake asset was added.");
                      }
                    }
                    spec.generatedModels = generatedModels;
                    spec.modelingStatus = generatedModels.length ? "forge-generated-obj-mtl" : "forge-unavailable-procedural-fallback";
                    spec.modelingNotes = generatedModels.length
                      ? "These are actual generated OBJ meshes with MTL materials from GENE Forge; they are not Blender sculpt files, rigged characters, UV texture sets or baked PBR maps."
                      : "No Forge mesh was returned for this build. Use honest procedural geometry and do not claim external models were generated.";
                    safeManifest.splice(0, safeManifest.length, ...[...new Set(safeManifest)].slice(0, 96));
                  }
                  spec.additionalFiles = safeManifest;
                  stagedFiles["game-spec.json"] = JSON.stringify(spec, null, 2);
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
                  livingPreview: { status: "booting", lastKnownGoodVersion: current.versions[0]?.number, updatedAt: now(), runtimeErrors: [], currentObjectives: activeBuildRun?.prototype?.completedObjectives || [], canContinuePlaying: false },
                  updatedAt: now()
                } : current);
                setPreviewOpen(true);
                setPreviewKey(value => value + 1);
                setRuntimeState("loaded");
                setSection("chat");
                setCanQueueBuildRequests(true);
                persistRun(activeBuildRun, "booting", stagedFiles, ["Core project files are present; awaiting a visible runtime render"], [], "prototype-ready");
                addActivity("Playable prototype published. Continue playing and chatting while GENE builds the remaining modules and full-game content.");
              }
            } catch (stageException) {
              stageError = stageException instanceof Error ? stageException.message : "Network error during stage.";
              addActivity("Stage " + stagePath + " attempt " + stageAttempt + " network failure");
            }
          }
          if (!stageSucceeded) {
            const shouldSplitLongGameTask = !autoSplitGameJs && stagePath === "game.js" &&
              /truncat|MAX_TOKENS|output.?limit|malformed|invalid json|did not return the requested file|response.*incomplete|too large/i.test(stageError);
            if (shouldSplitLongGameTask) {
              autoSplitGameJs = true;
              const coreModule = "src/systems/gameplay-core.js";
              const presentationModule = "src/systems/gameplay-ui.js";
              try {
                const spec = JSON.parse(stagedFiles["game-spec.json"] || "{}");
                spec.additionalFiles = [...new Set([...(Array.isArray(spec.additionalFiles) ? spec.additionalFiles : []), coreModule, presentationModule])].slice(0, 96);
                spec.autoSplitRecovery = { source: "game.js", modules: [coreModule, presentationModule], reason: stageError.slice(0, 500) };
                stagedFiles["game-spec.json"] = JSON.stringify(spec, null, 2);
                const before = stagePaths.slice(0, index);
                const after = stagePaths.slice(index + 1);
                stagePaths = [...before, coreModule, presentationModule, "game.js", ...after];
                const previousByPath = new Map(activeBuildRun.tasks.filter(task => task.id.startsWith("stage-") && task.files[0]).map(task => [task.files[0], task]));
                const splitTasks = stagePaths.map((path, stageIndex) => {
                  const previous = previousByPath.get(path);
                  const passed = path !== "game.js" && previous?.status === "passed";
                  return {
                    id: "stage-" + stageIndex,
                    title: "Generate " + path,
                    kind: (stageIndex === 0 ? "design" : stageIndex === 1 ? "scaffold" : "implement") as "design" | "scaffold" | "implement",
                    status: passed ? "passed" as const : "queued" as const,
                    dependsOn: stageIndex ? ["stage-" + (stageIndex - 1)] : [],
                    attempts: previous?.attempts || 0,
                    files: [path],
                    acceptance: ["Return the requested complete file", "Pass server-side source validation"]
                  };
                });
                activeBuildRun = {
                  ...activeBuildRun,
                  tasks: [...splitTasks,
                    { id: "final-content-pass", title: nextProject.kind === "app" ? "Polish app interactions and error states" : "Expand the prototype into the full game", kind: "implement", status: "queued", dependsOn: ["stage-" + (stagePaths.length - 1)], attempts: 0, files: ["game.js", "game.css"], acceptance: ["Preserve the core feature set", "Pass source and runtime-contract validation"] },
                    { id: "validate-assembled", title: "Validate assembled playable project", kind: "test", status: "queued", dependsOn: ["final-content-pass"], attempts: 0, files: [...stagePaths], acceptance: ["Required project files are present", "Project contract and JavaScript syntax pass"] }
                  ],
                  activeTaskId: undefined,
                  status: "running",
                  lastError: undefined
                };
                persistRun(activeBuildRun, "booting", stagedFiles, ["Automatically split oversized game.js into two cohesive modules"], [stageError]);
                addActivity("Automatic task decomposition: split oversized game.js into " + coreModule + " and " + presentationModule + "; GENE will regenerate both and retry the integration file.");
                index -= 1;
                continue;
              } catch (splitError) {
                addActivity("Automatic task split could not be prepared: " + (splitError instanceof Error ? splitError.message : "unknown split error"));
              }
            }
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
              const finalPassResponse = await runFetch("/api/agent", {
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
            const validateResponse = await runFetch("/api/agent", {
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

            // Audio is a cross-file contract (code + spec); repairTargetsFor handles that and path hints.
            const repairPaths = repairTargetsFor(validationError, stagePaths);
            let repaired = true;
            for (const targetPath of repairPaths) {
              addActivity("Attempting targeted repair of " + targetPath + " (" + (validationAttempt + 1) + "/3)");
              let fileRepaired = false;
              for (let repairAttempt = 1; repairAttempt <= 2 && !fileRepaired; repairAttempt++) {
                const focusedAudioInstruction = /audio|sound|music|sfx|volume|mute|sound effect/i.test(validationError)
                  ? (targetPath === "game.js"
                    ? " Implement actual audible Web Audio/media playback with a safe user-gesture unlock, background music, at least three gameplay/UI sound events wired to real transitions, and adjustable master/music/SFX volume plus mute. Do not use silent stubs or claim sounds that are not connected."
                    : " Declare only the audio implementation actually present in game.js: enabled=true, implementation=procedural-web-audio or asset-backed, buses master/music/sfx, and at least three event mappings corresponding to real sound calls. Keep all existing spec fields.")
                  : "";
                const repairResponse = await runFetch("/api/agent", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    ...baseRequest,
                    operation: "buildPart",
                    stagePath: targetPath,
                    message: "TARGETED FINAL-VALIDATION REPAIR. Change only " + targetPath + " to fix this exact validation failure: " + validationError.slice(0, 900) + "." + focusedAudioInstruction + " Existing complete project files and the approved plan are in context. Preserve the requested game's/app's visual identity and working mechanics. Return one complete replacement file for " + targetPath + ", not a patch, no other files, no inline executable script tags in game.html, and no provider/AI watermark. Keep it concise and syntactically valid." + (repairAttempt === 2 ? " Previous repair attempt failed. Use the simplest safe complete implementation that fixes the reported requirement." : ""),
                    project: { ...nextProject, files: { ...stagedFiles }, plan: stagedPlan }
                  })
                });
                const repairPayload = await repairResponse.json().catch(() => null);
                const repairFile = (repairPayload?.result?.files || []).find((file: { path?: string }) => file.path === targetPath);
                if (repairResponse.ok && repairPayload?.ok && repairFile && typeof repairFile.content === "string") {
                  stagedFiles[targetPath] = repairFile.content;
                  modelUsed = repairPayload.model || modelUsed;
                  fileRepaired = true;
                  addActivity("Repaired " + targetPath + "; rerunning full-project validation");
                } else {
                  addActivity("Repair attempt for " + targetPath + " failed: " + String(repairPayload?.error?.message || "no valid replacement file").slice(0, 160));
                }
              }
              if (!fileRepaired) { repaired = false; break; }
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
        // Retry transient provider failures and incomplete model outputs automatically.
        // Keep this bounded: one initial request plus two compact retries.
        let lastFailure: { kind: ReturnType<typeof classifyFailure>["kind"]; message: string } = { kind: "unknown", message: "" };
        for (let attempt = 0; attempt < 5; attempt++) {
          if (attempt > 0) {
            const waitMs = backoffMs(lastFailure.kind, attempt);
            addActivity("Automatic recovery retry " + (attempt + 1) + "/5 after: " + classifyFailure(lastFailure.message, "").title.toLowerCase() + " (waiting " + Math.round(waitMs / 100) / 10 + "s)");
            setNotice("GENE is retrying. Your current project files remain safe.");
            await new Promise(resolve => window.setTimeout(resolve, waitMs));
          }
          const retryInstruction = attempt === 0 ? "" : retryGuidance(lastFailure.kind, lastFailure.message, attempt) + (attempt === 1
            ? "\n\nAUTOMATIC RECOVERY RETRY 2/3 — DIAGNOSE AND SIMPLIFY: Re-read the project files and failure context, identify the most likely cause, then retry with a smaller complete implementation. Preserve working behavior and established filenames; remove optional effects before removing the requested core. Return one valid complete response, never a fragment."
            : "\n\nAUTOMATIC RECOVERY RETRY 3/3 — CHANGE APPROACH: Do not repeat the previous implementation strategy. Use a safer alternative architecture or simpler algorithm, reduce cross-file dependencies, verify identifiers and file paths, and prioritize a runnable result that satisfies the core request. Preserve saved files. For edits, touch only necessary files. Do not claim runtime verification without evidence.");
          setLiveRun(current => current ? { ...current, stage: "model", attempt: attempt + 1 } : current);
          let response: Response;
          try {
            response = await runFetch("/api/agent", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                ...baseRequest,
                operation,
                message: prompt + retryInstruction,
                project: nextProject
              })
            });
          } catch (networkError) {
            const detail = networkError instanceof Error ? networkError.message : "network connection lost";
            addActivity("Network failure on request attempt " + (attempt + 1) + "/5: " + detail);
            lastFailure = { kind: "network", message: detail };
            if (attempt < 4) {
              setNotice("GENE lost the connection to its server. It will retry with a different recovery strategy; saved files remain untouched.");
              continue;
            }
            payload = { ok: false, error: { code: "GENE_NETWORK_RETRY_EXHAUSTED", message: "The connection failed on all five request attempts. No unconfirmed changes were applied. Retry when the connection is stable." } };
            responseOk = false;
            break;
          }
          payload = await response.json().catch(() => null);
          responseOk = response.ok;
          if (responseOk && payload?.ok) break;
          const code = String(payload?.error?.code || "");
          const status = response.status;
          const failureMessage = String(payload?.error?.message || "");
          const failure = classifyFailure(failureMessage, code, status);
          lastFailure = { kind: failure.kind, message: failureMessage };
          if (!failure.retryable || attempt >= 4) break;
        }
      }
      if (!responseOk || !payload?.ok) {
        const rawError = payload?.error?.message || "GENE could not complete the request.";
        const error = explainAgentError(rawError, payload?.error?.code);
        addActivity("Request failed: " + rawError);
        const failed = { ...nextProject, buildRun: activeBuildRun || nextProject.buildRun || null, livingPreview: activeBuildRun ? { status: "error" as const, lastKnownGoodVersion: nextProject.versions[0]?.number, updatedAt: now(), runtimeErrors: [error], currentObjectives: [], canContinuePlaying: false } : nextProject.livingPreview || null, messages: [...nextProject.messages, message("assistant", error, "error", { prompt, operation })], updatedAt: now() };
        setProject(current => {
          if (!current || current.id !== failed.id) return current;
          const knownIds = new Set(current.messages.map(item => item.id));
          const appendedMessages = failed.messages.filter(item => !knownIds.has(item.id));
          return {
            ...current,
            buildRun: activeBuildRun || current.buildRun || failed.buildRun,
            livingPreview: activeBuildRun ? failed.livingPreview : current.livingPreview,
            messages: [...current.messages, ...appendedMessages],
            updatedAt: now()
          };
        });
        setNotice(error);
        return;
      }
      const result: AgentResponse = payload.result;
      setLiveRun(current => current ? { ...current, stage: "apply", model: typeof payload.model === "string" ? payload.model : current.model } : current);
      addActivity("Response received from " + (payload.model || payload.aiMode || "agent"));
      if (Array.isArray((result as any).processingTrace)) for (const step of (result as any).processingTrace) if (typeof step === "string") addActivity(step);
      if (payload.reviewedBy) addActivity("Independent code review completed by " + payload.reviewedBy);
      let files = { ...nextProject.files };
      const changedPaths: string[] = [];
      (result.files || []).forEach(file => { files[file.path] = file.content; changedPaths.push(file.path); });
      // Every newly built game/app receives a deterministic local cover file from GENE tools.
      // No image-model call or external asset download is required for this fallback artwork.
      if ((operation === "build" || operation === "surprise") && !nextProject.files["assets/project-cover.svg"]) {
        files["assets/project-cover.svg"] = createProjectCoverSvg({
          name: result.plan?.title || nextProject.name,
          kind: nextProject.kind,
          engine: result.plan?.engine || nextProject.preferredEngine || (nextProject.kind === "app" ? "webapp" : "canvas2d"),
          prompt: nextProject.initialPrompt || prompt,
          files
        });
        if (!changedPaths.includes("assets/project-cover.svg")) changedPaths.push("assets/project-cover.svg");
        addActivity("Created a no-credit local SVG cover and saved it to assets/project-cover.svg");
      }
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
      const acceptedPlan = operation === "plan" || operation === "interview" || operation === "build" || operation === "surprise"
        ? result.plan || nextProject.plan || null
        : nextProject.plan || null;
      if ((operation === "plan" || operation === "interview") && result.plan) addActivity("Plan updated: " + result.plan.tasks.length + " task(s)");
      const fileChanges = changedPaths.length ? summarizeChanges(nextProject.files, files, changedPaths) : [];
      if (fileChanges.length) addActivity("Changed: " + describeChanges(fileChanges, 6));
      const assistantMessage = message("assistant", result.reply || "Done.", changedPaths.length ? "build" : (operation === "plan" || operation === "interview") && result.plan ? "plan" : result.question ? "question" : undefined, undefined, { changes: fileChanges });
      const updated: GeneProject = {
        ...nextProject,
        name: (["New project", "Untitled project", "Untitled game", "Untitled app"].includes(nextProject.name)) ? (result.plan?.title || (isFirstIdea && operation !== "chat" && operation !== "research" ? prompt.split(/[.!?]/)[0].slice(0, 38) : nextProject.name)) : nextProject.name,
        mode: operation === "build" || operation === "edit" || operation === "surprise" ? "build" : nextProject.mode,
        answers: nextAnswers,
        question: operation === "research" || operation === "chat" ? nextProject.question : (result.question || null),
        plan: acceptedPlan,
        files,
        versions,
        buildRun: activeBuildRun || nextProject.buildRun || null,
        livingPreview: changedPaths.length ? { status: "booting", lastKnownGoodVersion: versions[0]?.number, updatedAt: now(), runtimeErrors: [], currentObjectives: ["Waiting for browser render confirmation"], canContinuePlaying: false } : nextProject.livingPreview || null,
        activeFile: changedPaths.includes(nextProject.activeFile) ? changedPaths[0] : (changedPaths[0] || nextProject.activeFile),
        messages: [...nextProject.messages, assistantMessage],
        updatedAt: now()
      };
      setProject(current => {
        // A late response must never switch the workspace back to an older project.
        if (!current || current.id !== updated.id) return current;
        const knownIds = new Set(current.messages.map(item => item.id));
        const appendedMessages = updated.messages.filter(item => !knownIds.has(item.id));
        const isReadOnlyReply = operation === "chat" || operation === "research";
        if (isReadOnlyReply) {
          return { ...current, messages: [...current.messages, ...appendedMessages], updatedAt: now() };
        }

        const sourceMerge = mergeConcurrentSourceChanges(nextProject.files, current.files, updated.files, changedPaths);
        const planChangedDuringRequest = JSON.stringify(current.plan ?? null) !== JSON.stringify(nextProject.plan ?? null);
        const planConflict = Boolean(result.plan && planChangedDuringRequest);
        if (sourceMerge.conflicts.length || planConflict) {
          const conflicts = sourceMerge.conflicts.length ? " Conflicting files: " + sourceMerge.conflicts.join(", ") + "." : "";
          const planConflictText = planConflict ? " The approved plan also changed while this request was running." : "";
          const conflictMessage = message("assistant",
            "GENE discarded this stale result to protect newer project edits. Nothing from this response was applied. Retry the request against the latest source." + conflicts + planConflictText,
            "error");
          return {
            ...current,
            messages: [...current.messages, ...appendedMessages, conflictMessage],
            updatedAt: now()
          };
        }

        let versions = current.versions;
        if (changedPaths.length && updated.versions[0]) {
          const latestNumber = current.versions.reduce((maximum, version) => Math.max(maximum, version.number), 0);
          const safeVersion = {
            ...updated.versions[0],
            number: Math.max(updated.versions[0].number, latestNumber + 1),
            files: { ...sourceMerge.files }
          };
          versions = [safeVersion, ...current.versions].slice(0, 8);
        }

        return {
          ...current,
          name: current.name === nextProject.name ? updated.name : current.name,
          mode: current.mode === nextProject.mode ? updated.mode : current.mode,
          answers: current.answers,
          question: current.question === nextProject.question ? updated.question : current.question,
          files: sourceMerge.files,
          versions,
          plan: (operation === "plan" || operation === "interview" || operation === "build" || operation === "surprise") && result.plan ? updated.plan : current.plan,
          buildRun: activeBuildRun || current.buildRun || updated.buildRun,
          livingPreview: changedPaths.length ? updated.livingPreview : current.livingPreview,
          activeFile: current.activeFile === nextProject.activeFile && changedPaths.includes(nextProject.activeFile) ? changedPaths[0] : current.activeFile,
          messages: [...current.messages, ...appendedMessages],
          updatedAt: now()
        };
      });
      if (changedPaths.length) {
        // Successful source repair/change starts a fresh runtime verification cycle.
        autoRepairAttempts.current = 0;
        runtimeRefreshAttempts.current = 0;
        addActivity("Files updated: " + changedPaths.join(", "));
        setLiveRun(current => current ? { ...current, stage: "reload" } : current);
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
      if (runController.signal.aborted) return;
      const text = explainAgentError(error);
      const failed = { ...nextProject, buildRun: nextProject.buildRun || null, livingPreview: nextProject.livingPreview || null, messages: [...nextProject.messages, message("assistant", "Request failed: " + text + ". No unverified changes were applied.", "error", { prompt, operation })] };
      setProject(current => {
        if (!current || current.id !== failed.id) return current;
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
      activeRunControllers.current.delete(runController);
      if (activeRunControllers.current.size === 0) {
        setLiveRun(null);
        if (parallelReadOnlyRequest) setParallelChatInProgress(false);
        else setBusy(false);
        if (operation === "build" || operation === "surprise") {
          setBuildInProgress(false);
          setCanQueueBuildRequests(false);
        }
      } else if (parallelReadOnlyRequest) setParallelChatInProgress(false);
    }
  }, [project, busy, buildInProgress, canQueueBuildRequests, aiModel, searchMode, planIntent, interactionMode, extendedPlanning, localAgentStatus, localAgentToken, localAgentUrl]);

  useEffect(() => {
    if (busy || buildInProgress || !project || pendingBuildRequests.current.length === 0) return;
    const next = pendingBuildRequests.current.shift();
    setQueuedRequestCount(pendingBuildRequests.current.length);
    if (!next) return;
    setNotice("Processing queued request (" + (pendingBuildRequests.current.length + 1) + " remaining after this one).");
    void runAgent(next);
  }, [busy, buildInProgress, project?.id, queuedRequestCount, runAgent]);

  useEffect(() => {
    if (runtimeState !== "error" || busy || buildInProgress || !project?.files["game.js"] || !project.files["game.html"] || autoRepairAttempts.current >= 3) return;
    autoRepairAttempts.current += 1;
    const attempt = autoRepairAttempts.current;
    const timer = window.setTimeout(() => {
      setNotice("GENE detected a preview failure and is automatically diagnosing and repairing the source (attempt " + attempt + "/3). Your last saved files and versions are preserved.");
      addActivity("Automatic runtime repair started (attempt " + attempt + "/3); preserving the current checkpoint.");
      void runAgent(
        "AUTOMATIC RUNTIME RECOVERY — attempt " + attempt + " of 3. The game/app preview failed to render or emitted a runtime error. Inspect the current source, HTML, CSS, spec and recent runtime error details in context. Identify the actual cause; make the smallest safe source repair, preserve existing mechanics and visual design, then let GENE refresh and re-check the preview. Do not merely explain the issue. Return only genuinely changed files. Runtime status: " + (lastRuntimeError.current || "no visible frame confirmed") + ". If the error says a name is undefined, find its first use and make sure it is declared and initialised before any code runs that reads it.",
        "edit",
        true
      );
    }, 450);
    return () => window.clearTimeout(timer);
  }, [runtimeState, busy, buildInProgress, project?.id, project?.files, runAgent]);

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
    const mime = path.endsWith(".svg") ? "image/svg+xml" : path.endsWith(".mtl") || path.endsWith(".obj") ? "text/plain" : "application/json";
    const blob = new Blob([project.files[path]], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = path.split("/").pop() || "asset.txt";
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function importResearchImage(image: any) {
    if (!project || !image || typeof image.full !== "string" || typeof image.page !== "string") return;
    const license = String(image.license || "").trim();
    const attribution = String(image.credit || image.attribution || "").trim();
    const title = String(image.title || "Research reference").trim().slice(0, 160);
    const accepted = typeof window !== "undefined" && window.confirm(
      "Import this external image into the current project?\n\n" +
      title + "\nLicense: " + (license || "not stated") + "\nAttribution: " + (attribution || "not stated") +
      "\nSource page: " + image.page +
      "\n\nReview the source page and license first. GENE will record your review and the source metadata, but cannot independently certify the license."
    );
    if (!accepted) return;
    try {
      const response = await fetchWithToolApproval("/api/research/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceUrl: image.full,
          sourcePage: image.page,
          title,
          license,
          attribution,
          licenseReviewConfirmed: true
        })
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok || !result.asset?.dataBase64 || !result.asset?.sha256) {
        addActivity("Research image was not imported: " + String(result?.error?.message || "source validation failed") + ".");
        setNotice("Image import failed: " + String(result?.error?.message || "source validation failed"));
        return;
      }
      const imported = result.asset;
      const assetId = ("research-" + uid()).toLowerCase().replace(/[^a-z0-9_-]/g, "-").slice(0, 64);
      const prefix = "assets/" + assetId + "/";
      const extension = imported.mimeType === "image/png" ? "png" : imported.mimeType === "image/webp" ? "webp" : "jpg";
      const imagePath = prefix + "reference." + extension;
      const manifestPath = prefix + "asset.json";
      const manifest = {
        assetId,
        version: 1,
        name: imported.title,
        kind: "reference-image",
        createdAt: imported.importedAt,
        provenance: {
          origin: "external-research",
          sourceUrl: imported.sourceUrl,
          sourcePage: imported.sourcePage,
          license: imported.license,
          attribution: imported.attribution,
          licenseReviewConfirmed: true,
          reviewedAt: now(),
          byteSize: imported.byteSize,
          sha256: imported.sha256
        },
        contentIntegrity: { algorithm: "sha256", files: { [imagePath]: imported.sha256 } },
        runtimeCompatibility: { format: "raster-reference", role: "reference-image", automaticallyAppliedAsTexture: false }
      };
      const files = {
        ...project.files,
        [imagePath]: "data:" + imported.mimeType + ";base64," + imported.dataBase64,
        [manifestPath]: JSON.stringify(manifest, null, 2)
      };
      const versionNumber = (project.versions[0]?.number || 0) + 1;
      const version: BuildVersion = {
        number: versionNumber,
        label: "Imported research reference: " + imported.title,
        files: { ...files },
        createdAt: now(),
        testSummary: "Imported reviewed external raster bytes with source/license metadata and SHA-256 fingerprint. Automatic texture application and scene integration are not claimed."
      };
      const reply = message("assistant",
        "Imported **" + imported.title + "** into " + imagePath + ". The project now contains the image and its source/license manifest. Its exact bytes are fingerprinted; it remains a reference image until you assign it to a supported sprite or texture workflow.",
        "build"
      );
      const updated: GeneProject = {
        ...project,
        files,
        versions: [version, ...project.versions].slice(0, 3),
        messages: [...project.messages, reply],
        updatedAt: now()
      };
      setProject(updated);
      setSection("assets");
      addActivity("Imported research image " + imported.title + " (" + imported.byteSize + " bytes; " + imported.license + ").");
      setNotice("Research image saved in project version " + versionNumber + "; source metadata and SHA-256 were recorded.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      const reason = error instanceof Error ? error.message : "unknown error";
      addActivity("Research image import failed: " + reason);
      setNotice("Research image import failed: " + reason);
    }
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
      const response = await fetchWithToolApproval("/api/forge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: forgePrompt.trim(),
          kind: forgeKind,
          quality: forgeQuality,
          existingRecipe,
          projectStyle: [project.initialPrompt, project.plan?.summary, project.plan?.title].filter(Boolean).join("\n"),
          references: [...(project.references || []).filter(ref => ref.kind === "text").slice(0, 2), ...(project.references || []).filter(ref => ref.kind === "image" && ref.dataBase64).slice(0, 2)]
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok || !data.asset?.files?.["model.obj"] || !data.asset?.files?.["model.mtl"] || !data.asset?.files?.["asset.json"]) {
        throw new Error(data?.error?.message || "Forge returned no validated mesh files.");
      }
      const assetId = targetId || ("asset-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6));
      const prefix = "assets/" + assetId + "/";
      let previousAssetVersion = 0;
      if (targetId) {
        try { previousAssetVersion = Number(JSON.parse(project.files[prefix + "asset.json"] || "{}").version) || 0; } catch {}
      }
      const manifest = {
        ...JSON.parse(data.asset.files["asset.json"]),
        assetId,
        version: Math.max(1, previousAssetVersion + 1),
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

  async function generateForge2DAsset() {
    if (!project || forgeBusy || !forgePrompt.trim()) return;
    setForgeBusy(true);
    setForgeNotice("");
    addActivity("Generating native procedural 2D " + forge2DKind + " artwork through GENE Forge");
    try {
      const response = await fetchWithToolApproval("/api/forge/2d", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: forgePrompt.trim(), kind: forge2DKind, quality: forgeQuality, style: "project-matched stylized game art" })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok || typeof data?.asset?.svg !== "string" || typeof data?.files?.["asset.json"] !== "string") {
        throw new Error(data?.error?.message || "GENE Forge returned no valid 2D SVG asset.");
      }
      const assetId = "art-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6);
      const prefix = "assets/" + assetId + "/";
      const sourceManifest = JSON.parse(data.files["asset.json"]);
      const manifest = {
        ...sourceManifest, assetId, name: data.asset.name, kind: data.asset.kind,
        width: data.asset.manifest.width, height: data.asset.manifest.height, source: data.provider,
        contentIntegrity: sourceManifest.contentIntegrity ? {
          ...sourceManifest.contentIntegrity,
          files: Object.fromEntries(Object.entries(sourceManifest.contentIntegrity.files || {}).map(([name, hash]) => [prefix + name, hash]))
        } : undefined
      };
      const files = {
        ...project.files,
        [prefix + "sprite.svg"]: String(data.asset.svg),
        [prefix + "asset-2d.json"]: JSON.stringify(manifest, null, 2),
        ...Object.fromEntries(Object.entries(data.asset.frameFiles || {}).map(([name, svg]) => [prefix + "frames/" + name, String(svg)]))
      };
      const versionNumber = (project.versions[0]?.number || 0) + 1;
      const version: BuildVersion = { number: versionNumber, label: "Generated 2D asset: " + String(data.asset.name), files: { ...files }, createdAt: now(), testSummary: "Generated a self-contained procedural SVG and a versioned 2D manifest. Visual integration into the running game and raster conversion are not yet verified." };
      const reply = message("assistant", "Generated **" + data.asset.name + "** as native procedural SVG artwork. Saved " + prefix + "sprite.svg and the asset manifest. This generator uses vector shapes and curated palettes; it is not an external image model, and the asset has not been automatically inserted into the game scene.", "build");
      const updated: GeneProject = { ...project, files, versions: [version, ...project.versions].slice(0, 8), messages: [...project.messages, reply], updatedAt: now() };
      setProject(updated);
      setForgePrompt("");
      setSection("assets");
      setForgeNotice("2D artwork saved in version " + versionNumber + ". Use the asset's integration action to request insertion into the playable game; scene integration must be tested separately.");
      addActivity("Saved " + prefix + "sprite.svg (" + data.asset.qualityReport.svgBytes + " bytes), asset-2d.json, and " + Object.keys(data.asset.frameFiles || {}).length + " animation frame files.");
      if (localAgentStatus === "connected" && localAgentToken && updated.files["game.html"] && updated.files["game.js"]) {
        try {
          const diskResult = await writeProjectToDisk(updated, localAgentUrl, localAgentToken);
          setForgeNotice("2D artwork saved in version " + versionNumber + " and synced to disk: " + diskResult.projectPath);
        } catch (error) {
          setForgeNotice("2D artwork saved in GENE, but disk sync failed: " + (error instanceof Error ? error.message : "unknown error") + ". Use Sync files to retry.");
        }
      }
    } catch (error) {
      const why = error instanceof Error ? error.message : "unknown 2D generation error";
      setForgeNotice("2D Forge failed: " + why + ". No asset files were marked as generated.");
      addActivity("2D Forge failed: " + why);
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

  async function addReferenceFiles(selected: File[]) {
    if (!project || !selected.length) return;
    const current = project.references || [];
    let totalBytes = current.reduce((sum, ref) => sum + ref.size, 0);
    const added: GeneProject["references"] = [];
    const skipped: string[] = [];
    for (const file of selected) {
      if (file.size > 450 * 1024) { skipped.push(file.name + " (over 450 KB; resize it and try again)"); continue; }
      if (totalBytes + file.size > 950 * 1024) { skipped.push(file.name + " (project reference budget reached)"); continue; }
      if (/^image\/(jpeg|png|webp|gif)$/.test(file.type)) {
        try {
          const dataUrl = await readDataUrl(file);
          const dataBase64 = dataUrl.split(",")[1] || "";
          if (!dataBase64) { skipped.push(file.name + " (image data unreadable)"); continue; }
          added.push({ id: uid(), name: file.name || "pasted-image-" + (added.length + 1) + ".png", mimeType: file.type, kind: "image", dataBase64, size: file.size });
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
      setProject(currentProject => currentProject && currentProject.id === project.id
        ? { ...currentProject, references: [...(currentProject.references || []), ...added], updatedAt: now() }
        : currentProject);
      setNotice("Attached " + added.length + " file(s). They'll be sent to GENE with your next message.");
    }
    if (skipped.length) setNotice((added.length ? "Attached " + added.length + ". " : "") + "Skipped: " + skipped.join(", "));
  }

  async function addReferences(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const selected = Array.from(input.files || []);
    input.value = "";
    await addReferenceFiles(selected);
  }

  function pasteReferenceImages(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = Array.from(event.clipboardData.items || []);
    const images = items
      .filter(item => item.kind === "file" && /^image\/(jpeg|png|webp|gif)$/.test(item.type))
      .map(item => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    if (!images.length) return;
    event.preventDefault();
    void addReferenceFiles(images.map((file, index) => {
      const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : file.type === "image/gif" ? "gif" : "jpg";
      return new File([file], "pasted-image-" + (index + 1) + "." + extension, { type: file.type, lastModified: Date.now() });
    }));
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
    setInteractionMode("build");
    setProject(next);
    void runAgent(project.kind === "app" ? "Implement the approved plan as a complete, polished and interactive web app. Start with the highest-value user flow and include all required source files." : "Implement the approved plan as a complete playable game. Start with the highest-value vertical slice and include all required source files.", "build");
  }

  function surpriseMe() {
    if (!project || busy) return;
    setInteractionMode("build");
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

  function commitFileMutation(nextFiles: Record<string, string>, label: string, nextActiveFile: string) {
    if (!project) return;
    const pathReport = inspectProjectFilePaths(Object.keys(nextFiles));
    if (pathReport.invalid.length || pathReport.collisions.length) {
      setNotice("File operation rejected: paths must be safe, relative, unique, and portable.");
      return;
    }
    const version: BuildVersion = {
      number: (project.versions[0]?.number || 0) + 1,
      label,
      files: { ...nextFiles },
      createdAt: now(),
      testSummary: "File operation saved as a checkpoint. Run build checks and verify the live preview."
    };
    const updatedProject = { ...project, files: nextFiles, activeFile: nextActiveFile, versions: [version, ...project.versions].slice(0, 8), updatedAt: now() };
    setProject(updatedProject);
    setEditedFile(nextFiles[nextActiveFile] || "");
    setFileDirty(false);
    setNotice(label + " saved as version " + version.number + ".");
    setPreviewKey(n => n + 1);
    if (localAgentStatus === "connected" && localAgentToken) {
      void writeProjectToDisk(updatedProject, localAgentUrl, localAgentToken)
        .then(data => setNotice(label + " saved and synced to " + data.projectPath + ". Run checks before release."))
        .catch(error => setNotice(label + " saved in GENE, but disk sync failed: " + (error instanceof Error ? error.message : "unknown error") + ". Use Sync files to retry."));
    }
  }

  function createProjectFile() {
    if (!project || project.mode === "plan") { setNotice("Switch to Build mode before changing project files."); return; }
    if (fileDirty && !window.confirm("Discard unsaved editor changes before creating a file?")) return;
    const entered = window.prompt("New file path (folders are supported)", "src/level.js");
    if (entered === null) return;
    const path = entered.trim().replace(/\\/g, "/").replace(/^\.\//, "");
    if (!path || path.startsWith("/") || path.split("/").some(part => !part || part === "." || part === "..") || !/\.[a-z0-9]{1,8}$/i.test(path)) {
      setNotice("Use a safe relative file path with a file extension, for example src/level.js.");
      return;
    }
    if (Object.prototype.hasOwnProperty.call(project.files, path)) { setNotice("That file already exists."); return; }
    if (Object.keys(project.files).length >= 100) { setNotice("Project file limit reached (100)."); return; }
    const extension = path.split(".").pop()!.toLowerCase();
    if (!["html","css","js","mjs","cjs","json","svg","png","jpg","jpeg","webp","gif","obj","mtl","glsl","txt","md","gd","ts","wav","mp3","ogg","woff","woff2"].includes(extension)) {
      setNotice("That file type is not supported by GENE's project workspace.");
      return;
    }
    const seed = extension === "json" ? "{}\n" : extension === "html" ? "<!doctype html>\n<html lang=\"en\"><head><meta charset=\"utf-8\"><title>New page</title></head><body></body></html>\n" : "";
    commitFileMutation({ ...project.files, [path]: seed }, "Created " + path, path);
  }

  function moveOrRenameProjectFile() {
    if (!project || project.mode === "plan") { setNotice("Switch to Build mode before changing project files."); return; }
    const currentPath = project.activeFile;
    if (!Object.prototype.hasOwnProperty.call(project.files, currentPath)) return;
    if (["game.html", "game.css", "game.js", "game-spec.json"].includes(currentPath)) {
      setNotice("Core runtime files keep their required paths so GENE can still build and preview this project.");
      return;
    }
    if (fileDirty && !window.confirm("Discard unsaved editor changes before moving this file?")) return;
    const entered = window.prompt("New file path (change the folder to move it)", currentPath);
    if (entered === null) return;
    const nextPath = entered.trim().replace(/\\/g, "/").replace(/^\.\//, "");
    if (!nextPath || nextPath.startsWith("/") || nextPath.split("/").some(part => !part || part === "." || part === "..") || !/\.[a-z0-9]{1,8}$/i.test(nextPath)) {
      setNotice("Use a safe relative file path with a file extension.");
      return;
    }
    const nextExtension = nextPath.split(".").pop()!.toLowerCase();
    if (!["html","css","js","mjs","cjs","json","svg","png","jpg","jpeg","webp","gif","obj","mtl","glsl","txt","md","gd","ts","wav","mp3","ogg","woff","woff2"].includes(nextExtension)) {
      setNotice("That file type is not supported by GENE's project workspace.");
      return;
    }
    if (nextPath !== currentPath && Object.prototype.hasOwnProperty.call(project.files, nextPath)) { setNotice("A file already exists at that path."); return; }
    if (nextPath === currentPath) return;
    const nextFiles = { ...project.files };
    nextFiles[nextPath] = nextFiles[currentPath];
    delete nextFiles[currentPath];
    commitFileMutation(nextFiles, "Moved " + currentPath + " to " + nextPath, nextPath);
  }

  function deleteProjectFile() {
    if (!project || project.mode === "plan") { setNotice("Switch to Build mode before changing project files."); return; }
    const currentPath = project.activeFile;
    if (!Object.prototype.hasOwnProperty.call(project.files, currentPath)) return;
    if (["game.html", "game.css", "game.js", "game-spec.json"].includes(currentPath)) {
      setNotice("Required core runtime files cannot be deleted. Ask GENE to replace their contents instead.");
      return;
    }
    if (!window.confirm("Delete " + currentPath + "? A recoverable version checkpoint will be created first.")) return;
    const nextFiles = { ...project.files };
    delete nextFiles[currentPath];
    const nextActive = Object.keys(nextFiles)[0] || "game.js";
    commitFileMutation(nextFiles, "Deleted " + currentPath, nextActive);
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

  function createNewProject() {
    setShowNewProjectDialog(true);
  }

  function startNewProject(kind: ProjectKind, preferredEngine?: GeneProject["preferredEngine"], projectIntent?: GeneProject["projectIntent"]) {
    stopActiveRun();
    const p = newProject(kind, preferredEngine, projectIntent);
    setProject(p);
    setSection("chat");
    setNotice("");
    setDraft("");
    setActivity([]);
    setShowNewProjectDialog(false);
    setPreviewOpen(true);
    setExpandedPreview(false);
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
    setNotice("Playable sample loaded locally. You can run it, inspect the source, and ask GENE to modify it when the AI connection is available.");
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
    const allPaths = Object.keys(files);
    const pathReport = inspectProjectFilePaths(allPaths);
    const pathProblems = [
      ...pathReport.invalid.slice(0, 5).map(item => String(item.path) + " (" + item.error + ")"),
      ...pathReport.collisions.slice(0, 5).map(item => item.path + " conflicts with " + item.duplicateOf)
    ];
    add("Project file paths", pathProblems.length ? "fail" : "pass", pathProblems.length
      ? "Fix unsafe or cross-platform-conflicting paths: " + pathProblems.join(" | ")
      : allPaths.length + " project paths are relative, portable and collision-free.");
    const fileEntries = Object.entries(files);
    const oversizedFiles = fileEntries.filter(([, source]) => typeof source !== "string" || source.length > 500_000);
    const totalSourceChars = fileEntries.reduce((total, [, source]) => total + (typeof source === "string" ? source.length : 0), 0);
    const withinSourceBudget = allPaths.length <= 100 && oversizedFiles.length === 0 && totalSourceChars <= 8_000_000;
    add("Source size budget", withinSourceBudget ? "pass" : "fail", withinSourceBudget
      ? allPaths.length + " files · " + totalSourceChars.toLocaleString() + " source characters; file and project budgets are respected."
      : "Project limit is 100 files, 500,000 characters per file, and 8,000,000 total characters. Oversized: " + oversizedFiles.slice(0, 5).map(([path]) => path).join(", "));
    const html = files["game.html"] || "";
    const js = files["game.js"] || "";
    const combined = html + "\n" + js;
    const allJavaScript = fileEntries.filter(([path, source]) => /\.(?:m?js|cjs)$/i.test(path) && typeof source === "string").map(([, source]) => source).join("\n");
    const hasExecutableInlineScript = /<script\b(?![^>]*\btype\s*=\s*["'](?:application\/json|application\/ld\+json)["'])/i.test(html);
    const hasExternalRuntime = /<script\b[^>]*\bsrc\s*=\s*["']https?:|<link\b[^>]*\brel\s*=\s*["']stylesheet["'][^>]*\bhref\s*=\s*["']https?:/i.test(html) ||
      /\bimport\s*\(|\bfrom\s*["']https?:|\bfetch\s*\(\s*["']https?:/i.test(allJavaScript);
    const runtimeSelfContained = !hasExecutableInlineScript && !hasExternalRuntime;
    add("Self-contained runtime", runtimeSelfContained ? "pass" : "fail", runtimeSelfContained
      ? "No executable inline script tags or obvious external CDN/runtime dependencies were detected."
      : "Move executable code to project JavaScript files and remove external scripts, stylesheets, dynamic imports, or hard-coded external fetch dependencies.");
    let spec: any = null;
    let specParsed = false;
    try { spec = JSON.parse(files["game-spec.json"] || ""); specParsed = Boolean(spec && typeof spec === "object" && !Array.isArray(spec)); } catch {}
    const isAppSpec = project.kind === "app";
    const specValid = specParsed && typeof spec.title === "string" && Boolean(spec.title.trim()) &&
      (isAppSpec
        ? spec.engine === "webapp" && typeof spec.summary === "string" && Boolean(spec.summary.trim()) && ["features", "routes", "userFlows"].every((key: string) => Array.isArray(spec[key]) && spec[key].length > 0)
        : typeof spec.genre === "string" && Boolean(spec.genre.trim()) && ["canvas2d", "webgl3d"].includes(spec.engine) && Array.isArray(spec.mechanics) && spec.mechanics.length > 0 && Array.isArray(spec.controls) && spec.controls.length > 0 && typeof spec.objective === "string" && Boolean(spec.objective.trim()) && typeof spec.winCondition === "string" && Boolean(spec.winCondition.trim()) && typeof spec.lossCondition === "string" && Boolean(spec.lossCondition.trim()));
    add(isAppSpec ? "App specification" : "Game specification", specValid ? "pass" : "fail", specValid ? (isAppSpec ? "Title, app engine, summary, features, routes and user flows are declared." : "Title, engine, mechanics, controls, objective and end states are declared.") : "The JSON or required project-spec fields are missing or malformed.");
    if (!isAppSpec && specParsed && spec && typeof spec === "object") {
      const sceneObjects: any[] = Array.isArray(spec.scene?.objects) ? spec.scene.objects : [];
      const sceneIssues: string[] = [];
      const sceneIds = new Set<string>();
      for (const [index, object] of sceneObjects.entries()) {
        if (!object || typeof object !== "object" || Array.isArray(object)) {
          sceneIssues.push("Scene entry " + (index + 1) + " is not an object.");
          continue;
        }
        const id = typeof object.id === "string" ? object.id.trim() : "";
        if (!id) sceneIssues.push("Scene entry " + (index + 1) + " has no stable ID.");
        else if (sceneIds.has(id)) sceneIssues.push("Duplicate scene ID: " + id);
        else sceneIds.add(id);
        for (const key of ["position", "rotation", "scale"]) {
          if (object[key] != null) {
            const vector = object[key];
            const values = Array.isArray(vector) ? vector : [vector.x, vector.y, vector.z];
            if (values.length < 3 || values.slice(0, 3).some((value: unknown) => !Number.isFinite(Number(value)))) {
              sceneIssues.push((id || "Scene entry " + (index + 1)) + " has invalid " + key + " coordinates.");
            }
          }
        }
        if (String(object.type || "").toLowerCase() === "mesh" && object.modelPath) {
          const modelPath = String(object.modelPath);
          if (!Object.prototype.hasOwnProperty.call(files, modelPath)) {
            sceneIssues.push((id || "Scene entry " + (index + 1)) + " references missing model file " + modelPath + ".");
          } else if (!/\.obj$/i.test(modelPath)) {
            sceneIssues.push((id || "Scene entry " + (index + 1)) + " modelPath must point to an OBJ file.");
          } else {
            const modelSource = files[modelPath] || "";
            const hasVertices = /^\s*v\s+[-+\d.]/m.test(modelSource);
            const hasFaces = /^\s*f\s+\S+\s+\S+\s+\S+/m.test(modelSource);
            if (!hasVertices || !hasFaces) sceneIssues.push((id || "Scene entry " + (index + 1)) + " references an OBJ without recognizable vertex/face data.");
            const mtlMatch = modelSource.match(/^\s*mtllib\s+(.+)\s*$/m);
            if (mtlMatch) {
              const folder = modelPath.includes("/") ? modelPath.slice(0, modelPath.lastIndexOf("/") + 1) : "";
              const materialPath = folder + mtlMatch[1].trim();
              if (!Object.prototype.hasOwnProperty.call(files, materialPath)) sceneIssues.push((id || "Scene entry " + (index + 1)) + " references missing material file " + materialPath + ".");
            }
          }
        }
      }
      const sceneStatus = sceneIssues.length ? "fail" : "pass";
      add("Scene and OBJ asset integrity", sceneStatus, sceneIssues.length
        ? sceneIssues.slice(0, 8).join(" | ")
        : sceneObjects.length
          ? sceneObjects.length + " scene entries have unique IDs and valid transforms; referenced OBJ/MTL paths are present."
          : "No scene objects are declared; the scene manifest is structurally valid but contains no placed objects.");

      const mainSource = typeof files["game.js"] === "string" ? files["game.js"] : "";
      const moduleSource = Object.entries(files).filter(([path, source]) => /\.(?:m?js|cjs)$/i.test(path) && typeof source === "string").map(([, source]) => source).join("\n");
      const allRuntimeSource = mainSource + "\n" + moduleSource;
      const assignedMeshes = sceneObjects.filter(object => object && typeof object === "object" && String(object.type || "").toLowerCase() === "mesh" && typeof object.modelPath === "string" && object.modelPath.length > 0);
      if (assignedMeshes.length) {
        const explicitSceneDraw = /GENE_SCENE\.(?:draw2D|drawWebGLMeshes)\s*\(/.test(allRuntimeSource);
        const customWebGLDraw = /GENE_SCENE\.(?:createWebGLMeshes|getRenderableObject)\s*\(|GENE3D\.createMeshBuffers\s*\(/.test(allRuntimeSource) && /\.(?:drawArrays|drawElements)\s*\(/.test(allRuntimeSource);
        const meshConnected = explicitSceneDraw || customWebGLDraw;
        add("Scene renderer integration", meshConnected ? "pass" : "warn", meshConnected
          ? "Game source contains a recognized scene-draw call or a mesh-resource plus GPU draw path; actual visibility and gameplay still require runtime verification."
          : assignedMeshes.length + " scene mesh(es) are assigned, but no recognized scene-draw call was found. Parsing an OBJ or reading scene metadata alone does not draw it.");
      } else if (sceneObjects.length) {
        const engineName = String(spec.engine || "").toLowerCase();
        const sceneDrawn2D = /GENE_SCENE\.draw2D\s*\(/.test(allRuntimeSource);
        const sceneDrawn3D = /GENE_SCENE\.drawWebGLMeshes\s*\(/.test(allRuntimeSource) || (/GENE_SCENE\.(?:createWebGLMeshes|getRenderableObject)\s*\(|GENE3D\.createMeshBuffers\s*\(/.test(allRuntimeSource) && /\.(?:drawArrays|drawElements)\s*\(/.test(allRuntimeSource));
        const sceneDrawn = engineName === "canvas2d" ? sceneDrawn2D : engineName === "webgl3d" ? sceneDrawn3D : sceneDrawn2D || sceneDrawn3D;
        const engineLabel = engineName === "canvas2d" ? "Canvas 2D" : engineName === "webgl3d" ? "3D" : "game";
        add("Scene renderer integration", sceneDrawn ? "pass" : "warn", sceneDrawn
          ? "Game source references the shared scene manifest API; verify object rendering, layering and collision behavior in gameplay."
          : "Scene objects exist in the manifest, but the " + engineLabel + " source does not reference the shared scene API. Manifest entries alone do not guarantee visible objects.");
      }
      const audioConfig = spec.audio && typeof spec.audio === "object" ? spec.audio : {};
      if (audioConfig.enabled !== false && !isAppSpec) {
        const audioConnected = /GeneAudio\.(?:sfx|play|playSfx|music\.start|startMusic)|GeneAudio\[/.test(allRuntimeSource);
        add("Audio runtime integration", audioConnected ? "pass" : "warn", audioConnected
          ? "Game source references the shared GeneAudio runtime; event coverage and audible output are not inferred from source alone."
          : "Audio is enabled in game-spec.json, but game source does not reference GeneAudio. The runtime exists, but the game may remain silent.");
      }
    }

    const syntaxFiles = Object.entries(files)
      .filter(([path, source]) => /\.(?:m?js|cjs)$/i.test(path) && typeof source === "string");
    const syntaxFailures: string[] = [];
    for (const [path, source] of syntaxFiles) {
      try {
        if (source.length > 500_000) throw new Error("JavaScript exceeds the 500 KB build budget.");
        new Function(source);
      } catch (error) {
        syntaxFailures.push(path + ": " + (error instanceof Error ? error.message : "Unknown JavaScript syntax error."));
      }
    }
    const syntaxValid = syntaxFiles.length > 0 && syntaxFailures.length === 0;
    add("JavaScript syntax", syntaxValid ? "pass" : "fail", syntaxValid
      ? syntaxFiles.length + " JavaScript file(s) parse without executing them."
      : syntaxFailures.slice(0, 5).join(" | ") || "No JavaScript source files were found.");
    const safetyFiles = Object.entries(files)
      .filter(([path, source]) => /\.(?:m?js|cjs)$/i.test(path) && typeof source === "string")
      .map(([path, content]) => ({ path, content }));
    const safety = analyzeProjectScripts(safetyFiles, { scopeChecks: true });
    const safetyDetails = [
      ...safety.errors.slice(0, 3).map(error => error.message),
      ...safety.fixes.slice(0, 2).map(fix => "Potential deterministic repair: " + fix)
    ];
    const safetyStatus = safety.errors.length ? "fail" : safety.repaired.length ? "warn" : "pass";
    add(
      "Runtime identifier safety",
      safetyStatus,
      safetyDetails.length
        ? safetyDetails.join(" | ")
        : "No obvious undeclared identifiers or uninitialized collections were detected by conservative static analysis. Runtime behavior still requires live testing."
    );
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
    if (!isAppSpec) {
      const gameRuntime = allJavaScript + "\n" + html;
      const hasOutcomeHooks = /\b(?:gameOver|gameover|victory|defeat|winState|lossState|isWon|isLost|isGameOver|onWin|onLose|finishGame|endGame|won|lost)\b/i.test(gameRuntime);
      const hasRestartHooks = /\b(?:restart|resetGame|startOver|playAgain|newGame)\b/i.test(gameRuntime);
      const hasPauseHooks = /\b(?:pause|paused|resume|isPaused|togglePause)\b/i.test(gameRuntime);
      add("Win / loss state hooks", hasOutcomeHooks ? "pass" : "warn", hasOutcomeHooks
        ? "Recognizable outcome-state code exists; actual win/loss behavior still needs playtesting."
        : "No obvious win/loss transition identifiers were found. Verify the declared outcome conditions in a real playthrough.");
      add("Restart / reset hooks", hasRestartHooks ? "pass" : "warn", hasRestartHooks
        ? "A recognizable restart/reset path exists; confirm it restores all relevant state."
        : "No obvious restart/reset path was found. Confirm the player can recover after winning or losing.");
      add("Pause / resume hooks", hasPauseHooks ? "pass" : "warn", hasPauseHooks
        ? "Recognizable pause/resume code exists; verify timers, audio and input stop/resume correctly."
        : "No obvious pause/resume path was found. Add one when it fits the game's design.");
    }
    setBuildReport({ checkedAt: now(), projectUpdatedAt: project.updatedAt, checkedDirty: fileDirty, checkedFile: project.activeFile, checkedEditorContent: editedFile, checks });
    addActivity("Build checks finished: " + checks.filter(check => check.status === "pass").length + " passed, " + checks.filter(check => check.status === "warn").length + " warnings, " + checks.filter(check => check.status === "fail").length + " failed.");
  }

  function saveStudioFiles(nextFiles: Record<string, string>, label: string) {
    if (!project) return;
    if (project.mode === "plan") {
      setNotice("Plan mode is read-only. Switch to Build mode before editing project manifests.");
      return;
    }
    const version: BuildVersion = {
      number: (project.versions[0]?.number || 0) + 1,
      label,
      files: { ...nextFiles },
      createdAt: now(),
      testSummary: "Studio manifest saved. Runtime integration and preview behavior still need verification."
    };
    const updatedProject = { ...project, files: nextFiles, activeFile: "game-spec.json", versions: [version, ...project.versions].slice(0, 8), updatedAt: now() };
    setProject(updatedProject);
    setEditedFile(nextFiles["game-spec.json"] || "{}");
    setFileDirty(false);
    setNotice("Saved " + label + " as version " + version.number + " in game-spec.json. Confirm runtime integration in preview.");
    setPreviewKey(n => n + 1);
    if (localAgentStatus === "connected" && localAgentToken) {
      void writeProjectToDisk(updatedProject, localAgentUrl, localAgentToken)
        .then(data => setNotice("Saved " + label + " v" + version.number + " and synced files to " + data.projectPath + ". Preview integration still needs testing."))
        .catch(error => setNotice("Scene data saved in GENE, but disk sync failed: " + (error instanceof Error ? error.message : "unknown error") + ". Use Sync files to retry."));
    }
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
      const html = standaloneDocument(project.files["game.html"] || "", title, cssName, jsName, buildRuntimeAssetBootstrap(project.files) + buildRuntimeSceneBootstrap(project.files) + buildRuntimeAudioBootstrap(project.files), moduleScriptPaths(project.files, projectKind));
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
      const mainHtml = standaloneDocument(project.files["game.html"] || "", title, cssName, jsName, buildRuntimeAssetBootstrap(project.files) + buildRuntimeSceneBootstrap(project.files) + buildRuntimeAudioBootstrap(project.files), moduleScriptPaths(project.files, projectKind));
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
    const mainHtml = standaloneDocument(project.files["game.html"] || "", projectTitle, cssName, jsName, buildRuntimeAssetBootstrap(project.files) + buildRuntimeSceneBootstrap(project.files) + buildRuntimeAudioBootstrap(project.files), moduleScriptPaths(project.files, projectKind));
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
      zip.file(prefix + "index.html", standaloneDocument(version.files["game.html"] || "", projectTitle + " v" + version.number, cssName, jsName, buildRuntimeAssetBootstrap(version.files) + buildRuntimeSceneBootstrap(version.files) + buildRuntimeAudioBootstrap(version.files), moduleScriptPaths(version.files, projectKind)));
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
  const targetLabel = project.projectIntent === "website" ? "Website" : project.projectIntent === "webapp" || project.preferredEngine === "webapp" ? "Web app" : project.projectIntent === "game-3d" || project.preferredEngine === "webgl3d" ? "3D game" : project.projectIntent === "game-2d" || project.preferredEngine === "canvas2d" ? "2D game" : project.kind === "app" ? "Web app" : "Auto target";
  const isSyncedToLocal = Boolean(localAgentStatus === "connected" && lastSyncedUpdatedAt && lastSyncedUpdatedAt === project.updatedAt);
  const reportIsCurrent = Boolean(buildReport && buildReport.projectUpdatedAt === project.updatedAt && (buildReport.checkedDirty ? fileDirty && buildReport.checkedFile === project.activeFile && buildReport.checkedEditorContent === editedFile : !fileDirty));
  const activeMessages = project.messages;
  const nav = [
    { id: "chat" as const, icon: "◉", label: "Chat" },
    { id: "projects" as const, icon: "▦", label: "Projects" },
    { id: "files" as const, icon: "▤", label: "Files" },
    { id: "tasks" as const, icon: "☷", label: "Plan & tasks" },
    { id: "assets" as const, icon: "◇", label: "Assets" },
    { id: "scene" as const, icon: "▧", label: "Scene Studio" },
    { id: "audio" as const, icon: "♫", label: "Audio Studio" },
    { id: "versions" as const, icon: "↺", label: "Versions" }
  ];

  return (
    <main className={"gene-app studio-v2 " + theme + (sidebarOpen ? "" : " sidebar-collapsed")} data-theme={theme} data-project-target={project.projectIntent || project.preferredEngine || "auto"}>
      <aside className="rail">
        <button className="brand" title="GENE home" onClick={() => setSection("chat")}><span className="brand-orbit"><GeneMark /></span></button>
        <button className="rail-item sidebar-toggle" title={sidebarOpen ? "Collapse project sidebar" : "Expand project sidebar"} aria-label={sidebarOpen ? "Collapse project sidebar" : "Expand project sidebar"} aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(value => !value)}><span>{sidebarOpen ? "◧" : "☷"}</span></button>
        <div className="rail-separator" />
        {nav.map(item => <button key={item.id} className={"rail-item " + (section === item.id ? "selected" : "")} title={item.label} aria-label={item.label} aria-current={section === item.id ? "page" : undefined} onClick={() => setSection(item.id)}><span aria-hidden="true">{item.icon}</span></button>)}
        <div className="rail-spacer" />
        <button className="rail-item" title="Switch theme" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}><span>{theme === "dark" ? "☼" : "☾"}</span></button>
        <button className="avatar" title="GENE Workspace"><GeneMark /></button>
      </aside>

      <aside className="project-sidebar">
        <div className="sidebar-head"><div><div className="eyebrow">WORKSPACE</div><div className="sidebar-title">GENE 2.0 Studio</div></div><button className="icon-button" title="New project" onClick={createNewProject}>＋</button></div>
        <button className="new-project-entry" title="Start one unified project. GENE identifies whether you want a game, website, or app from your brief." onClick={createNewProject}><span className="new-project-plus">＋</span><span>New project</span><span className="new-project-entry-hint">Ctrl/⌘ K</span></button>
        <details className="sidebar-disclosure workspace-tools">
          <summary><span>Project tools</span><span className="menu-caret">⌄</span></summary>
          <div className="sidebar-disclosure-content">
            <button className="import-project-button" onClick={loadPlayableDemo}>▶ Open playable demo</button>
            <input ref={projectImportRef} className="visually-hidden" type="file" accept=".zip,.gene.json,application/zip,application/json" onChange={importProject} />
            <button className="import-project-button" onClick={() => projectImportRef.current?.click()}>↥ Import project ZIP</button>
          </div>
        </details>
        <div className="sidebar-section-label">CURRENT PROJECT</div>
        <div className="project-card"><span className="project-dot" /><div className="project-name">{project.name}</div><small>{hasGame ? (project.kind === "app" ? "App source created" : "Playable source created") : "Design in progress"}</small><button className="project-delete" title="Delete this chat and project" onClick={() => deleteProject(project.id)}>×</button></div>
        {projects.filter(p => p.id !== project.id).length > 0 && <details className="sidebar-disclosure">
          <summary><span>Recent projects</span><span className="disclosure-count">{projects.filter(p => p.id !== project.id).length}</span></summary>
          <div className="sidebar-disclosure-content">
            {projects.filter(p => p.id !== project.id).slice(0, 5).map(p => <div key={p.id} className="recent-project-row"><button className="file-row" onClick={() => { setProject(p); setSection("chat"); setNotice(""); }}><span className="file-icon">◌</span><span>{p.name}</span></button><button className="recent-delete" title={"Delete " + p.name} onClick={() => deleteProject(p.id)}>×</button></div>)}
          </div>
        </details>}
        <details className="sidebar-disclosure file-disclosure">
          <summary><span>Project files</span><span className="disclosure-count">{Object.keys(project.files).length}</span></summary>
          <div className="sidebar-disclosure-content">
            {Object.keys(project.files).length > 0 && <input className="project-file-search" aria-label="Search project files" placeholder="Search files…" value={fileSearch} onChange={event => setFileSearch(event.target.value)} />}
            {Object.keys(project.files).length ? <ProjectFileTree nodes={buildProjectFileTree(Object.keys(project.files).filter(path => path.toLowerCase().includes(fileSearch.trim().toLowerCase())))} activeFile={section === "files" ? project.activeFile : ""} onSelect={path => { selectProjectFile(path); setSection("files"); }} /> : <div className="empty-sidebar">Files appear after your first build.</div>}
            {Object.keys(project.files).length > 0 && !Object.keys(project.files).some(path => path.toLowerCase().includes(fileSearch.trim().toLowerCase())) && <div className="empty-sidebar">No files match “{fileSearch}”.</div>}
            <button className="open-files-button" onClick={() => setSection("files")}>Open file workspace <span>↗</span></button>
          </div>
        </details>
        <div className="sidebar-bottom">
          <div className="connection-row"><span className={"status-dot " + (apiReady ? "online" : "offline")} />{apiReady === null ? "Connecting…" : apiReady ? "AI configured" : "AI service unavailable"}</div>
          <small>{apiReady ? (freeModels.length ? "Free backup models: " + freeModels.slice(0, 2).map(id => id.split("/").pop()).join(", ") : "Provider response is checked per request") : "Check provider configuration"}</small>
          <div className="agent-connection">
            <div className="connection-row"><span className={"status-dot " + (localAgentStatus === "connected" ? "online" : localAgentStatus === "error" ? "offline" : "")} />{localAgentStatus === "connected" ? "Local Agent connected" : localAgentStatus === "checking" ? "Checking Local Agent" : localAgentStatus === "error" ? "Local Agent error" : "Local Agent disconnected"}</div>
            {localAgentWorkspace && <small title={localAgentWorkspace}>{localAgentWorkspace}</small>}
            <button className="agent-connect-button" onClick={connectLocalAgent}>{localAgentStatus === "connected" ? "Agent settings" : "Connect Local Agent"}</button>
            {hasGame && localAgentStatus === "connected" && <button className="agent-connect-button" onClick={syncToLocalAgent} disabled={busy}>{isSyncedToLocal ? "Resync project files" : "Write project to disk"}</button>}
            {isSyncedToLocal && <button className="agent-connect-button" onClick={openLocalAgentGame}>{project.kind === "app" ? "Open disk-backed app ↗" : "Open disk-backed game ↗"}</button>}
          </div>
          <button className="about-link" onClick={() => setShowAbout(true)}><span>ⓘ</span> About GENE <span className="about-version">2.0</span></button>
        </div>
      </aside>

      <section className="main-column">
        <header className="topbar studio-topbar">
          <div className="breadcrumb studio-breadcrumb"><span className="studio-breadcrumb-brand">GENE 2.0</span><span className="crumb-slash">/</span><span className="studio-breadcrumb-section">Studio</span><span className="crumb-slash">/</span><strong title={project.name}>{project.name}</strong><span className="project-target-chip" title="Selected target is used by the planner and generator">{targetLabel}</span><button className="rename-project" title="Rename project" aria-label="Rename project" onClick={renameProject}>✎</button><span className="saved-pill"><span className="status-dot online" /> Saved locally</span></div>
          <div className="top-actions">
            
            <button type="button" className="mobile-new-project" title="Create a new project" aria-label="New project" onClick={createNewProject}>＋</button>
            <button type="button" className="mobile-preview-button" title="Open live preview in a focused workspace" onClick={() => { setPreviewOpen(true); setExpandedPreview(true); }} disabled={!hasGame}><span>▷</span><span>Live preview</span></button>
            <button className="top-play-button" title={project.kind === "app" ? "Open the current app in a separate tab" : "Play the current game in a separate tab"} aria-label="Open live preview" onClick={openFullscreenGame} disabled={!hasGame}><span>▷</span><span className="top-play-label">Preview</span></button>
            <details className="header-overflow-menu">
              <summary title="Project actions" aria-label="Open project actions"><span>···</span></summary>
              <div className="header-overflow-panel">
                <div className="overflow-menu-caption">PROJECT ACTIONS</div>
                <button className={"menu-action " + (isSyncedToLocal ? "synced" : "")} title="Write actual project files to your computer using GENE Local Agent" onClick={syncToLocalAgent} disabled={!hasGame || busy || buildInProgress || localAgentStatus === "checking"}><span>↥</span><span>{isSyncedToLocal ? "Synced to disk" : "Sync real project files"}</span></button>
                <button className="menu-action" title={publishConfigured ? "Publish a static web version through Vercel" : "Configure Vercel publishing credentials"} onClick={() => void publishProject()} disabled={!hasGame || busy || buildInProgress || publishBusy}><span>↗</span><span>{publishBusy ? "Publishing…" : publishConfigured ? "Publish project" : "Publish setup"}</span></button>
                <div className="overflow-build-row">
                  <label>Build target<select className="binary-target-select" aria-label="Binary build target" value={binaryTarget} onChange={e => setBinaryTarget(e.target.value as "both" | "windows" | "android")} disabled={binaryBuildBusy}><option value="both">EXE + APK</option><option value="windows">Windows EXE</option><option value="android">Android APK</option></select></label>
                  <button className="menu-build-button" title={binaryBuildConfigured ? "Compile an installer or APK on cloud build machines" : "Cloud builder needs one-time GitHub/Vercel setup"} onClick={() => void buildBinary(binaryTarget)} disabled={!hasGame || busy || buildInProgress || binaryBuildBusy}>{binaryBuildBusy ? "Building…" : binaryBuildConfigured ? "Build" : "Build setup"}</button>
                </div>
                <button className="menu-action" title="Download the actual source files as a project ZIP" onClick={downloadProject} disabled={packageProgress !== null}><span>↓</span><span>{packageProgress !== null ? "Packing " + packageProgress + "%" : "Export project ZIP"}</span></button>
                <button className="menu-action" title="Open live preview in an expanded workspace" onClick={() => { setPreviewOpen(true); setExpandedPreview(true); }} disabled={!hasGame}><span>⛶</span><span>Expand preview</span></button>
              </div>
            </details>
          </div>
        </header>

        {notice && <div className={"notice " + noticeTone(notice)} role={noticeTone(notice) === "notice-error" ? "alert" : "status"}><span><NoticeText text={notice} />{publishedUrl && <> <a href={publishedUrl} target="_blank" rel="noreferrer">Open published site ↗</a><button className="copy-publish-link" onClick={() => { if (!navigator.clipboard) { setNotice("Clipboard is unavailable here. Copy this link: " + publishedUrl); return; } void navigator.clipboard.writeText(publishedUrl).then(() => setNotice("Published link copied to clipboard.")).catch(() => setNotice("Could not access the clipboard. Copy this link: " + publishedUrl)); }}>Copy link</button></>}</span>{(runtimeState === "error" || /preview.*runtime error|could not confirm a visible game frame/i.test(notice)) && hasGame && <button onClick={() => { runtimeRefreshAttempts.current = 0; setPreviewOpen(true); setPreviewKey(value => value + 1); setRuntimeState("loaded"); setNotice("Refreshing live preview…"); }}>Refresh preview ↻</button>}<button onClick={() => { setNotice(""); setPublishedUrl(""); }}>Dismiss</button></div>}
        {persistenceWarning && <div className="notice persistence-warning" role="status" aria-live="polite"><span>{persistenceWarning}</span><button onClick={() => setPersistenceWarning("")}>Dismiss</button></div>}

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
                <div className="pinned-plan-copy"><div className="pinned-plan-label">PROJECT PLAN <span>· {project.plan.engine === "canvas2d" ? "2D" : project.plan.engine === "webgl3d" ? "3D" : "WEB APP"}</span></div><strong>{project.plan.title}</strong><p>{project.plan.summary}</p></div>
                <div className="pinned-plan-progress">{project.buildRun ? <><strong>{project.buildRun.tasks.filter(task => task.status === "passed").length}/{project.buildRun.tasks.length}</strong><small>tasks passed</small></> : <><strong>{project.plan.tasks.length}</strong><small>planned tasks</small></>}</div>
                <button type="button" onClick={() => setSection("tasks")}>Open plan ↗</button>
              </div>}
              <div className="conversation-scroll">
                {!project.initialPrompt && project.messages.length < 2 && <div className="welcome-block studio-welcome">
                  <div className="welcome-orbit"><GeneMark /><i /><b /></div>
                  <div className="eyebrow welcome-eyebrow"><span className="welcome-eyebrow-dot" /> IDEAS, BROUGHT TO LIFE</div>
                  {project.kind === "app" ? <h1>From idea<br /><em>to something real.</em></h1> : <h1>Make your next<br /><em>great game.</em></h1>}
                  <p className="welcome-description">{project.kind === "app" ? "Describe the product you have in mind. Shape the experience together, build real source files, and refine the result in the live workspace." : "Bring a game idea. GENE helps shape the design, builds the actual project files, and gives you a live place to test and refine."}</p>
                  <div className="starter-grid studio-starter-grid">
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
                {activeMessages.map(msg => <div key={msg.id} className={"message-row studio-message-row " + msg.role + (msg.kind ? " kind-" + msg.kind : "")}>
                  {msg.role !== "user" && <div className="message-avatar">{msg.role === "system" ? "•" : "G"}</div>}
                  <div className="message-content">
                    {msg.role === "user" ? <div className="user-bubble">{msg.content}</div> : <div className="assistant-copy">{msg.content}</div>}
                    {msg.research && <ResearchCard bundle={msg.research} onImportImage={importResearchImage} />}
                    {msg.changes && msg.changes.length > 0 && <div className="change-list" aria-label="Files changed by this request">{msg.changes.map(change => <button type="button" key={change.path} className={"change-row " + change.status} title="Open this file" onClick={() => { setProject(current => current ? { ...current, activeFile: change.path } : current); setSection("files"); }}><span className="change-path">{change.path}</span><span className="change-stat">{change.status === "removed" ? "removed" : <><b>+{change.added}</b> <i>−{change.removed}</i></>}</span></button>)}</div>}
                    {msg.kind === "error" && <div className="message-recovery">
                      <div className="inline-error">Your last saved files are preserved.</div>
                      {msg.retry && classifyFailure(msg.content, "").autoFix && <button className="retry-message-button" onClick={() => void runAgent(msg.retry!.prompt + retryGuidance(classifyFailure(msg.content, "").kind, msg.content, 1), msg.retry!.operation)} disabled={busy || buildInProgress || parallelChatInProgress} title="Retry and tell GENE exactly what failed so it fixes that problem"><span aria-hidden="true">✦</span> Fix automatically</button>}
                      {msg.retry && <button className="retry-message-button" onClick={() => void runAgent(msg.retry!.prompt, msg.retry!.operation)} disabled={busy || buildInProgress || parallelChatInProgress} title="Retry this request using the latest saved project and build checkpoint"><span aria-hidden="true">↻</span> Retry request</button>}
                    </div>}
                  </div>
                </div>)}
                {project.question && <InterviewCard
                  key={project.question.id}
                  question={project.question}
                  busy={busy}
                  onAnswer={answer => void runAgent(answer)}
                  onDefault={() => { if (project) void runAgent("Use your recommended smart default for this decision."); }}
                  onSkip={startBuild}
                />}
                {/* The plan lives in the pinned workspace header and Tasks view, never as a moving chat message. */}
                {(busy || buildInProgress || queuedRequestCount > 0) && !(liveRun && !buildInProgress && queuedRequestCount === 0) && <div className="working-row"><span className="spinner" /><div><strong>{buildInProgress ? "Building your project" : queuedRequestCount ? "Requests queued" : project.mode === "plan" ? "Planning with the configured AI" : "Working with the configured AI"}</strong><small>{queuedRequestCount ? queuedRequestCount + " request(s) queued in order." : (liveRun && !buildInProgress ? "“" + liveRun.prompt.slice(0, 90) + (liveRun.prompt.length > 90 ? "…”" : "”") : operationText(project.mode, hasGame))}{buildInProgress && canQueueBuildRequests ? " · Existing preview remains available." : ""}</small></div><button title="Show the real activity log" aria-expanded={showActivity} onClick={() => setShowActivity(!showActivity)}>{showActivity ? "Hide log" : "Activity ↗"}</button></div>}
                {liveRun && !buildInProgress && <LiveRunPanel run={liveRun} logOpen={showActivity} onToggleLog={() => setShowActivity(value => !value)} />}
                {buildInProgress && project.buildRun && <div className="real-progress-panel" role="status" aria-live="polite">
                  <div className="real-progress-heading"><span>BUILD PROGRESS</span><strong>{project.buildRun.tasks.filter(task => task.status === "passed").length}/{project.buildRun.tasks.length} steps verified</strong><b>{project.buildRun.tasks.length ? Math.round(project.buildRun.tasks.filter(task => task.status === "passed").length / project.buildRun.tasks.length * 100) : 0}%</b></div>
                  {(project.plan?.title || project.initialPrompt) && <div className="real-progress-ask">Building: {(project.plan?.title || project.initialPrompt || "").slice(0, 120)}</div>}
                  <div className="real-progress-track"><span style={{ width: (project.buildRun.tasks.length ? project.buildRun.tasks.filter(task => task.status === "passed").length / project.buildRun.tasks.length * 100 : 0) + "%" }} /></div>
                  <div className="real-progress-current"><span className="real-progress-current-dot" /><div><small>{project.buildRun.tasks.some(task => task.status === "running") ? "WORKING NOW" : project.buildRun.tasks.some(task => task.status === "failed") ? "RECOVERY NEEDED" : "UP NEXT"}</small><strong>{(project.buildRun.tasks.find(task => task.status === "running") || project.buildRun.tasks.find(task => task.status === "failed") || project.buildRun.tasks.find(task => task.status === "queued"))?.title || "Finishing and validating the project"}</strong><small className="real-progress-current-files">{(project.buildRun.tasks.find(task => task.status === "running") || project.buildRun.tasks.find(task => task.status === "failed") || project.buildRun.tasks.find(task => task.status === "queued"))?.files?.join(" · ") || "Checking the assembled project"}</small></div></div>
                  <details className="real-progress-details">
                    <summary>Show all steps <span>{project.buildRun.tasks.filter(task => task.status === "passed").length} verified · {project.buildRun.tasks.filter(task => task.status === "queued" || task.status === "running").length} remaining</span></summary>
                    <div className="real-progress-tasks">{project.buildRun.tasks.map(task => <div key={task.id} className={"real-progress-task " + task.status}><span>{task.status === "passed" ? "✓" : task.status === "running" ? "↻" : task.status === "failed" ? "!" : task.status === "blocked" ? "×" : "·"}</span><strong>{task.title}</strong><small>{task.status}{task.files.length ? " · " + task.files.join(", ") : ""}{typeof task.attempts === "number" && task.attempts > 0 ? " · " + task.attempts + " attempt(s)" : ""}</small></div>)}</div>
                  </details>
                  <p>Live status from GENE&apos;s build coordinator. The current step stays visible; the rest remain hidden until you open the details.</p>
                </div>}
                {showActivity && activity.length > 0 && <div className="activity-list">{activity.map(line => <div key={line}>{line}</div>)}</div>}
                <div ref={chatEnd} />
              </div>
              <form className="composer studio-composer" onSubmit={onSubmit} onDragOver={event => { if (Array.from(event.dataTransfer.types).includes("Files")) event.preventDefault(); }} onDrop={event => { if (Array.from(event.dataTransfer.types).includes("Files")) { event.preventDefault(); void addReferenceFiles(Array.from(event.dataTransfer.files || [])); } }}>
                <div className="composer-context-label"><span className="composer-context-dot" /> {interactionMode === "chat" ? "Chat with GENE" : interactionMode === "plan" ? "Plan your project" : "Build and edit"}<span className="composer-context-hint">{interactionMode === "chat" ? "Ideas, questions, and edits" : interactionMode === "plan" ? "Shape scope before building" : "Apply changes to real files"}</span></div>
                <div className="composer-toolbar">
                  <div className="composer-mode-switch" role="group" aria-label="Conversation mode">
                    <button type="button" className={interactionMode === "chat" ? "active" : ""} aria-pressed={interactionMode === "chat"} onClick={() => setInteractionMode("chat")}><span>◌</span> Chat</button>
                    <button type="button" className={interactionMode === "plan" ? "active" : ""} aria-pressed={interactionMode === "plan"} onClick={() => { setInteractionMode("plan"); setProject({ ...project, mode: "plan" }); }}><span>☷</span> Plan</button>
                    <button type="button" className={interactionMode === "build" ? "active" : ""} aria-pressed={interactionMode === "build"} onClick={() => { setInteractionMode("build"); setProject({ ...project, mode: "build" }); }}><span>⌘</span> Build</button>
                  </div>
                  <details className="composer-tools-menu composer-options">
                    <summary title="More tools" aria-label="More composer tools"><span>···</span></summary>
                    <div className="composer-tools-menu-panel" onClick={event => { if ((event.target as HTMLElement).closest("button")) (event.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open"); }}>
                      <div className="overflow-menu-caption">TOOLS</div>
                      <button type="button" className="menu-action" title="Improve the draft prompt without starting a build" onClick={enhanceDraftPrompt} disabled={!draft.trim() || enhancingPrompt || busy}><span>✦</span><span>{enhancingPrompt ? "Enhancing…" : "Enhance prompt"}</span></button>
                      <button type="button" className={"menu-action " + (extendedPlanning ? "synced" : "")} aria-pressed={extendedPlanning} title="Ask additional planning questions and expand architecture and test gates." onClick={() => setExtendedPlanning(value => !value)}><span>☷</span><span>{extendedPlanning ? "Deep planning on" : "Deep planning"}</span></button>
                      <button type="button" className={"menu-action " + (searchMode ? "synced" : "")} aria-pressed={searchMode} onClick={() => setSearchMode(value => !value)}><span>⌕</span><span>{searchMode ? "Turn research off" : "Research the web"}</span></button>
                    </div>
                  </details>
                </div>
                {interactionMode === "plan" && <div className="composer-options plan-intent-switch" role="group" aria-label="Planning intent">
                  <button type="button" className={planIntent === "create" ? "tool-active" : ""} aria-pressed={planIntent === "create"} onClick={() => setPlanIntent("create")}><span>＋</span> New plan</button>
                  <button type="button" className={planIntent === "update" ? "tool-active" : ""} aria-pressed={planIntent === "update"} onClick={() => { setPlanIntent("update"); if (project.question) setProject({ ...project, question: null }); }}><span>↻</span> Update plan</button>
                </div>}
                {(project.references || []).length > 0 && <div className="reference-chips">{project.references.map(ref => <div key={ref.id} className="reference-chip"><span>{ref.kind === "image" ? "▧" : "▤"}</span><span title={ref.name}>{ref.name}</span><button type="button" title={"Remove " + ref.name} onClick={() => removeReference(ref.id)}>×</button></div>)}</div>}
                <textarea value={draft} onChange={e => { setDraft(e.target.value); e.currentTarget.style.height = "auto"; e.currentTarget.style.height = (e.currentTarget.value ? Math.min(e.currentTarget.scrollHeight, 128) : 46) + "px"; }} onPaste={pasteReferenceImages} placeholder={interactionMode === "chat" ? "Ask anything. Paste an image or drop files here…" : interactionMode === "plan" ? (planIntent === "update" ? "Describe what to update, fix, or add to this project… (paste an image or drop files)" : "Describe what you want to create… (paste an image or drop files)") : hasGame ? "Describe the change… (paste an image or drop files)" : "Describe the app or game… (paste an image or drop files)"} rows={1} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (draft.trim() && (!busy || canQueueBuildRequests)) void runAgent(draft); } }} />
                <input ref={referenceInputRef} className="visually-hidden" type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif,.txt,.md,.json,.js,.ts,.css,.gd,.html" onChange={addReferences} />
                <div className="composer-bottom"><div className="composer-tools composer-quick-tools">
                    <button type="button" className="icon-only-tool" title="Attach reference images, documentation, or source files" aria-label="Attach reference files" onClick={() => referenceInputRef.current?.click()}>＋</button>
                    <select className="thinking-select composer-thinking" value={project.thinking} aria-label="GENE model and reasoning mode" title="GENE Fast: quickest. Thinking: balanced reasoning. GENE BH (Black Hole): strongest, slower reasoning. Native: no external AI calls." onChange={e => setProject({ ...project, thinking: e.target.value as Thinking })}>
                      <option value="native">Gene Native · no external AI</option><option value="fast">GENE Fast</option><option value="balanced">Thinking</option><option value="deep">GENE BH</option>
                    </select>
                    <button type="button" className="icon-only-tool" title={project.visualResearch === false ? "Automatic visual research is off for this project" : "Automatic visual research is on for this project"} aria-label={project.visualResearch === false ? "Enable automatic visual research" : "Disable automatic visual research"} aria-pressed={project.visualResearch !== false} onClick={() => setProject(current => current ? { ...current, visualResearch: current.visualResearch === false ? true : false, updatedAt: now() } : current)}>{project.visualResearch === false ? "Research off" : "Research on"}</button><span className="key-hint">Drop files or paste an image · Enter to send</span>
                  </div>{(busy || buildInProgress || parallelChatInProgress) && <button type="button" className="icon-only-tool" title="Stop current AI work and clear queued requests" aria-label="Stop current AI work" onClick={stopActiveRun}>■</button>}<button className="send-button" type="submit" aria-label={buildInProgress && canQueueBuildRequests ? "Queue request" : "Send message"} disabled={(busy && !canQueueBuildRequests) || !draft.trim()}>{buildInProgress && canQueueBuildRequests ? "Queue" : busy ? "Working…" : "Send"} <span>↑</span></button></div>
              </form>
            </>}

            {section === "projects" && <ProjectGallery projects={projects} currentProjectId={project.id} onOpen={selected => { setProject(selected); setSection("chat"); setNotice(""); setPreviewKey(value => value + 1); setRuntimeState("idle"); }} onCreate={createNewProject} />}
            {section === "files" && <div className="tool-view">
              <div className="tool-view-heading"><div className="eyebrow">SOURCE CONTROL</div><h2>Project files</h2><p>These are the actual files saved with this project in this browser.</p></div>
              {!Object.keys(project.files).length ? <><div className="empty-state">{project.kind === "app" ? "No source files yet. Describe the app, review the plan, then switch to Build mode to generate the real interface." : "No source files yet. Plan the game, then switch to Build mode and ask GENE to build it."}</div><div className="file-ops-toolbar"><button type="button" onClick={createProjectFile} disabled={project.mode === "plan" || busy}>＋ New file</button></div></> : <><div className="file-ops-toolbar"><button type="button" onClick={createProjectFile} disabled={project.mode === "plan" || busy}>＋ New file</button><button type="button" onClick={moveOrRenameProjectFile} disabled={project.mode === "plan" || busy || !Object.prototype.hasOwnProperty.call(project.files, project.activeFile)}>Move / rename</button><button type="button" onClick={deleteProjectFile} disabled={project.mode === "plan" || busy || !Object.prototype.hasOwnProperty.call(project.files, project.activeFile)}>Delete file</button></div><div className="file-tree-layout"><ProjectFileTree nodes={buildProjectFileTree(Object.keys(project.files))} activeFile={project.activeFile} onSelect={selectProjectFile} /><div className="file-editor-main"><div className="file-editor-header"><div className="file-editor-path"><span className="file-editor-type">{(project.activeFile.split(".").pop() || "txt").slice(0,4).toUpperCase()}</span><span title={project.activeFile}>{project.activeFile}</span></div><div className="file-editor-state"><span className={"file-editor-dot" + (fileDirty ? " dirty" : "")} />{fileDirty ? "Unsaved" : "Saved"}</div></div><textarea aria-label={"Edit " + project.activeFile} className="code-editor" spellCheck={false} value={editedFile} onChange={e => { setEditedFile(e.target.value); setFileDirty(true); }} /><div className="editor-footer"><span>{fileDirty ? "Unsaved editor changes" : "Saved in local project state"} · {editedFile.length.toLocaleString()} characters</span><button className="primary-button" onClick={saveManualEdit} disabled={!fileDirty || project.mode === "plan"}>{project.mode === "plan" ? "Build mode required" : "Save as version"}</button></div></div></div></>}
            </div>}

            {section === "tasks" && <div className="tool-view">
              <div className="tool-view-heading"><div className="eyebrow">PLANNING & QUALITY</div><h2>Plan & tasks</h2><p>{project.kind === "app" ? "Review the scope, run source/runtime checks, then exercise the app flows and forms that matter." : "Review scope, run source/runtime smoke checks, then play the game to verify the mechanics that matter."}</p></div>
              {designDoc && <DesignDocPanel doc={designDoc} isApp={isApp} />}
              {project.buildRun && <div className="build-check-panel">
                <div className="build-check-head"><div><div className="eyebrow">GENE BUILD SYSTEM</div><h3>Build checkpoints</h3><p>Prototype target: {project.buildRun.prototype?.targetMinutes ? "~" + project.buildRun.prototype.targetMinutes + " min" : "project-specific estimate pending"} · Full-game target: {project.buildRun.fullGame?.targetMinutes ? "~" + project.buildRun.fullGame.targetMinutes + " min" : "project-specific estimate pending"}</p></div><span className={"check-status " + (project.livingPreview?.status === "error" ? "fail" : project.livingPreview?.status === "playable" ? "pass" : "warn")}>{project.livingPreview?.status === "playable" ? "Gameplay verified" : project.livingPreview?.status === "rendered" ? "Preview visible · verify gameplay" : project.livingPreview?.status === "error" ? "Runtime error" : "Checking preview"}</span></div>
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

            {section === "audio" && <AudioStudio
              files={project.files}
              readOnly={project.mode === "plan"}
              onSave={saveStudioFiles}
            />}

            {section === "scene" && (isApp ? <div className="tool-view app-visual-editor-info">
              <div className="tool-view-heading"><div className="eyebrow">APP DESIGN WORKSPACE</div><h2>Visual layout</h2><p>This project is a web app, so it uses responsive DOM layouts rather than a 2D/3D game scene. Open source files or ask GENE to adjust its screens while preserving project type.</p></div>
              <div className="app-editor-choice-grid"><button className="app-editor-choice" onClick={() => setSection("files")}><span>⌘</span><strong>Edit source files</strong><small>Inspect the actual HTML, CSS and JavaScript.</small></button><button className="app-editor-choice" onClick={() => { setSection("chat"); setDraft("Inspect the current app UI and improve its responsive layout, spacing, colors and accessibility while preserving its existing workflows. Make the change in the real project files and validate the main interactions."); }}><span>✦</span><strong>Prepare a UI redesign</strong><small>Start a focused change request in project chat.</small></button></div>
            </div> : <SceneStudio
              files={project.files}
              engine={project.plan?.engine || project.preferredEngine || "canvas2d"}
              readOnly={project.mode === "plan"}
              onSave={saveStudioFiles}
              onWireRuntime={prompt => { setSection("chat"); setDraft(prompt); setNotice("Prepared a request to integrate the scene manifest into the actual runtime. Review it in Chat and send it to apply."); }}
            />)}

            {section === "assets" && <div className="g3-scroll">
{designDoc ? <ArtStudio files={project.files} doc={designDoc} isApp={isApp} apiReady={apiReady} onAddFiles={addProjectFiles} onResearchNote={addResearchNote} onPrepareIntegration={prompt => { setSection("chat"); setDraft(prompt); setNotice("Prepared an integration request. Review it in Chat and send it to apply."); }} /> : <div className="tool-view"><div className="tool-view-heading"><div className="eyebrow">FREE ART STUDIO</div><h2>Illustrations, research and assets</h2><p>Finish the short project interview (or start a plan) first. GENE uses your answers to pick an art direction, then draws matching illustrations for free.</p></div></div>}
<div className="tool-view forge-view">
  <div className="tool-view-heading">
    <div className="eyebrow">GENE FORGE · REAL MESH FILES</div>
    <h2>Asset workshop</h2>
    <p>Create a 3D OBJ/MTL mesh or native procedural 2D SVG artwork. GENE validates the generated files and saves them in this project; inserting an asset into a playable scene remains a separate, testable step.</p>
  </div>
  <div className="forge-form">
    <div className="forge-form-top">
      <label>Asset format<select value={forgeMode} onChange={e => { setForgeMode(e.target.value as typeof forgeMode); setForgeTargetId(null); }}><option value="3d">3D mesh · OBJ/MTL</option><option value="2d">2D artwork · SVG</option></select></label>
      {forgeMode === "3d" ? <label>Asset type<select value={forgeKind} onChange={e => setForgeKind(e.target.value as typeof forgeKind)}><option value="prop">Prop</option><option value="character">Character</option><option value="vehicle">Vehicle</option><option value="building">Building</option><option value="environment">Environment</option><option value="weapon">Weapon</option></select></label> : <label>2D asset type<select value={forge2DKind} onChange={e => setForge2DKind(e.target.value as typeof forge2DKind)}><option value="character">Character sprite sheet</option><option value="tileset">Tileset</option><option value="ui">UI panels and buttons</option><option value="background">Background</option><option value="icon">Icon</option></select></label>}
      <label>Detail budget<select value={forgeQuality} onChange={e => setForgeQuality(e.target.value as typeof forgeQuality)}><option value="performance">Performance · up to 32 parts</option><option value="standard">Standard · up to 54 parts</option><option value="high">High detail · up to 76 parts</option></select></label>
    </div>
    {forgeMode === "3d" && forgeTargetId && <div className="forge-editing"><span className="status-dot online" /> Editing the saved asset <strong>{savedAssets.find(asset => asset.id === forgeTargetId)?.name || forgeTargetId}</strong><button onClick={() => { setForgeTargetId(null); setForgePrompt(""); setForgeNotice(""); }}>Create new asset instead</button></div>}
    <textarea className="forge-prompt" value={forgePrompt} onChange={e => setForgePrompt(e.target.value)} placeholder={forgeMode === "2d" ? "Describe the artwork — e.g. a four-frame cartoon skeleton sprite sheet, a city road tileset, or a clean game menu panel." : forgeTargetId ? "Describe the changes to this exact mesh — e.g. make the wheels larger, lower the cabin, and add protective side panels." : "Describe the mesh — e.g. a compact metro maintenance rover with four chunky wheels, a sloped glass cabin, protective bumpers, yellow safety markings and a coherent industrial silhouette."} rows={3} />
    <div className="forge-form-bottom"><span>{forgeMode === "2d" ? "Native procedural vector generation · no external image model required" : apiReady ? "AI connected · mesh generation uses the selected model" : "Connect GENE to enable AI-powered 3D asset generation"}</span><button className="primary-button" onClick={() => void (forgeMode === "2d" ? generateForge2DAsset() : generateForgeAsset())} disabled={forgeBusy || !forgePrompt.trim() || (forgeMode === "3d" && apiReady !== true)}>{forgeBusy ? <><span className="spinner small-spinner" /> Generating {forgeMode === "2d" ? "artwork" : "mesh"}…</> : forgeMode === "2d" ? "Generate 2D artwork" : forgeTargetId ? "Apply mesh edits" : "Generate 3D mesh"} <span>↗</span></button></div>
    {forgeNotice && <div className="forge-notice">{forgeNotice}</div>}
  </div>
  {saved2DAssets.length > 0 && <><div className="forge-assets-heading"><div><div className="eyebrow">2D PROJECT ASSETS</div><h3>Saved artwork <span>{saved2DAssets.length}</span></h3></div><span>SVG · JSON manifest</span></div><div className="forge-asset-grid">{saved2DAssets.map(asset => <article className="forge-asset-card" key={asset.id}><div className="forge-asset-card-title"><div><strong>{asset.name}</strong><small>{asset.kind} · {asset.width}×{asset.height} · {asset.frames} frame(s)</small></div><button className="icon-button" title="Remove this 2D asset" onClick={() => removeForgeAsset(asset.id)}>×</button></div><div className="forge-2d-preview"><img alt={asset.name + " generated vector artwork"} src={"data:image/svg+xml;charset=utf-8," + encodeURIComponent(project.files[asset.svgPath] || "")} /></div><div className="forge-asset-actions"><button className="primary-button" onClick={() => { setSection("chat"); setDraft("Integrate the generated 2D asset at " + asset.svgPath + " into the actual playable game. Read its manifest at " + asset.manifestPath + ". The isolated runtime exposes the SVG through window.GENE_ART.list(), window.GENE_ART.image(path), and window.GENE_ART.draw(ctx,path,x,y,w,h); use these helpers or a verified equivalent. Use the correct asset kind (" + asset.kind + "), preserve current controls and responsive layout, and crop sprite-sheet frames when needed. Do not claim integration until the live preview visibly uses the saved SVG and a browser test passes."); setNotice("Prepared a specific 2D asset integration request for " + asset.name + ". Review it in Chat and send it to apply."); }}>Integrate into game</button><button className="secondary-button" onClick={() => downloadAssetFile(asset.svgPath)}>SVG ↓</button><button className="secondary-button" onClick={() => downloadAssetFile(asset.manifestPath)}>Manifest ↓</button></div></article>)}</div></>}
  {savedResearchImages.length > 0 && <><div className="forge-assets-heading"><div><div className="eyebrow">RESEARCH REFERENCES</div><h3>Imported images <span>{savedResearchImages.length}</span></h3></div><span>PNG · JPEG · WebP · source manifest</span></div><div className="forge-asset-grid">{savedResearchImages.map(asset => <article className="forge-asset-card" key={asset.id}><div className="forge-asset-card-title"><div><strong>{asset.name}</strong><small>{asset.license}{asset.attribution ? " · " + asset.attribution : ""}</small></div><button className="icon-button" title="Remove this imported reference" onClick={() => removeForgeAsset(asset.id)}>×</button></div><div className="forge-2d-preview"><img alt={asset.name + " imported research reference"} src={project.files[asset.imagePath]} /></div><div className="forge-asset-actions"><button className="secondary-button" onClick={() => downloadAssetFile(asset.imagePath)}>Image ↓</button><button className="secondary-button" onClick={() => downloadAssetFile(asset.manifestPath)}>Source manifest ↓</button>{asset.sourcePage && <a className="secondary-button" href={asset.sourcePage} target="_blank" rel="noreferrer noopener">Open source ↗</a>}</div><small className="rc-dim">Reference asset only; not automatically applied as a texture.</small></article>)}</div></>}
  <div className="forge-assets-heading"><div><div className="eyebrow">PROJECT ASSETS</div><h3>Saved meshes <span>{savedAssets.length}</span></h3></div><span>OBJ · MTL · JSON recipe</span></div>
  {savedAssets.length === 0 ? <div className="empty-state forge-empty"><div className="asset-symbol">◇</div><strong>No generated meshes yet</strong><p>Start with a prop, vehicle, character, weapon, or building. A successful result creates real files under <code>assets/&lt;asset-id&gt;/</code>. Mesh generation is not the same thing as importing it into a game scene; integration is a separate, testable change.</p></div> : <div className="forge-asset-grid">
    {savedAssets.map(asset => <article className="forge-asset-card" key={asset.id}>
      <div className="forge-asset-card-title"><div><strong>{asset.name}</strong><small>{asset.kind} · {asset.style}</small></div><button className="icon-button" title="Remove this asset from the project" onClick={() => removeForgeAsset(asset.id)}>×</button></div>
      {project.files[asset.objPath] ? <ObjViewport obj={project.files[asset.objPath]} mtl={project.files[asset.mtlPath] || ""} label={asset.name} /> : <div className="forge-missing-mesh">OBJ file missing</div>}
      <div className="forge-asset-stats"><span>{asset.partCount} parts</span><span>{asset.triangleCount.toLocaleString()} triangles</span></div>
      <div className="forge-asset-actions"><button className="primary-button" onClick={() => { setForgeTargetId(asset.id); setForgeKind((["character","vehicle","building","environment","prop","weapon"].includes(asset.kind) ? asset.kind : "prop") as typeof forgeKind); setForgePrompt(""); setForgeNotice("You are editing the same saved recipe. Describe the changes you want; GENE will generate a new version of this mesh."); }}>Edit with AI</button><button className="secondary-button" onClick={() => { setSection("chat"); setDraft("Integrate the saved 3D asset \""+asset.name.replace(/["\\]/g,"")+"\": use "+asset.objPath+" and "+asset.mtlPath+" from the project files. Load it into the actual playable scene at an appropriate scale and position, assign its material, add appropriate collision if needed, and connect its gameplay role. Preserve existing controls and features. Do not create a substitute primitive or claim integration until the asset is visibly present in the preview."); setNotice("Prepared a scene-integration request for "+asset.name+". Review it in Chat and send it to apply the change."); }}>Integrate into game</button><button className="secondary-button" onClick={() => downloadAssetFile(asset.objPath)}>OBJ ↓</button><button className="secondary-button" onClick={() => downloadAssetFile(asset.mtlPath)}>MTL ↓</button></div>
    </article>)}
  </div>}
</div></div>}{section === "versions" && <div className="tool-view"><div className="tool-view-heading"><div className="eyebrow">RECOVERY</div><h2>Versions</h2><p>Every successful source-changing response creates a local snapshot. Restoring creates another snapshot, so history stays intact.</p></div>{project.versions.length ? <div className="version-list">{project.versions.map(version => <div key={version.number} className="version-item"><div className="version-number">v{String(version.number).padStart(3, "0")}</div><div className="version-meta"><strong>{version.label}</strong><small>{new Date(version.createdAt).toLocaleString()} · {Object.keys(version.files).length} files</small><p>{version.testSummary}</p></div><button className="secondary-button" onClick={() => restoreVersion(version)}>Restore</button></div>)}</div> : <div className="empty-state">No versions yet. A version is created when GENE returns files or you save a manual edit.</div>}</div>}
          </section>

          {previewOpen ? <aside className={"preview-panel" + (expandedPreview ? " expanded" : "")}>
            <div className="preview-header"><div className="preview-title"><span className="live-dot" /><div><strong>Live preview</strong><small>{hasGame ? runtimeLabel(runtimeState) : "Waiting for first build"}</small></div></div><div className="preview-actions"><button type="button" className={"preview-icon-action " + (customEditMode ? "tool-active" : "")} aria-pressed={customEditMode} title="Select an element in the live preview to prepare an edit request" aria-label="Select in preview to edit" disabled={!hasGame} onClick={() => { setCustomEditMode(value => !value); setNotice(customEditMode ? "Preview selection cancelled." : "Select an element in the live preview. GENE will prepare a specific edit request for you to review."); }}>⌖</button><button title="Minimize preview" onClick={() => { setPreviewOpen(false); setExpandedPreview(false); setCustomEditMode(false); }}>–</button><button title={runtimeState === "error" ? "Refresh preview after an error" : "Refresh preview"} onClick={() => { setPreviewKey(n => n + 1); setRuntimeState("idle"); setCustomEditMode(false); }}>↻</button><button title="Open fullscreen game" disabled={!hasGame} onClick={openFullscreenGame}>⛶</button></div></div>
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
      {showNewProjectDialog && <div className="create-project-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setShowNewProjectDialog(false); }}>
        <section className="create-project-dialog" role="dialog" aria-modal="true" aria-labelledby="create-project-title">
          <button type="button" className="create-project-close" aria-label="Close new project dialog" onClick={() => setShowNewProjectDialog(false)}>×</button>
          <div className="create-project-heading"><span className="create-project-mark"><GeneMark /></span><div><div className="eyebrow">NEW WORKSPACE</div><h2 id="create-project-title">What are we building?</h2><p>Choose the starting engine. GENE will carry it into planning, code generation and the editor.</p></div></div>
          <div className="create-project-grid">
            <button type="button" className="create-project-option" onClick={() => startNewProject("game", "canvas2d", "game-2d")}><span className="create-project-option-icon">2D</span><strong>2D game</strong><small>Platformers, top-down adventures, arcade and local co-op.</small><span className="create-project-option-footer">CANVAS 2D <b>→</b></span></button>
            <button type="button" className="create-project-option" onClick={() => startNewProject("game", "webgl3d", "game-3d")}><span className="create-project-option-icon">3D</span><strong>3D game</strong><small>Spatial worlds, camera movement, lighting and depth.</small><span className="create-project-option-footer">WEBGL 3D <b>→</b></span></button>
            <button type="button" className="create-project-option" onClick={() => startNewProject("app", "webapp", "website")}><span className="create-project-option-icon">WEB</span><strong>Website</strong><small>Landing pages, portfolios, content sites and storefronts.</small><span className="create-project-option-footer">CONTENT-LED WEB <b>→</b></span></button>
            <button type="button" className="create-project-option" onClick={() => startNewProject("app", "webapp", "webapp")}><span className="create-project-option-icon">APP</span><strong>Web app</strong><small>Tools, dashboards, data entry and multi-step user workflows.</small><span className="create-project-option-footer">INTERACTIVE PRODUCT <b>→</b></span></button>
          </div>
          <button type="button" className="create-project-auto" onClick={() => startNewProject("game", undefined, "auto")}>Let GENE decide from my description <span>Start with a blank brief →</span></button>
          <div className="create-project-key-hint"><kbd>Esc</kbd> to close <span>·</span> <kbd>Ctrl</kbd> / <kbd>⌘</kbd> + <kbd>K</kbd> to reopen</div>
        </section>
      </div>}
      {showAbout && <div className="about-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setShowAbout(false); }}><section className="about-dialog" role="dialog" aria-modal="true" aria-labelledby="about-gene-title"><button className="about-close" aria-label="Close About GENE" onClick={() => setShowAbout(false)}>×</button><div className="about-brand"><span className="about-mark"><GeneMark /></span><div><div className="eyebrow">ABOUT THE WORKSPACE</div><h2 id="about-gene-title">GENE <span>2.0</span></h2></div></div><p className="about-lead">A focused AI workspace for turning ideas into real apps and playable browser games — with editable source, live preview, build checkpoints and recovery tools.</p><div className="about-detail-grid"><div><span>PRODUCT</span><strong>GENE 2.0 Studio</strong></div><div><span>BUILT BY</span><strong>Almuddaththir</strong></div><div><span>WORKFLOW</span><strong>Plan · Build · Test · Refine</strong></div><div><span>PRINCIPLE</span><strong>Real files. Honest status.</strong></div></div><div className="about-footer"><span>Made by <strong>Almuddaththir</strong></span><button className="primary-button" onClick={() => setShowAbout(false)}>Back to workspace</button></div></section></div>}
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
function NoticeText({ text }: { text: string }) {
  // Split long machine-generated errors into a short headline plus collapsible technical details.
  const clean = text.replace(/\s*GENE_[A-Z_]{6,}\.?\s*$/, "").trim();
  const detailAt = clean.search(/\sDetails:\s/);
  const sentenceEnd = clean.search(/[.!?](\s|$)/);
  let head = clean;
  let rest = "";
  if (detailAt > 0) { head = clean.slice(0, detailAt).trim(); rest = clean.slice(detailAt).replace(/^\s*Details:\s*/, "").trim(); }
  else if (clean.length > 220 && sentenceEnd > 0 && sentenceEnd < clean.length - 1) { head = clean.slice(0, sentenceEnd + 1).trim(); rest = clean.slice(sentenceEnd + 1).trim(); }
  if (!rest) return <>{head}</>;
  return <>{head} <details className="notice-details"><summary>Show details</summary><p>{rest}</p></details></>;
}

function noticeTone(text: string) {
  if (/rejected|failed|could not|error|unavailable|blocked|invalid/i.test(text)) return "notice-error";
  if (/copied|published|saved|passed|complete|restored|refreshing/i.test(text)) return "notice-ok";
  return "notice-info";
}

function runtimeLabel(state: "idle" | "loaded" | "rendered" | "error") {
  if (state === "rendered") return "Visible render signal";
  if (state === "loaded") return "Runtime loaded · render not yet confirmed";
  if (state === "error") return "Runtime error";
  return "Checking runtime…";
}