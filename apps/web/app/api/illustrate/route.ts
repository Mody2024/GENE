import { NextRequest, NextResponse } from "next/server";
import { generateText } from "../../lib/providers";
import { safeArtName, sanitizeSvg } from "../../lib/svg-safety.mjs";
import { hasToolApproval } from "../../lib/tool-approval-server.mjs";

export const runtime = "nodejs";
export const maxDuration = 60;

const KINDS: Record<string, { viewBox: string; guidance: string }> = {
  sprite: { viewBox: "0 0 128 128", guidance: "a single game character or object sprite, centered, readable silhouette at 48 px, transparent background, a clear light direction, 3 to 5 flat or gradient colors plus a darker outline, no text" },
  icon: { viewBox: "0 0 64 64", guidance: "a simple, bold pickup/UI icon, centered, transparent background, very readable at 24 px, at most 4 colors, subtle glow allowed" },
  logo: { viewBox: "0 0 480 160", guidance: "a game title logotype: stylised lettering built from shapes or text elements plus a small emblem, strong contrast, transparent background" },
  background: { viewBox: "0 0 960 540", guidance: "a layered background scene with sky gradient, distant shapes, midground and foreground silhouettes for depth, wide composition with a calmer center so gameplay stays readable, no characters" }
};

function fail(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}

const buckets = new Map<string, { count: number; resetAt: number }>();

export async function POST(request: NextRequest) {
  let body: any;
  try { body = await request.json(); } catch { return fail(400, "BAD_JSON", "Request body must be valid JSON."); }
  if (!hasToolApproval(body, "illustrate")) return fail(403, "TOOL_APPROVAL_REQUIRED", "GENE did not draw this illustration because explicit approval for these exact inputs is missing, expired or already used.");
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim().slice(0, 700) : "";
  const kind = typeof body?.kind === "string" && KINDS[body.kind] ? body.kind : "sprite";
  if (!prompt) return fail(400, "PROMPT_REQUIRED", "Describe the illustration you want.");
  const clientKey = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
  const now = Date.now();
  const bucket = buckets.get(clientKey);
  if (!bucket || bucket.resetAt <= now) buckets.set(clientKey, { count: 1, resetAt: now + 60_000 });
  else if (++bucket.count > 14) return fail(429, "GENE_RATE_LIMIT", "Illustration limit reached. Please wait a minute.");

  const style = typeof body?.style === "string" ? body.style.trim().slice(0, 160) : "";
  const palette = Array.isArray(body?.palette) ? body.palette.filter((c: unknown): c is string => typeof c === "string" && /^#[0-9a-f]{3,8}$/i.test(c)).slice(0, 6) : [];
  const spec = KINDS[kind];
  const system = [
    "You are GENE's illustrator. You draw original, polished SVG artwork for browser games and web apps.",
    "Return ONLY one complete SVG document, starting with <svg and ending with </svg>. No markdown fences, no explanation.",
    "Use viewBox=\"" + spec.viewBox + "\" and xmlns=\"http://www.w3.org/2000/svg\".",
    "Allowed: path, rect, circle, ellipse, line, polyline, polygon, g, defs, linearGradient, radialGradient, stop, clipPath, mask, filter (feGaussianBlur, feDropShadow), text.",
    "Forbidden: script, image, foreignObject, external references, event attributes, fonts that must be downloaded.",
    "Keep it under 60 KB: prefer fewer, well-composed shapes with gradients and layered highlights over hundreds of tiny paths.",
    "Draw something original; never reproduce a copyrighted character, logo or brand."
  ].join("\n");
  const user = [
    "Illustration type: " + kind + " — " + spec.guidance + ".",
    "Subject: " + prompt,
    style ? "Art style: " + style : "",
    palette.length ? "Use this palette: " + palette.join(", ") : ""
  ].filter(Boolean).join("\n");

  const result = await generateText({
    system,
    user,
    maxTokens: kind === "background" ? 7_000 : 5_000,
    temperature: 0.7,
    json: false,
    budgetMs: 52_000,
    siteTitle: "GENE Illustrator",
    validate: text => sanitizeSvg(text).ok
  });
  if (!result.ok) {
    return fail(result.status === 429 ? 429 : 503, "ILLUSTRATION_FAILED", "GENE could not generate this illustration with the free providers right now. " + result.error + " Nothing was saved.");
  }
  const cleaned = sanitizeSvg(result.text);
  if (!cleaned.ok) return fail(422, "ILLUSTRATION_INVALID", cleaned.error + " Nothing was saved.");
  const name = safeArtName(typeof body?.name === "string" ? body.name : prompt.split(/\s+/).slice(0, 3).join("-"), kind);
  return NextResponse.json({
    ok: true,
    aiMode: result.provider,
    model: result.model,
    art: { name, kind, path: "assets/art/" + name + ".svg", svg: cleaned.svg, bytes: cleaned.bytes, shapes: cleaned.shapes }
  });
}
