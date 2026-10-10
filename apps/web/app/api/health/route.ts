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
    aiConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()),
    model: process.env.GENE_FAST_MODEL || "gemini-3.8-flash",
    timestamp: new Date().toISOString(),
  }, {
    headers: { "Cache-Control": "no-store, max-age=0, must-revalidate" },
  });
}
