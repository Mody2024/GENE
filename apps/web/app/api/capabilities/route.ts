import { NextRequest, NextResponse } from "next/server";
import { getStudioCapabilities } from "../../lib/studio-contract";
import type { StudioEngine, StudioProjectKind } from "../../lib/studio-contract";

export const runtime = "nodejs";

const ENGINES = new Set<StudioEngine>(["canvas2d", "webgl3d", "webapp"]);

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const kindValue = params.get("kind") || "game";
  const engineValue = params.get("engine") || (kindValue === "app" ? "webapp" : "canvas2d");
  if (kindValue !== "game" && kindValue !== "app") {
    return NextResponse.json({ ok: false, error: { code: "INVALID_PROJECT_KIND", message: "kind must be game or app." } }, { status: 400 });
  }
  if (!ENGINES.has(engineValue as StudioEngine)) {
    return NextResponse.json({ ok: false, error: { code: "INVALID_ENGINE", message: "engine must be canvas2d, webgl3d, or webapp." } }, { status: 400 });
  }
  const kind = kindValue as StudioProjectKind;
  const engine = engineValue as StudioEngine;
  const capabilities = getStudioCapabilities(kind, engine);
  return NextResponse.json({
    ok: true,
    version: "1.7-roadmap-v1",
    kind,
    engine,
    capabilities,
    note: "Capability levels describe builder support and requirements, not proof that a specific project feature or release artifact has been implemented or verified."
  }, { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } });
}
