import { NextResponse } from "next/server";

export const runtime = "nodejs";
// This endpoint reports runtime environment state. Do not let Next.js statically
// render it during build, before deployment secrets are injected.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  return NextResponse.json({
    ok: true,
    app: "gene-web",
    aiConfigured: Boolean(process.env.GEMINI_API_KEY?.trim() || process.env.GEMINI_API_KEY_2?.trim() || process.env.GEMINI_API_KEY_3?.trim() || process.env.GEMINI_API_KEY_4?.trim() || process.env.GEMINI_API_KEY_5?.trim() || process.env.GEMINI_API_KEYS?.trim() || process.env.GROQ_API_KEY?.trim() || process.env.OPENROUTER_API_KEY?.trim()),
    providers: {
      gemini: Boolean(process.env.GEMINI_API_KEY?.trim() || process.env.GEMINI_API_KEY_2?.trim() || process.env.GEMINI_API_KEY_3?.trim() || process.env.GEMINI_API_KEY_4?.trim() || process.env.GEMINI_API_KEY_5?.trim() || process.env.GEMINI_API_KEYS?.trim()),
      groq: Boolean(process.env.GROQ_API_KEY?.trim()),
      openrouter: Boolean(process.env.OPENROUTER_API_KEY?.trim()),
    },
    model: process.env.GEMINI_API_KEY?.trim() || process.env.GEMINI_API_KEY_2?.trim() || process.env.GEMINI_API_KEY_3?.trim() || process.env.GEMINI_API_KEY_4?.trim() || process.env.GEMINI_API_KEY_5?.trim() || process.env.GEMINI_API_KEYS?.trim() ? (process.env.GENE_FAST_MODEL || "gemini-3.8-flash") : process.env.GROQ_API_KEY?.trim() ? (process.env.GENE_GROQ_MODEL || "llama-3.3-70b-versatile") : process.env.OPENROUTER_API_KEY?.trim() ? (process.env.GENE_OPENROUTER_MODEL || "qwen/qwen3-coder:free") : "No provider configured",
    publishConfigured: Boolean(process.env.VERCEL_TOKEN?.trim() && process.env.VERCEL_PROJECT_ID?.trim() && process.env.GENE_PUBLISH_PASSWORD?.trim()),
    binaryBuildConfigured: Boolean(process.env.GENE_BUILD_GITHUB_TOKEN?.trim() && Buffer.from(process.env.GENE_BUILD_ENCRYPTION_KEY || "", "base64").length === 32),
    timestamp: new Date().toISOString(),
  }, {
    headers: { "Cache-Control": "no-store, max-age=0, must-revalidate" },
  });
}
