import http from "node:http";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { access, cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";

const PORT = Number(process.env.GENE_AGENT_PORT || process.env.PORT || 38421);
const HOST = process.env.GENE_AGENT_HOST || "127.0.0.1";
const WORKSPACE = path.resolve(process.env.GENE_WORKSPACE || path.join(os.homedir(), "GENE"));
const TOKEN_FILE = path.join(os.homedir(), ".gene-agent-token");
const MAX_BODY_BYTES = 12 * 1024 * 1024;
const MAX_FILE_CHARS = 600_000;
const MAX_TOTAL_TEXT = 10_000_000;
const DEFAULT_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"];
const allowedOrigins = new Set(
  (process.env.GENE_ALLOWED_ORIGINS || DEFAULT_ORIGINS.join(","))
    .split(",").map(value => value.trim()).filter(Boolean)
);

function json(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function error(res, status, code, message) {
  json(res, status, { ok: false, error: { code, message } });
}

function setCors(req, res) {
  const origin = req.headers.origin;
  if (!origin) return true;
  if (!allowedOrigins.has(origin) && !allowedOrigins.has("*")) return false;
  res.setHeader("Access-Control-Allow-Origin", allowedOrigins.has("*") ? origin : origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-GENE-TOKEN");
  res.setHeader("Access-Control-Max-Age", "600");
  return true;
}

function tokenEqual(provided, expected) {
  if (typeof provided !== "string" || !provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function safeProjectId(id) {
  return typeof id === "string" && /^[a-zA-Z0-9_-]{3,80}$/.test(id);
}

export function safeRelativePath(input) {
  if (typeof input !== "string" || !input || input.length > 220) return null;
  const forward = input.replace(/\\/g, "/");
  if (forward.startsWith("/") || /^[a-zA-Z]:/.test(forward) || forward.includes("\0")) return null;
  const segments = forward.split("/");
  if (segments.some(segment => !segment || segment === "." || segment === ".." || segment.startsWith("."))) return null;
  return segments.join("/");
}

function isAllowedProjectFile(relative) {
  const clean = safeRelativePath(relative);
  if (!clean) return false;
  const top = clean.split("/")[0];
  return ["game.html", "game.css", "game.js", "game-spec.json", "README.md", "assets", "src", "scenes", "data", "references", "versions"].includes(top);
}

export function validateSourceProject(files) {
  const issues = [];
  if (!files || typeof files !== "object" || Array.isArray(files)) return { ok: false, issues: ["Files must be an object."] };
  for (const required of ["game.html", "game.css", "game.js", "game-spec.json"]) {
    if (typeof files[required] !== "string" || files[required].trim().length < 8) issues.push("Missing or empty required file: " + required);
  }
  if (issues.length) return { ok: false, issues };
  const html = files["game.html"];
  const css = files["game.css"];
  const js = files["game.js"];
  let spec;
  try { new Function(js); } catch (e) { issues.push("JavaScript syntax error: " + (e instanceof Error ? e.message : String(e))); }
  try { spec = JSON.parse(files["game-spec.json"]); } catch { issues.push("game-spec.json is not valid JSON."); }
  if (!/<canvas\b[^>]*\bid=["']game-canvas["']/i.test(html)) issues.push("game.html must include canvas id=game-canvas.");
  if (/<script\b/i.test(html)) issues.push("Put executable code in game.js, not inline script tags in game.html.");
  if (/<script\b[^>]*\bsrc\s*=\s*["']https?:|<link\b[^>]*\bhref\s*=\s*["']https?:/i.test(html)) issues.push("External HTML script/stylesheet dependencies are not allowed.");
  if (/\bimport\s*\(|\bfrom\s*["']https?:|\bfetch\s*\(\s*["']https?:/i.test(js)) issues.push("External JavaScript runtime dependencies are not allowed.");
  if (/@import\s+url\s*\(\s*["']?https?:|url\s*\(\s*["']https?:/i.test(css)) issues.push("External CSS dependencies are not allowed.");
  if (!/requestAnimationFrame|\.requestAnimationFrame/.test(js)) issues.push("No requestAnimationFrame game loop detected.");
  if (!/addEventListener|onkeydown|onkeyup|ontouchstart|onclick/.test(js)) issues.push("No detectable player input/event handling.");
  if (spec?.engine === "canvas2d" && !/getContext\s*\(\s*["']2d["'](?:\s*,[^)]*)?\s*\)/.test(js)) issues.push("Canvas 2D game must create a CanvasRenderingContext2D.");
  if (spec?.engine === "webgl3d") {
    if (!/getContext\s*\(\s*["'](?:webgl2?|experimental-webgl)["'](?:\s*,[^)]*)?\s*\)/i.test(js)) issues.push("WebGL 3D game must request a WebGL context.");
    for (const [pattern, requirement] of [
      [/createShader\s*\(/, "shader creation"],
      [/shaderSource\s*\(/, "shader source"],
      [/compileShader\s*\(/, "shader compilation"],
      [/createProgram\s*\(/, "program creation"],
      [/linkProgram\s*\(/, "program linking"],
      [/bufferData\s*\(/, "geometry buffer upload"],
      [/drawArrays\s*\(|drawElements\s*\(/, "geometry draw calls"]
    ]) if (!pattern.test(js)) issues.push("WebGL 3D game is missing " + requirement + ".");
  }
  if (!/fillRect|fillText|drawImage|drawArrays|drawElements|stroke\(|\.fill\(/.test(js)) issues.push("No detectable draw operation; the game may render blank.");
  if (spec && typeof spec === "object" && !Array.isArray(spec)) {
    if (typeof spec.title !== "string" || !spec.title.trim()) issues.push("game-spec.json needs a title.");
    if (typeof spec.genre !== "string" || !spec.genre.trim()) issues.push("game-spec.json needs a genre.");
    if (spec.engine !== "canvas2d" && spec.engine !== "webgl3d") issues.push("game-spec.json engine must be canvas2d or webgl3d.");
    if (!Array.isArray(spec.mechanics) || spec.mechanics.length === 0 || !spec.mechanics.every(item => typeof item === "string" && item.trim())) issues.push("game-spec.json needs a non-empty mechanics list.");
    if (!Array.isArray(spec.controls) || spec.controls.length === 0 || !spec.controls.every(item => typeof item === "string" && item.trim())) issues.push("game-spec.json needs a non-empty controls list.");
    if (typeof spec.objective !== "string" || !spec.objective.trim()) issues.push("game-spec.json needs an objective.");
    if (typeof spec.winCondition !== "string" || !spec.winCondition.trim()) issues.push("game-spec.json needs a win condition.");
    if (typeof spec.lossCondition !== "string" || !spec.lossCondition.trim()) issues.push("game-spec.json needs a loss condition.");
    const budget = spec.performanceBudget;
    if (!budget || !Number.isFinite(budget.targetFps) || budget.targetFps < 30 || budget.targetFps > 120) issues.push("performanceBudget.targetFps must be between 30 and 120.");
    if (budget && ![budget.maxEnemies, budget.maxObjects, budget.maxParticles].every(n => Number.isInteger(n) && n >= 0)) issues.push("Performance budgets must be non-negative integers.");
    if (budget && (budget.maxEnemies > 40 || budget.maxObjects > 1200 || budget.maxParticles > 300)) issues.push("Performance budget exceeds GENE's conservative limits.");
  } else {
    issues.push("game-spec.json must be an object.");
  }
  return { ok: issues.length === 0, issues };
}

export function renderPlayHtml(files, title = "GENE game", baseHref = "/") {
  const html = String(files["game.html"] || "").replace(/<script[\s\S]*?<\/script>/gi, "");
  const css = String(files["game.css"] || "").replace(/<\/style/gi, "<\\/style");
  const js = String(files["game.js"] || "").replace(/<\/script/gi, "<\\/script");
  const safeTitle = String(title).replace(/[&<>"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]);
  const safeBase = String(baseHref).startsWith("/") && !String(baseHref).includes("..") ? String(baseHref) : "/";
  const telemetry = [
    "(function(){",
    "window.addEventListener('error',function(e){console.error('[GENE runtime]',e.message||'script error');});",
    "window.addEventListener('load',function(){document.documentElement.dataset.geneLoaded='true';});",
    "})();"
  ].join("\n");
  return "<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no'><base href='" + safeBase + "'><title>" + safeTitle + "</title><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#11151b;color:#f6f7f8;font-family:Arial,sans-serif}*{box-sizing:border-box}" + css + "</style></head><body>" + html + "<script>" + js + "</script><script>" + telemetry + "</script></body></html>";
}

async function readJson(req, limit = MAX_BODY_BYTES) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error("Request body exceeds the size limit."), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw Object.assign(new Error("Request body must be valid JSON."), { status: 400 }); }
}

async function writeTextFile(root, relative, content) {
  const clean = safeRelativePath(relative);
  if (!clean || typeof content !== "string") throw new Error("Unsafe or invalid file entry: " + String(relative));
  if (content.length > MAX_FILE_CHARS) throw new Error("File exceeds the 600 KB local-agent limit: " + clean);
  const target = path.join(root, ...clean.split("/"));
  const resolved = path.resolve(target);
  if (!resolved.startsWith(path.resolve(root) + path.sep)) throw new Error("Path escaped the project root.");
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
}

async function readProjectFiles(projectDir) {
  const files = {};
  async function walk(dir, prefix = "") {
    const items = await readdir(dir, { withFileTypes: true });
    for (const item of items) {
      if (item.name.startsWith(".")) continue;
      const relative = prefix ? prefix + "/" + item.name : item.name;
      const absolute = path.join(dir, item.name);
      if (item.isDirectory()) await walk(absolute, relative);
      else if (isAllowedProjectFile(relative)) {
        const info = await stat(absolute);
        if (info.size <= MAX_FILE_CHARS * 2) files[relative] = await readFile(absolute, "utf8");
      }
    }
  }
  await walk(projectDir);
  return files;
}

async function initializeToken() {
  if (process.env.GENE_LOCAL_TOKEN) return process.env.GENE_LOCAL_TOKEN;
  try {
    const current = (await readFile(TOKEN_FILE, "utf8")).trim();
    if (current.length >= 32) return current;
  } catch {}
  const token = crypto.randomBytes(32).toString("hex");
  await writeFile(TOKEN_FILE, token, { encoding: "utf8", mode: 0o600 });
  return token;
}

export async function createAgentServer({ port = PORT, host = HOST, workspace = WORKSPACE, token = null, log = console.log } = {}) {
  const localToken = token || await initializeToken();
  const root = path.resolve(workspace);
  const projectsRoot = path.join(root, "projects");
  const historyRoot = path.join(root, "history");
  await mkdir(projectsRoot, { recursive: true });
  await mkdir(historyRoot, { recursive: true });

  const server = http.createServer(async (req, res) => {
    if (!setCors(req, res)) return error(res, 403, "GENE_ORIGIN_DENIED", "This browser origin is not in GENE_ALLOWED_ORIGINS.");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      return res.end();
    }
    const url = new URL(req.url || "/", "http://localhost");
    const segments = url.pathname.split("/").filter(Boolean).map(segment => decodeURIComponent(segment));

    if (req.method === "GET" && url.pathname === "/health") {
      return json(res, 200, { ok: true, app: "gene-local-agent", version: "0.1.0", host, port, workspace: root, tokenConfigured: true });
    }

    if (segments[0] === "play" && req.method === "GET" && segments.length >= 3) {
      const id = segments[1];
      const relative = safeRelativePath(segments.slice(2).join("/"));
      if (!safeProjectId(id) || !relative || !relative.startsWith("assets/")) return error(res, 400, "GENE_BAD_ASSET_PATH", "Only safe paths under the project's assets folder are served.");
      const projectDir = path.join(projectsRoot, id);
      const assetPath = path.resolve(projectDir, ...relative.split("/"));
      if (!assetPath.startsWith(path.resolve(projectDir) + path.sep)) return error(res, 400, "GENE_BAD_ASSET_PATH", "Asset path escaped the project root.");
      try {
        const info = await stat(assetPath);
        if (!info.isFile() || info.size > 25 * 1024 * 1024) return error(res, 413, "GENE_ASSET_TOO_LARGE", "Asset is not a file or exceeds 25 MB.");
        const extension = path.extname(assetPath).toLowerCase();
        const mime = ({
          ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml",
          ".obj": "text/plain; charset=utf-8", ".mtl": "text/plain; charset=utf-8", ".json": "application/json; charset=utf-8",
          ".glb": "model/gltf-binary", ".gltf": "model/gltf+json", ".bin": "application/octet-stream",
          ".wav": "audio/wav", ".mp3": "audio/mpeg", ".ogg": "audio/ogg"
        })[extension] || "application/octet-stream";
        res.writeHead(200, { "Content-Type": mime, "Content-Length": info.size, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
        return res.end(await readFile(assetPath));
      } catch {
        return error(res, 404, "GENE_ASSET_NOT_FOUND", "Asset was not found in the synced project.");
      }
    }

    if (segments[0] === "play" && req.method === "GET" && segments.length === 2) {
      const id = segments[1];
      if (!safeProjectId(id)) return error(res, 400, "GENE_BAD_PROJECT_ID", "Invalid project id.");
      const dir = path.join(projectsRoot, id);
      try {
        const [html, css, js, manifestText] = await Promise.all([
          readFile(path.join(dir, "game.html"), "utf8"),
          readFile(path.join(dir, "game.css"), "utf8"),
          readFile(path.join(dir, "game.js"), "utf8"),
          readFile(path.join(dir, "gene.project.json"), "utf8")
        ]);
        const manifest = JSON.parse(manifestText);
        const output = renderPlayHtml({ "game.html": html, "game.css": css, "game.js": js }, manifest.name || id, "/play/" + encodeURIComponent(id) + "/");
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "Content-Security-Policy": "default-src 'self' data: blob:; img-src 'self' data: blob:; style-src 'unsafe-inline' 'self'; script-src 'unsafe-inline' 'self' blob:; connect-src 'self'; font-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'self'"
        });
        return res.end(output);
      } catch {
        return error(res, 404, "GENE_GAME_NOT_FOUND", "That game is not on this local agent. Sync the project from GENE first.");
      }
    }

    if (!url.pathname.startsWith("/api/")) return error(res, 404, "GENE_NOT_FOUND", "Route not found.");
    if (!tokenEqual(req.headers["x-gene-token"], localToken)) return error(res, 401, "GENE_AUTH_REQUIRED", "Connect using the local-agent token shown in its terminal.");

    if (req.method === "GET" && url.pathname === "/api/projects") {
      const names = await readdir(projectsRoot, { withFileTypes: true });
      const projects = [];
      for (const entry of names) {
        if (!entry.isDirectory() || !safeProjectId(entry.name)) continue;
        try {
          const manifest = JSON.parse(await readFile(path.join(projectsRoot, entry.name, "gene.project.json"), "utf8"));
          projects.push({ id: entry.name, name: manifest.name || entry.name, updatedAt: manifest.updatedAt || null, fileCount: Object.keys(manifest.files || {}).length, path: path.join(projectsRoot, entry.name) });
        } catch {}
      }
      return json(res, 200, { ok: true, projects });
    }

    if (req.method === "POST" && url.pathname === "/api/projects/sync") {
      let body;
      try { body = await readJson(req); } catch (e) { return error(res, e.status || 400, "GENE_BAD_BODY", e.message); }
      const id = body?.id;
      if (!safeProjectId(id)) return error(res, 400, "GENE_BAD_PROJECT_ID", "Project id must contain only letters, numbers, underscores or hyphens.");
      const files = body.files;
      if (!files || typeof files !== "object" || Array.isArray(files)) return error(res, 400, "GENE_FILES_REQUIRED", "No project files were supplied.");
      const fileEntries = Object.entries(files);
      if (fileEntries.length < 4 || fileEntries.length > 80) return error(res, 400, "GENE_FILE_COUNT", "A sync needs at least the four game files and may contain at most 80 files.");
      let totalChars = 0;
      for (const [relative, text] of fileEntries) {
        if (!isAllowedProjectFile(relative)) return error(res, 400, "GENE_UNSAFE_PATH", "Blocked project file path: " + relative);
        if (typeof text !== "string" || text.length > MAX_FILE_CHARS) return error(res, 413, "GENE_FILE_TOO_LARGE", "Project file is too large: " + relative);
        totalChars += text.length;
        if (totalChars > MAX_TOTAL_TEXT) return error(res, 413, "GENE_PROJECT_TOO_LARGE", "Project source exceeds 10 MB.");
      }
      const sourceCheck = validateSourceProject(files);
      if (!sourceCheck.ok) return json(res, 422, { ok: false, error: { code: "GENE_SOURCE_INVALID", message: "Local sync rejected because source validation failed.", issues: sourceCheck.issues } });

      const stage = path.join(projectsRoot, ".staging-" + id + "-" + crypto.randomBytes(4).toString("hex"));
      const dest = path.join(projectsRoot, id);
      const manifest = {
        id,
        name: String(body.name || id).slice(0, 120),
        initialPrompt: String(body.initialPrompt || "").slice(0, 12000),
        updatedAt: new Date().toISOString(),
        plan: body.plan || null,
        files: Object.fromEntries(fileEntries.map(([name]) => [name, true])),
        references: [],
        versions: Array.isArray(body.versions) ? body.versions.map(v => ({ number: v.number, label: v.label, createdAt: v.createdAt, testSummary: v.testSummary })) : []
      };
      try {
        await mkdir(stage, { recursive: true });
        for (const [relative, text] of fileEntries) await writeTextFile(stage, relative, text);
        const references = Array.isArray(body.references) ? body.references.slice(0, 12) : [];
        for (const ref of references) {
          const safeName = String(ref.name || "reference").replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 120) || "reference";
          const destination = "references/" + safeName;
          if (ref.kind === "image" && typeof ref.dataBase64 === "string" && /^[A-Za-z0-9+/]+={0,2}$/.test(ref.dataBase64) && ref.dataBase64.length <= 700_000) {
            await mkdir(path.join(stage, "references"), { recursive: true });
            await writeFile(path.join(stage, destination), Buffer.from(ref.dataBase64, "base64"));
            manifest.references.push({ name: String(ref.name || safeName), kind: "image", mimeType: String(ref.mimeType || "image/png"), path: destination, size: Number(ref.size || 0) });
          } else if (ref.kind === "text" && typeof ref.textContent === "string" && ref.textContent.length <= 60_000) {
            await writeTextFile(stage, destination, ref.textContent);
            manifest.references.push({ name: String(ref.name || safeName), kind: "text", mimeType: String(ref.mimeType || "text/plain"), path: destination, size: Number(ref.size || 0) });
          }
        }
        const versions = Array.isArray(body.versions) ? body.versions.slice(0, 20) : [];
        for (const version of versions) {
          const number = Number(version.number);
          if (!Number.isInteger(number) || number < 1 || number > 100000) continue;
          const prefix = "versions/" + String(number).padStart(3, "0");
          await mkdir(path.join(stage, prefix), { recursive: true });
          const snapshotFiles = version.files && typeof version.files === "object" ? Object.entries(version.files) : [];
          for (const [relative, text] of snapshotFiles) {
            if (!isAllowedProjectFile(relative) || relative.startsWith("versions/") || relative.startsWith("references/") || typeof text !== "string" || text.length > MAX_FILE_CHARS) continue;
            await writeTextFile(stage, prefix + "/" + relative, text);
          }
          await writeTextFile(stage, prefix + "/version.json", JSON.stringify({ number, label: String(version.label || "Snapshot"), createdAt: String(version.createdAt || ""), testSummary: String(version.testSummary || "") }, null, 2));
        }
        await writeTextFile(stage, "gene.project.json", JSON.stringify(manifest, null, 2));
        try { await access(dest); } catch { /* destination does not exist yet */ }
        let exists = false;
        try { await access(dest); exists = true; } catch {}
        if (exists) {
          const historyPath = path.join(historyRoot, id, new Date().toISOString().replace(/[:.]/g, "-"));
          await mkdir(path.dirname(historyPath), { recursive: true });
          await cp(dest, historyPath, { recursive: true });
          await rm(dest, { recursive: true, force: true });
        }
        await rename(stage, dest);
        return json(res, 200, {
          ok: true,
          id,
          name: manifest.name,
          projectPath: dest,
          playUrl: "http://" + host + ":" + port + "/play/" + encodeURIComponent(id),
          filesWritten: fileEntries.length,
          referenceFilesWritten: manifest.references.length,
          versionsWritten: versions.length,
          sourceCheck
        });
      } catch (e) {
        await rm(stage, { recursive: true, force: true }).catch(() => {});
        return error(res, 500, "GENE_SYNC_FAILED", "Could not write project files: " + (e instanceof Error ? e.message : String(e)));
      }
    }

    const detail = url.pathname.match(/^\/api\/projects\/([^/]+)(?:\/(files|test))?$/);
    if (detail) {
      const id = detail[1];
      if (!safeProjectId(id)) return error(res, 400, "GENE_BAD_PROJECT_ID", "Invalid project id.");
      const projectDir = path.join(projectsRoot, id);
      try {
        await access(projectDir);
      } catch {
        return error(res, 404, "GENE_PROJECT_NOT_FOUND", "Project is not synced to this local agent.");
      }
      if (req.method === "GET" && !detail[2]) {
        try {
          const manifest = JSON.parse(await readFile(path.join(projectDir, "gene.project.json"), "utf8"));
          const files = await readProjectFiles(projectDir);
          return json(res, 200, { ok: true, manifest, files });
        } catch (e) { return error(res, 500, "GENE_PROJECT_READ_FAILED", String(e)); }
      }
      if (req.method === "GET" && detail[2] === "files") {
        try { return json(res, 200, { ok: true, files: await readProjectFiles(projectDir) }); }
        catch (e) { return error(res, 500, "GENE_PROJECT_READ_FAILED", String(e)); }
      }
      if (req.method === "POST" && detail[2] === "test") {
        try {
          const files = await readProjectFiles(projectDir);
          const sourceCheck = validateSourceProject(files);
          const manifest = JSON.parse(await readFile(path.join(projectDir, "gene.project.json"), "utf8"));
          const fileSizes = {};
          for (const name of ["game.html", "game.css", "game.js", "game-spec.json"]) {
            fileSizes[name] = (await stat(path.join(projectDir, name))).size;
          }
          return json(res, sourceCheck.ok ? 200 : 422, {
            ok: sourceCheck.ok,
            id,
            projectPath: projectDir,
            fileSizes,
            sourceCheck,
            manifestUpdatedAt: manifest.updatedAt,
            note: "This is a real on-disk source check. It does not claim to simulate every gameplay path."
          });
        } catch (e) { return error(res, 500, "GENE_TEST_FAILED", String(e)); }
      }
    }

    return error(res, 404, "GENE_NOT_FOUND", "Route not found.");
  });

  return {
    server,
    token: localToken,
    host,
    port,
    workspace: root,
    async listen() {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, resolve);
      });
      log("GENE Local Agent 0.1.0");
      log("Workspace: " + root);
      log("Listening: http://" + host + ":" + port);
      log("Local token (paste into GENE; keep private): " + localToken);
      log("Allowed browser origins: " + (allowedOrigins.has("*") ? "any origin with the token" : Array.from(allowedOrigins).join(", ")));
      return this;
    },
    close() { return new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve())); }
  };
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath && invokedPathToUrl(invokedPath) === import.meta.url) {
  createAgentServer().then(agent => agent.listen()).catch(err => {
    console.error("GENE Local Agent failed to start:", err);
    process.exitCode = 1;
  });
}
function invokedPathToUrl(filePath) { return pathToFileURL(filePath).href; }
