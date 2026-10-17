/**
 * Shared portable file-path policy for the workspace QA panel and cloud packager.
 * Paths are validated, never silently rewritten: a source path must mean the same
 * thing in the browser, ZIP, Windows installer and Android packaging pipeline.
 */
const MAX_PATH_LENGTH = 240;
const INVALID_CONTROL = /[\\u0000-\\u001f\\u007f-\\u009f\\u200e\\u200f\\u202a-\\u202e\\u2066-\\u2069]/u;
const WINDOWS_RESERVED = /^(?:CON|PRN|AUX|NUL|CONIN\\$|CONOUT\\$|COM[1-9¹²³]|LPT[1-9¹²³])$/u;

export function normalizeProjectFilePath(value) {
  if (typeof value !== "string") return { ok: false, error: "File path must be a string." };
  const path = value;
  if (!path || !path.trim()) return { ok: false, error: "File path cannot be empty." };
  if (path.length > MAX_PATH_LENGTH) return { ok: false, error: "File path exceeds the portable 240-character limit." };
  if (path.includes("\\\\")) return { ok: false, error: "Use forward slashes in project paths; backslashes are not portable." };
  if (path.startsWith("/") || /^[a-zA-Z]:/.test(path)) return { ok: false, error: "Absolute paths are not allowed; use a project-relative path." };
  if (INVALID_CONTROL.test(path)) return { ok: false, error: "File path contains a control or bidirectional override character." };

  const parts = path.split("/");
  if (parts.some(part => !part || part === "." || part === "..")) {
    return { ok: false, error: "Empty, current-directory and parent-directory path segments are not allowed." };
  }
  for (const part of parts) {
    if (part.length > 255) return { ok: false, error: "A path segment exceeds the portable 255-character limit." };
    if (/[<>:"|?*]/u.test(part)) return { ok: false, error: "File path contains a character that is not portable to Windows." };
    if (/[ .]$/u.test(part)) return { ok: false, error: "Path segments cannot end in a dot or space on Windows." };
    const deviceBase = part.split(".")[0].replace(/[ .]+$/gu, "").toUpperCase();
    if (WINDOWS_RESERVED.test(deviceBase)) return { ok: false, error: "Path contains a reserved Windows device name: " + deviceBase + "." };
  }
  return { ok: true, path };
}

export function inspectProjectFilePaths(paths) {
  const invalid = [];
  const collisions = [];
  const seen = new Map();
  for (const value of paths) {
    const checked = normalizeProjectFilePath(value);
    if (!checked.ok) {
      invalid.push({ path: value, error: checked.error });
      continue;
    }
    const key = checked.path.normalize("NFC").toLowerCase();
    if (seen.has(key)) collisions.push({ path: checked.path, duplicateOf: seen.get(key) });
    else seen.set(key, checked.path);
  }
  return { ok: invalid.length === 0 && collisions.length === 0, invalid, collisions };
}
