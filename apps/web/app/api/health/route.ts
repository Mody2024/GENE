import { NextResponse } from "next/server";

export const runtime = "nodejs";
export async function GET() {
  return NextResponse.json({
    ok: true,
    app: "gene-web",
    aiConfigured: Boolean(process.env.GEMINI_API_KEY),
    model: process.env.GENE_FAST_MODEL || "gemini-3.8-flash",
    timestamp: new Date().toISOString(),
  });
}