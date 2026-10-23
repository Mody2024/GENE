import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { buildNative2DAsset } from "../../../../lib/forge-2d.mjs";
import { hasToolApproval } from "../../../lib/tool-permissions.mjs";

export const runtime = "nodejs";
export const maxDuration = 15;
const buckets = new Map<string, { count: number; resetAt: number }>();
const ALLOWED_KINDS = new Set(["character", "tileset", "ui", "background", "icon"]);
const ALLOWED_QUALITY = new Set(["performance", "standard", "high"]);

function response(status: number, body: unknown) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
function fail(status: number, code: string, message: string) {
  return response(status, { ok: false, error: { code, message } });
}

export async function POST(request: NextRequest) {
  let body: any;
  try {
    const length = Number(request.headers.get("content-length") || 0);
    if (length > 12_000) return fail(413, "REQUEST_TOO_LARGE", "2D asset requests must be under 12 KB.");
    body = await request.json();
  } catch {
    return fail(400, "BAD_JSON", "Request body must be valid JSON.");
  }
  if (!hasToolApproval(body, "forge2d")) return fail(403, "TOOL_APPROVAL_REQUIRED", "GENE did not run this tool because explicit approval for these exact inputs is missing or expired.");
  if (!body || typeof body !== "object" || Array.isArray(body)) return fail(400, "BAD_BODY", "Request body must be a JSON object.");
  const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 300) : "";
  if (prompt.length < 3) return fail(400, "PROMPT_REQUIRED", "Describe the 2D asset in at least three characters.");
  const kind = typeof body.kind === "string" ? body.kind : "character";
  if (!ALLOWED_KINDS.has(kind)) return fail(400, "UNSUPPORTED_2D_KIND", "Choose character, tileset, ui, background, or icon.");
  const quality = typeof body.quality === "string" && ALLOWED_QUALITY.has(body.quality) ? body.quality : "standard";
  const clientKey = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
  const now = Date.now();
  const bucket = buckets.get(clientKey);
  if (!bucket || bucket.resetAt <= now) buckets.set(clientKey, { count: 1, resetAt: now + 60_000 });
  else if (++bucket.count > 30) return fail(429, "GENE_2D_RATE_LIMIT", "The native 2D asset limit was reached. Wait a minute and retry.");

  try {
    const asset = buildNative2DAsset({
      prompt,
      kind,
      quality,
      style: typeof body.style === "string" ? body.style.slice(0, 80) : "stylized"
    });
    if (asset.qualityReport.svgBytes > 300_000) return fail(500, "ASSET_SIZE_LIMIT", "Generated SVG exceeded the safe output size.");
    const integrityFiles: Record<string, string> = { "sprite.svg": createHash("sha256").update(asset.svg, "utf8").digest("hex") };
    for (const [name, svg] of Object.entries(asset.frameFiles || {})) integrityFiles["frames/" + name] = createHash("sha256").update(String(svg), "utf8").digest("hex");
    asset.manifest = { ...asset.manifest, contentIntegrity: { algorithm: "sha256", files: integrityFiles } } as typeof asset.manifest;
    return response(200, {
      ok: true,
      provider: "GENE Native 2D",
      notice: "This is procedural vector artwork, not an external image-generation model or a rigged animation.",
      asset,
      files: {
        "sprite.svg": asset.svg,
        "asset.json": JSON.stringify({ ...asset.manifest, qualityReport: asset.qualityReport }, null, 2),
        ...Object.fromEntries(Object.entries(asset.frameFiles || {}).map(([name, svg]) => ["frames/" + name, svg]))
      }
    });
  } catch (error) {
    return fail(500, "GENE_2D_GENERATION_FAILED", error instanceof Error ? error.message : "Native 2D generation failed.");
  }
}
