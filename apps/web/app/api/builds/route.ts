import { NextRequest, NextResponse } from "next/server";
import { randomUUID, createCipheriv, randomBytes, timingSafeEqual } from "node:crypto";
import { deflateRawSync } from "node:zlib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const API = "https://api.github.com";
const REPO = (process.env.GENE_BUILD_REPOSITORY || "Mody2024/GENE").split("/");
const MAX_FILES = 100;
const MAX_BYTES = 3_000_000;
const buckets = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 10 * 60_000;

function fail(message: string, status = 400, code = "GENE_BUILD_ERROR") {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}
function config() {
  const token = process.env.GENE_BUILD_GITHUB_TOKEN?.trim();
  const password = process.env.GENE_BUILD_PASSWORD?.trim();
  const key = Buffer.from(process.env.GENE_BUILD_ENCRYPTION_KEY || "", "base64");
  if (!token || !password || key.length !== 32 || REPO.length !== 2 || REPO.some(x => !x)) return null;
  return { token, key, password, owner: REPO[0], repo: REPO[1] };
}
async function gh(url: string, token: string, init?: RequestInit) {
  return fetch(API + url, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: "Bearer " + token,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers || {})
    },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000)
  });
}
function safePath(value: unknown): string {
  const path = String(value || "").replace(/\\/g, "/");
  if (!path || path.startsWith("/") || /^[a-zA-Z]:/.test(path) || path.split("/").some(p => !p || p === "." || p === "..") || path.includes("\0")) {
    throw new Error("The project contains an unsafe file path.");
  }
  return path;
}
function encrypt(value: unknown, key: Buffer) {
  const plain = deflateRawSync(Buffer.from(JSON.stringify(value), "utf8"));
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}
export async function POST(request: NextRequest) {
  const cfg = config();
  if (!cfg) return fail("Cloud binary building is not configured yet. Add GENE_BUILD_GITHUB_TOKEN, GENE_BUILD_ENCRYPTION_KEY, and GENE_BUILD_PASSWORD in Vercel, then redeploy.", 503, "GENE_BUILD_NOT_CONFIGURED");
  let body: any;
  try { body = await request.json(); } catch { return fail("Invalid build request JSON."); }
  const supplied = request.headers.get("x-gene-build-password") || "";
  const suppliedBytes = Buffer.from(supplied);
  const expectedBytes = Buffer.from(cfg.password);
  if (suppliedBytes.length !== expectedBytes.length || !timingSafeEqual(suppliedBytes, expectedBytes)) {
    return fail("Cloud build access was not authorized.", 401, "GENE_BUILD_UNAUTHORIZED");
  }
  const client = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
  const now = Date.now();
  const bucket = buckets.get(client);
  if (!bucket || bucket.resetAt <= now) buckets.set(client, { count: 1, resetAt: now + WINDOW_MS });
  else {
    bucket.count++;
    if (bucket.count > 3) return fail("Cloud build limit reached for this connection. Wait ten minutes before starting another build.", 429, "GENE_BUILD_RATE_LIMIT");
  }
  const targets = body?.targets;
  if (!["both", "windows", "android"].includes(targets)) return fail("Choose Windows EXE, Android APK, or both.");
  if (!Array.isArray(body?.files) || body.files.length < 1 || body.files.length > MAX_FILES) return fail("The project must contain between 1 and " + MAX_FILES + " files.");
  const files: Array<{ path: string; content: string }> = [];
  const seen = new Set<string>();
  let bytes = 0;
  try {
    for (const file of body.files) {
      const path = safePath(file?.path);
      if (seen.has(path)) return fail("Duplicate project path: " + path);
      seen.add(path);
      if (typeof file?.content !== "string") return fail("Invalid source content for " + path);
      bytes += Buffer.byteLength(file.content, "utf8");
      if (bytes > MAX_BYTES) return fail("This cloud build is limited to 3 MB of source. Remove large embedded assets and try again.");
      files.push({ path, content: file.content });
    }
  } catch (error) { return fail(error instanceof Error ? error.message : "Invalid project file."); }
  if (!seen.has("index.html")) return fail("The project needs a standalone index.html before it can be packaged.");
  const buildId = randomUUID();
  const sourceRef = "gene-build-" + buildId;
  const encrypted = encrypt({
    title: String(body.title || "GENE Project").slice(0, 80),
    projectId: String(body.projectId || buildId).slice(0, 80),
    files
  }, cfg.key);
  const apiBase = "/repos/" + cfg.owner + "/" + cfg.repo;
  try {
    const mainRef = await gh(apiBase + "/git/ref/heads/main", cfg.token);
    if (!mainRef.ok) return fail("Could not find the main branch in the configured GENE build repository.", 502, "GENE_BUILD_REPOSITORY_ERROR");
    const refData = await mainRef.json();
    const branchCreate = await gh(apiBase + "/git/refs", cfg.token, {
      method: "POST",
      body: JSON.stringify({ ref: "refs/heads/" + sourceRef, sha: refData.object.sha })
    });
    if (!branchCreate.ok) return fail("Could not create a private build workspace in GitHub. Check the build token's Contents permission.", 502, "GENE_BUILD_REPOSITORY_ERROR");
    const upload = await gh(apiBase + "/contents/.gene-builds/" + buildId + ".enc", cfg.token, {
      method: "PUT",
      body: JSON.stringify({
        message: "Add encrypted temporary GENE build source " + buildId,
        branch: sourceRef,
        content: encrypted
      })
    });
    if (!upload.ok) {
      await gh(apiBase + "/git/refs/heads/" + sourceRef, cfg.token, { method: "DELETE" }).catch(() => null);
      return fail("Could not store the encrypted project payload. Check GitHub Contents permissions and repository limits.", 502, "GENE_BUILD_UPLOAD_ERROR");
    }
    const dispatch = await gh(apiBase + "/actions/workflows/cloud-build.yml/dispatches", cfg.token, {
      method: "POST",
      body: JSON.stringify({ ref: "main", inputs: { build_id: buildId, source_ref: sourceRef, targets } })
    });
    if (!dispatch.ok) {
      return fail("GitHub received the encrypted project, but could not start the cloud build. Enable Actions and grant the token Actions: write permission.", 502, "GENE_BUILD_DISPATCH_ERROR");
    }
    return NextResponse.json({
      ok: true, buildId, state: "queued", targets,
      message: "Encrypted source accepted. Windows and Android cloud workers will compile the requested binary."
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return fail("The cloud build service could not reach GitHub. Try again shortly.", 502, "GENE_BUILD_NETWORK_ERROR");
  }
}
