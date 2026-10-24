import { NextRequest, NextResponse } from "next/server";
import { isGatedTool, issueToolApproval } from "../../lib/tool-approval-server.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 1_500_000;
const buckets = new Map<string, { count: number; resetAt: number }>();

function fail(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * Issues a signed, expiring, single-use approval for ONE exact tool call, after the browser has shown the user
 * the proposal and the user accepted it. Only same-origin browser requests are accepted, so another website
 * cannot obtain approvals on the user's behalf. The approval is useless for any other inputs or tool.
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  let originHost = "";
  try { originHost = origin ? new URL(origin).host : ""; } catch { originHost = ""; }
  if (!origin || !host || originHost !== host) return fail(403, "APPROVAL_ORIGIN", "Approvals can only be requested from the GENE workspace itself.");
  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_BODY_BYTES) return fail(413, "REQUEST_TOO_LARGE", "This tool call is too large to approve.");
  let body: any;
  try { body = await request.json(); } catch { return fail(400, "BAD_JSON", "Request body must be valid JSON."); }
  const tool = typeof body?.tool === "string" ? body.tool : "";
  if (!isGatedTool(tool)) return fail(400, "UNKNOWN_TOOL", "Unknown tool.");
  if (!body.input || typeof body.input !== "object" || Array.isArray(body.input)) return fail(400, "INPUT_REQUIRED", "Provide the exact tool input that the user approved.");
  const client = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
  const now = Date.now();
  const bucket = buckets.get(client);
  if (!bucket || bucket.resetAt <= now) buckets.set(client, { count: 1, resetAt: now + 60_000 });
  else if (++bucket.count > 60) return fail(429, "GENE_RATE_LIMIT", "Too many approval requests. Please wait a minute.");
  return NextResponse.json({ ok: true, approval: issueToolApproval(tool, body.input, now) }, { headers: { "Cache-Control": "no-store" } });
}
