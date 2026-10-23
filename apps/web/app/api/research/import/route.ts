import { NextRequest, NextResponse } from "next/server";
import { hasToolApproval } from "../../../lib/tool-permissions.mjs";
import { MAX_RESEARCH_IMPORT_BYTES, readBoundedImageResponse, validateResearchImportRequest } from "../../../lib/research-import.mjs";

export const runtime = "nodejs";
export const maxDuration = 15;

function fail(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  let body: any;
  try { body = await request.json(); } catch { return fail(400, "BAD_JSON", "Request body must be JSON."); }
  if (!hasToolApproval(body, "researchAssetImport")) {
    return fail(403, "TOOL_APPROVAL_REQUIRED", "Explicit approval for these exact research-import inputs is required.");
  }
  const validated = validateResearchImportRequest(body);
  if (!validated.ok || !validated.candidate) return fail(400, validated.code ?? "INVALID_RESEARCH_IMPORT", validated.message ?? "The research import request is invalid.");
  const candidate = validated.candidate;
  let response: Response;
  try {
    response = await fetch(candidate.sourceUrl, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
      headers: { Accept: "image/png,image/jpeg,image/webp", "User-Agent": "GENE-Research-Asset-Importer/1.0" },
      cache: "no-store"
    });
  } catch {
    return fail(502, "SOURCE_UNAVAILABLE", "The approved research image source could not be reached.");
  }
  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel().catch(() => {});
    return fail(400, "REDIRECT_NOT_ALLOWED", "Redirected image URLs are not accepted; use the final direct URL and review that source.");
  }
  const image = await readBoundedImageResponse(response, MAX_RESEARCH_IMPORT_BYTES);
  if (!image.ok) return fail(image.code === "IMAGE_TOO_LARGE" ? 413 : 422, image.code, image.message);
  return NextResponse.json({
    ok: true,
    asset: {
      title: candidate.title,
      sourceUrl: candidate.sourceUrl,
      sourcePage: candidate.sourcePage,
      license: candidate.license,
      attribution: candidate.attribution,
      licenseReviewConfirmed: true,
      importedAt: new Date().toISOString(),
      mimeType: image.mimeType,
      byteSize: image.byteSize,
      sha256: image.sha256,
      dataBase64: image.dataBase64
    }
  }, { headers: { "Cache-Control": "no-store" } });
}
