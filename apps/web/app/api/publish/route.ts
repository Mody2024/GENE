import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

export const runtime = "nodejs";
export const maxDuration = 60;

const buckets = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 10 * 60_000;
const MAX_FILES = 100;
const MAX_BYTES = 4_000_000;

function fail(message: string, status = 400, code = "GENE_PUBLISH_ERROR") {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}
function secureEquals(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
function safePath(path: unknown): path is string {
  return typeof path === "string" && path.length > 0 && path.length <= 180 &&
    !path.startsWith("/") && !path.includes("\\") && !path.split("/").some(part => part === "." || part === ".." || !part) &&
    /^[a-zA-Z0-9._/-]+$/.test(path);
}

export async function POST(request: NextRequest) {
  const token = process.env.VERCEL_TOKEN?.trim();
  const projectId = process.env.VERCEL_PROJECT_ID?.trim();
  const password = process.env.GENE_PUBLISH_PASSWORD?.trim();
  if (!token || !projectId || !password) {
    return fail("Web publishing is not configured yet. In Vercel, add VERCEL_TOKEN, VERCEL_PROJECT_ID, and GENE_PUBLISH_PASSWORD, then redeploy GENE.", 503, "GENE_PUBLISH_NOT_CONFIGURED");
  }
  const supplied = request.headers.get("x-gene-publish-password") || "";
  if (!secureEquals(supplied, password)) return fail("Publish access was not authorized.", 401, "GENE_PUBLISH_UNAUTHORIZED");

  const client = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
  const now = Date.now();
  const bucket = buckets.get(client);
  if (!bucket || bucket.resetAt <= now) buckets.set(client, { count: 1, resetAt: now + WINDOW_MS });
  else {
    bucket.count++;
    if (bucket.count > 4) return fail("Publish limit reached for this connection. Wait ten minutes before publishing again.", 429, "GENE_PUBLISH_RATE_LIMIT");
  }

  let body: any;
  try { body = await request.json(); } catch { return fail("Publish request must be valid JSON."); }
  const input = body?.files;
  if (!Array.isArray(input) || input.length < 3 || input.length > MAX_FILES) return fail("Publish needs a valid list of source files (up to 100 files).");
  const seen = new Set<string>();
  let totalBytes = 0;
  const files: Array<{ file: string; data: string; encoding: "utf-8" }> = [];
  for (const item of input) {
    if (!safePath(item?.path) || typeof item?.content !== "string") return fail("A published file has an invalid path or content.");
    if (seen.has(item.path)) return fail("Duplicate publish path: " + item.path);
    if (item.path.toLowerCase().endsWith(".map")) return fail("Source maps are not needed in published output.");
    seen.add(item.path);
    totalBytes += Buffer.byteLength(item.content, "utf8");
    if (totalBytes > MAX_BYTES) return fail("Published source exceeds the 4 MB upload budget. Remove large assets or publish a smaller build.", 413, "GENE_PUBLISH_TOO_LARGE");
    files.push({ file: item.path, data: item.content, encoding: "utf-8" });
  }
  if (!seen.has("index.html") || !seen.has("game.js") && !seen.has("app.js")) return fail("Publish requires a standalone index.html and its JavaScript source.");
  if (/<script\b[^>]*\bsrc\s*=\s*["']https?:/i.test(input.find((item: any) => item?.path === "index.html")?.content || "")) {
    return fail("Published HTML cannot depend on an external script CDN.");
  }

  const team = process.env.VERCEL_TEAM_ID?.trim();
  const query = team ? "?teamId=" + encodeURIComponent(team) : "";
  const deploymentName = (process.env.VERCEL_PROJECT_NAME || "gene-flash").toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 52);
  let deployment: any;
  try {
    const response = await fetch("https://api.vercel.com/v13/deployments" + query, {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: deploymentName,
        project: projectId,
        target: "production",
        files,
        projectSettings: { framework: null, buildCommand: null, installCommand: null, outputDirectory: ".", devCommand: null }
      }),
      signal: AbortSignal.timeout(20_000)
    });
    deployment = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = String(deployment?.error?.message || deployment?.message || "Vercel rejected the deployment request.");
      return fail("Vercel could not publish this build: " + detail, response.status === 429 ? 429 : 502, "GENE_VERCEL_PUBLISH_FAILED");
    }
  } catch (error) {
    return fail("Could not reach Vercel publishing: " + (error instanceof Error ? error.message : "network error"), 502, "GENE_VERCEL_PUBLISH_NETWORK");
  }

  const deploymentId = String(deployment?.id || "");
  const deploymentUrl = String(deployment?.url || "");
  if (!deploymentUrl) return fail("Vercel accepted no usable deployment URL. Check your Vercel project and token permissions.", 502, "GENE_VERCEL_URL_MISSING");
  let state = String(deployment?.readyState || deployment?.state || "BUILDING");
  if (deploymentId && !/^(READY|ERROR|CANCELED)$/i.test(state)) {
    for (let attempt = 0; attempt < 8; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 1_500));
      try {
        const statusResponse = await fetch("https://api.vercel.com/v13/deployments/" + encodeURIComponent(deploymentId) + query, {
          headers: { Authorization: "Bearer " + token },
          signal: AbortSignal.timeout(5_000)
        });
        const status = await statusResponse.json().catch(() => null);
        if (statusResponse.ok) state = String(status?.readyState || status?.state || state);
        if (/^(READY|ERROR|CANCELED)$/i.test(state)) break;
      } catch {}
    }
  }
  if (/^(ERROR|CANCELED)$/i.test(state)) {
    return fail("Vercel created the deployment but its build failed. Inspect the deployment logs in Vercel. No publishable link was confirmed.", 502, "GENE_VERCEL_BUILD_FAILED");
  }
  return NextResponse.json({
    ok: true,
    url: "https://" + deploymentUrl.replace(/^https?:\/\//i, ""),
    state,
    ready: /^READY$/i.test(state),
    message: /^READY$/i.test(state) ? "Published and ready." : "Deployment was created. Vercel is still preparing the site; the link may take another moment to become available."
  }, { status: 200, headers: { "Cache-Control": "no-store" } });
}
