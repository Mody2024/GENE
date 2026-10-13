import { NextResponse } from "next/server";

export const runtime = "nodejs";
// This endpoint reports runtime environment state. Do not let Next.js statically
// render it during build, before deployment secrets are injected.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const geminiKeys = [
    process.env.GEMINI_API_KEY, process.env.GEMINI_API_KEY_2, process.env.GEMINI_API_KEY_3,
    process.env.GEMINI_API_KEY_4, process.env.GEMINI_API_KEY_5,
    ...(process.env.GEMINI_API_KEYS || "").split(/[,;\\n]/)
  ].map(value => value?.trim()).filter(Boolean);
  const hasGemini = geminiKeys.length > 0;
  const hasGroq = Boolean(process.env.GROQ_API_KEY?.trim());
  const hasOpenRouter = Boolean(process.env.OPENROUTER_API_KEY?.trim());
  const rawBuildKey = (process.env.GENE_BUILD_ENCRYPTION_KEY || process.env.GENE_BUILD_KEY || "").trim();
  const validBuildKey = /^[a-f0-9]{64}$/i.test(rawBuildKey) || Buffer.from(rawBuildKey, "base64").length === 32 || Buffer.byteLength(rawBuildKey, "utf8") === 32;
  const hasBuildToken = Boolean((process.env.GENE_BUILD_GITHUB_TOKEN || process.env.GENE_BUILD_TOKEN || process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "").trim());
  const hasBuildPassword = Boolean((process.env.GENE_BUILD_PASSWORD || process.env.BUILD_PASSWORD || "").trim());
  const buildConfigured = hasBuildToken && hasBuildPassword && validBuildKey;
  const hasPublishToken = Boolean((process.env.VERCEL_TOKEN || process.env.VERCEL_API_TOKEN)?.trim());
  const hasPublishProject = Boolean((process.env.VERCEL_PROJECT_ID || process.env.VERCEL_PROJECT)?.trim());
  const hasPublishPassword = Boolean(process.env.GENE_PUBLISH_PASSWORD?.trim());
  return NextResponse.json({
    ok: true,
    app: "gene-web",
    aiConfigured: hasGemini || hasGroq || hasOpenRouter,
    providers: { gemini: hasGemini, groq: hasGroq, openrouter: hasOpenRouter },
    model: hasGemini ? (process.env.GENE_FAST_MODEL || "gemini-3.8-flash") : hasGroq ? (process.env.GENE_GROQ_MODEL || "llama-3.3-70b-versatile") : hasOpenRouter ? (process.env.GENE_OPENROUTER_MODEL || "qwen/qwen3-coder:free") : "No provider configured",
    publishConfigured: hasPublishToken && hasPublishProject && hasPublishPassword,
    binaryBuildConfigured: buildConfigured,
    binaryBuildConfig: {
      configured: buildConfigured,
      missing: [
        ...(!hasBuildToken ? ["GitHub build token"] : []),
        ...(!hasBuildPassword ? ["GENE_BUILD_PASSWORD"] : []),
        ...(!validBuildKey ? ["32-byte encryption key (hex/base64/raw)"] : [])
      ]
    },
    timestamp: new Date().toISOString(),
  }, { headers: { "Cache-Control": "no-store, max-age=0, must-revalidate" } });
}
