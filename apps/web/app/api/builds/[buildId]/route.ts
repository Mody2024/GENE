import { NextRequest, NextResponse } from "next/server";
import { validateCloudBuildReport } from "../../../lib/cloud-build-report.mjs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
const API = "https://api.github.com";
const REPO = (process.env.GENE_BUILD_REPOSITORY || "Mody2024/GENE").split("/");
function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: { message } }, { status, headers: { "Cache-Control": "no-store" } });
}
async function gh(url: string, token: string) {
  return fetch(API + url, {
    headers: { Accept: "application/vnd.github+json", Authorization: "Bearer " + token, "X-GitHub-Api-Version": "2022-11-28" },
    cache: "no-store", signal: AbortSignal.timeout(15_000)
  });
}
export async function GET(_request: NextRequest, context: { params: { buildId: string } }) {
  const id = context.params.buildId;
  if (!/^[a-f0-9-]{36}$/.test(id)) return fail("Invalid build identifier.");
  const token = (process.env.GENE_BUILD_GITHUB_TOKEN || process.env.GENE_BUILD_TOKEN || process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "").trim();
  if (!token || REPO.length !== 2 || REPO.some(part => !part)) return fail("Cloud build status is not configured.", 503);
  const base = "/repos/" + REPO[0] + "/" + REPO[1];
  try {
    const resultResponse = await gh(base + "/contents/.gene-builds/" + id + ".result.json?ref=gene-build-" + id, token);
    if (resultResponse.ok) {
      const entry = await resultResponse.json();
      let decoded: unknown;
      try {
        decoded = JSON.parse(Buffer.from(String(entry.content || "").replace(/\\n/g, ""), "base64").toString("utf8"));
      } catch {
        return fail("The cloud build result is unreadable and cannot be trusted.", 502, "GENE_BUILD_RESULT_INVALID");
      }
      const checked = validateCloudBuildReport(decoded, id);
      if (!checked.ok) {
        return fail("The cloud build result failed verification: " + checked.reason, 502, "GENE_BUILD_RESULT_INVALID");
      }
      return NextResponse.json({ ok: true, ...checked.report }, { headers: { "Cache-Control": "no-store" } });
    }
    const runsResponse = await gh(base + "/actions/workflows/cloud-build.yml/runs?event=workflow_dispatch&per_page=100", token);
    if (runsResponse.ok) {
      const runs = await runsResponse.json();
      const run = (runs.workflow_runs || []).find((item: any) => String(item.display_title || "").includes(id));
      if (run) {
        if (run.status === "completed") return NextResponse.json({ ok: true, buildId: id, state: "failed", runUrl: run.html_url, message: "The workflow finished without publishing a build result. Open the build log to inspect the finalization or compiler error." }, { headers: { "Cache-Control": "no-store" } });
        return NextResponse.json({ ok: true, buildId: id, state: run.status === "in_progress" ? "building" : "queued", runUrl: run.html_url, message: "Cloud workers are compiling your project." }, { headers: { "Cache-Control": "no-store" } });
      }
    }
    return NextResponse.json({ ok: true, buildId: id, state: "queued", message: "Waiting for the cloud build worker to start." }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return fail("Could not retrieve cloud build status. Retry in a few seconds.", 502);
  }
}
