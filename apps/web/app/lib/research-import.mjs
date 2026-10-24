import { createHash } from "node:crypto";
import { hasValidImageSignature } from "./research-sources.mjs";

export const MAX_RESEARCH_IMPORT_BYTES = 350_000;
export const RESEARCH_IMPORT_HOSTS = new Set([
  "upload.wikimedia.org",
  "images.unsplash.com",
  "cdn.polyhaven.com"
]);
export const RESEARCH_IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/webp"]);
export const RESEARCH_SOURCE_PAGE_HOSTS = new Set([...RESEARCH_IMPORT_HOSTS, "commons.wikimedia.org", "unsplash.com", "polyhaven.com"]);
const SOURCE_PAGE_HOSTS_BY_IMAGE_HOST = new Map([
  ["upload.wikimedia.org", new Set(["commons.wikimedia.org", "wikipedia.org"])],
  ["images.unsplash.com", new Set(["unsplash.com"])],
  ["cdn.polyhaven.com", new Set(["polyhaven.com"])]
]);

export function validateResearchImportRequest(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, code: "BAD_REQUEST", message: "An asset candidate is required." };
  if (input.licenseReviewConfirmed !== true) return { ok: false, code: "LICENSE_REVIEW_REQUIRED", message: "Review the source license and attribution before importing this image." };
  const license = typeof input.license === "string" ? input.license.trim().slice(0, 160) : "";
  const attribution = typeof input.attribution === "string" ? input.attribution.trim().slice(0, 500) : "";
  const title = typeof input.title === "string" ? input.title.trim().slice(0, 160) : "Imported research image";
  let sourceUrl, sourcePage;
  try {
    sourceUrl = new URL(String(input.sourceUrl || ""));
    sourcePage = new URL(String(input.sourcePage || ""));
  } catch {
    return { ok: false, code: "INVALID_SOURCE_URL", message: "A valid direct image URL and source page are required." };
  }
  if (sourceUrl.protocol !== "https:" || sourceUrl.username || sourceUrl.password || !RESEARCH_IMPORT_HOSTS.has(sourceUrl.hostname.toLowerCase()) || sourceUrl.port && sourceUrl.port !== "443") {
    return { ok: false, code: "SOURCE_HOST_NOT_ALLOWED", message: "Only HTTPS images from approved research hosts can be imported." };
  }
  if (sourcePage.protocol !== "https:" || sourcePage.username || sourcePage.password || !(RESEARCH_SOURCE_PAGE_HOSTS.has(sourcePage.hostname.toLowerCase()) || sourcePage.hostname.toLowerCase().endsWith(".wikipedia.org")) || sourcePage.port && sourcePage.port !== "443") {
    return { ok: false, code: "SOURCE_PAGE_NOT_ALLOWED", message: "The source page must be HTTPS on an approved research host." };
  }
  const allowedPageHosts = SOURCE_PAGE_HOSTS_BY_IMAGE_HOST.get(sourceUrl.hostname.toLowerCase());
  const pageHost = sourcePage.hostname.toLowerCase();
  const pageHostMatches = allowedPageHosts && [...allowedPageHosts].some(host => pageHost === host || pageHost.endsWith("." + host));
  if (!pageHostMatches) return { ok: false, code: "SOURCE_PAGE_MISMATCH", message: "The source page must belong to the same approved provider as the direct image URL." };
  if (!license) return { ok: false, code: "LICENSE_REQUIRED", message: "Record the reviewed license before importing." };
  return {
    ok: true,
    candidate: {
      title, sourceUrl: sourceUrl.toString(), sourcePage: sourcePage.toString(),
      license, attribution, host: sourceUrl.hostname.toLowerCase()
    }
  };
}

export async function readBoundedImageResponse(response, maxBytes = MAX_RESEARCH_IMPORT_BYTES) {
  if (!response || !response.ok || !response.body) return { ok: false, code: "SOURCE_FETCH_FAILED", message: "The approved source did not return an image response." };
  const mimeType = String(response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!RESEARCH_IMAGE_MIMES.has(mimeType)) {
    await response.body.cancel().catch(() => {});
    return { ok: false, code: "UNSUPPORTED_IMAGE_MIME", message: "Only PNG, JPEG, and WebP images can be imported." };
  }
  const length = Number(response.headers.get("content-length") || 0);
  if (length > maxBytes) {
    await response.body.cancel().catch(() => {});
    return { ok: false, code: "IMAGE_TOO_LARGE", message: "The source image exceeds the import byte limit." };
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return { ok: false, code: "IMAGE_TOO_LARGE", message: "The streamed image exceeded the import byte limit." };
      }
      chunks.push(Buffer.from(value));
    }
  } catch {
    // Stop any still-active source stream when a read fails; never leave a fetch body running.
    await reader.cancel().catch(() => {});
    return { ok: false, code: "SOURCE_READ_FAILED", message: "The image response could not be read completely." };
  } finally {
    try { reader.releaseLock(); } catch { /* The stream may already have released its lock. */ }
  }
  const bytes = Buffer.concat(chunks, total);
  if (!bytes.length || !hasValidImageSignature(mimeType, bytes)) return { ok: false, code: "IMAGE_SIGNATURE_MISMATCH", message: "The downloaded bytes do not match the declared image type." };
  return {
    ok: true, mimeType, byteSize: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    dataBase64: bytes.toString("base64")
  };
}
