/**
 * Validate cloud-build result records before exposing them to the browser.
 * The record is persisted by the GitHub Actions workflow; it is still treated
 * as untrusted data until its identity, state, and artifact evidence agree.
 */
const STATES = new Set(["success", "partial", "failed"]);
const TARGET_STATES = new Set(["success", "failure", "cancelled", "skipped"]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isHttpsUrl(value, allowedHost) {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && (!allowedHost || url.hostname === allowedHost || url.hostname.endsWith("." + allowedHost));
  } catch {
    return false;
  }
}

function isWorkflowRunUrl(value) {
  if (!isHttpsUrl(value, "github.com")) return false;
  try {
    const url = new URL(value);
    return /^\\/[^/]+\\/[^/]+\\/actions\\/runs\\/\\d+\\/?$/.test(url.pathname) && !url.search && !url.hash;
  } catch {
    return false;
  }
}

function expectedArtifactFilename(name, buildId) {
  return name === "windows"
    ? "GENE-" + buildId + "-Setup.exe"
    : "GENE-" + buildId + "-debug.apk";
}

function validSuccessfulTarget(name, target, buildId) {
  if (!isRecord(target) || target.status !== "success") return false;
  const expectedFilename = expectedArtifactFilename(name, buildId);
  if (target.filename !== expectedFilename) return false;
  if (!isHttpsUrl(target.url, "blob.vercel-storage.com")) return false;
  let linkedFilename = "";
  try {
    linkedFilename = decodeURIComponent(new URL(target.url).pathname.split("/").pop() || "");
  } catch {
    return false;
  }
  if (linkedFilename !== expectedFilename) return false;
  if (!Number.isSafeInteger(target.sizeBytes) || target.sizeBytes <= 0) return false;
  if (typeof target.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(target.sha256)) return false;
  if (name === "android" && target.signing !== "debug") return false;
  return true;
}

/**
 * Return a normalized report only when the state is internally consistent.
 * @param {unknown} input
 * @param {string} expectedBuildId
 * @returns {{ok: true, report: Record<string, unknown>} | {ok: false, reason: string}}
 */
export function validateCloudBuildReport(input, expectedBuildId) {
  if (!isRecord(input)) return { ok: false, reason: "Build result must be a JSON object." };
  if (typeof expectedBuildId !== "string" || !/^[a-f0-9-]{36}$/i.test(expectedBuildId) || input.buildId !== expectedBuildId) {
    return { ok: false, reason: "Build result ID does not match the requested build." };
  }
  if (!STATES.has(input.state)) return { ok: false, reason: "Build result has an unsupported state." };
  if (!isRecord(input.targets)) return { ok: false, reason: "Build result is missing target outcomes." };
  const names = Object.keys(input.targets);
  if (names.length < 1 || names.some(name => name !== "windows" && name !== "android")) {
    return { ok: false, reason: "Build result contains invalid target names." };
  }
  const targets = input.targets;
  const normalizedTargets = {};
  for (const name of names) {
    const target = targets[name];
    if (!isRecord(target) || !TARGET_STATES.has(target.status)) {
      return { ok: false, reason: "Build result contains an invalid " + name + " status." };
    }
    if (target.filename !== expectedArtifactFilename(name, expectedBuildId)) {
      return { ok: false, reason: "Build result contains an unexpected " + name + " artifact filename." };
    }
    if (target.status === "success" && !validSuccessfulTarget(name, target, expectedBuildId)) {
      return { ok: false, reason: "Successful " + name + " output is missing valid artifact evidence." };
    }
    if (target.status !== "success" && target.url != null) {
      return { ok: false, reason: "A non-successful " + name + " target must not expose a download URL." };
    }
    // Only return the documented fields. Never echo arbitrary worker metadata
    // (which could accidentally contain secrets or unbounded attacker-controlled values).
    normalizedTargets[name] = target.status === "success"
      ? {
          status: target.status,
          filename: target.filename,
          url: target.url,
          sizeBytes: target.sizeBytes,
          sha256: target.sha256,
          ...(name === "android" ? { signing: target.signing } : {})
        }
      : { status: target.status, filename: target.filename };
  }
  const successes = names.filter(name => targets[name].status === "success" && validSuccessfulTarget(name, targets[name], expectedBuildId)).length;
  const expectedState = successes === names.length ? "success" : successes > 0 ? "partial" : "failed";
  if (input.state !== expectedState) {
    return { ok: false, reason: "Build result state conflicts with the target outcomes." };
  }
  if (!isWorkflowRunUrl(input.runUrl) || typeof input.completedAt !== "string" || !Number.isFinite(Date.parse(input.completedAt))) {
    return { ok: false, reason: "Build result is missing a valid workflow link or completion timestamp." };
  }
  return {
    ok: true,
    report: {
      buildId: expectedBuildId,
      state: expectedState,
      targets: normalizedTargets,
      runUrl: input.runUrl,
      completedAt: input.completedAt,
      ...(typeof input.note === "string" ? { note: input.note.slice(0, 500) } : {})
    }
  };
}
