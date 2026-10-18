import type { PatchOperation } from "./types";

export type PatchResult = {
  files: Record<string, string>;
  changedPaths: string[];
  deletedPaths: string[];
};

const MAX_PATH_LENGTH = 240;
const MAX_FILE_BYTES = 500_000;
const MAX_PATCH_OPERATIONS = 100;
const MAX_PROJECT_FILES = 100;
const MAX_PROJECT_BYTES = 50_000_000;

function safePath(value: unknown): string {
  if (typeof value !== "string") throw new Error("Project path must be a string.");
  const path = value.replace(/\\/g, "/");
  if (!path || path.length > MAX_PATH_LENGTH || path.startsWith("/") ||
      /^[a-zA-Z]:/.test(path) || path.split("/").some(part => !part || part === "." || part === "..") ||
      /[<>:"|?*\u0000-\u001f]/.test(path)) {
    throw new Error("Unsafe project path: " + value);
  }
  return path;
}

function applyUnifiedDiff(original: string, patch: string): string {
  const lines = patch.replace(/\r\n/g, "\n").split("\n");
  const hunks: Array<{ oldStart: number; lines: Array<{ kind: " " | "+" | "-"; text: string }> }> = [];
  let current: typeof hunks[number] | null = null;
  for (const line of lines) {
    const header = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (header) {
      current = { oldStart: Number(header[1]), lines: [] };
      hunks.push(current);
      continue;
    }
    if (!current || line === "\\ No newline at end of file" || line.startsWith("--- ") || line.startsWith("+++ ")) continue;
    if (line.startsWith(" ") || line.startsWith("+") || line.startsWith("-")) {
      current.lines.push({ kind: line[0] as " " | "+" | "-", text: line.slice(1) });
    } else if (line.length) {
      throw new Error("Unsupported unified diff line; include standard @@ hunks and +/-/context lines.");
    }
  }
  if (!hunks.length) throw new Error("Unified diff contains no valid hunks.");
  const source = original.replace(/\r\n/g, "\n").split("\n");
  let cursor = 0;
  const output: string[] = [];
  for (const hunk of hunks) {
    const start = Math.max(0, hunk.oldStart - 1);
    if (start < cursor || start > source.length) throw new Error("Unified diff hunks overlap or start outside the current file.");
    output.push(...source.slice(cursor, start));
    cursor = start;
    for (const line of hunk.lines) {
      if (line.kind === " ") {
        if (source[cursor] !== line.text) throw new Error("Unified diff context mismatch at source line " + (cursor + 1) + ".");
        output.push(source[cursor++]);
      } else if (line.kind === "-") {
        if (source[cursor] !== line.text) throw new Error("Unified diff removal mismatch at source line " + (cursor + 1) + ".");
        cursor++;
      } else {
        output.push(line.text);
      }
    }
  }
  output.push(...source.slice(cursor));
  return output.join("\n");
}

/**
 * Applies a complete patch batch against a copy of the manifest. Any conflict
 * rejects the entire batch, so callers never receive a partially patched tree.
 */
export function applyPatchBatch(
  currentFiles: Record<string, string>,
  operations: PatchOperation[],
): PatchResult {
  if (!Array.isArray(operations) || operations.length === 0) throw new Error("A patch batch must contain at least one operation.");
  if (operations.length > MAX_PATCH_OPERATIONS) throw new Error("A patch batch cannot exceed " + MAX_PATCH_OPERATIONS + " operations.");
  if (!currentFiles || typeof currentFiles !== "object" || Array.isArray(currentFiles)) throw new Error("Current project files must be a file map.");
  const files: Record<string, string> = { ...currentFiles };
  if (Object.keys(files).length > MAX_PROJECT_FILES) throw new Error("Project exceeds the " + MAX_PROJECT_FILES + " file safety limit.");
  let totalBytes = 0;
  for (const [existingPath, content] of Object.entries(files)) {
    safePath(existingPath);
    if (typeof content !== "string") throw new Error("Project file content must be text: " + existingPath);
    totalBytes += BufferSize(content);
    if (BufferSize(content) > MAX_FILE_BYTES) throw new Error("Existing project file exceeds the 500 KB safety limit: " + existingPath);
  }
  if (totalBytes > MAX_PROJECT_BYTES) throw new Error("Project exceeds the 50 MB safety limit.");
  const changed = new Set<string>();
  const deleted = new Set<string>();
  for (const operation of operations) {
    if (!operation || typeof operation !== "object" || Array.isArray(operation)) throw new Error("Each patch operation must be an object.");
    if (!["add_file", "delete_file", "rename_file", "replace_exact", "replace_range", "apply_diff"].includes((operation as { op?: string }).op || "")) {
      throw new Error("Unsupported patch operation.");
    }
    const path = safePath(operation.path);
    if (operation.op === "add_file") {
      if (Object.prototype.hasOwnProperty.call(files, path)) throw new Error("Cannot add an existing file: " + path);
      if (typeof operation.content !== "string") throw new Error("New file content must be text: " + path);
      if (BufferSize(operation.content) > MAX_FILE_BYTES) throw new Error("New file exceeds the 500 KB safety limit: " + path);
      if (Object.keys(files).length >= MAX_PROJECT_FILES) throw new Error("Project cannot exceed " + MAX_PROJECT_FILES + " files.");
      files[path] = operation.content;
      totalBytes += BufferSize(operation.content);
      changed.add(path);
      deleted.delete(path);
    } else if (operation.op === "delete_file") {
      if (!Object.prototype.hasOwnProperty.call(files, path)) throw new Error("Cannot delete a missing file: " + path);
      totalBytes -= BufferSize(files[path]);
      delete files[path];
      changed.delete(path);
      deleted.add(path);
    } else if (operation.op === "rename_file") {
      const target = safePath(operation.newPath);
      if (!Object.prototype.hasOwnProperty.call(files, path)) throw new Error("Cannot rename a missing file: " + path);
      if (Object.prototype.hasOwnProperty.call(files, target)) throw new Error("Cannot rename over an existing file: " + target);
      if (target === path) throw new Error("Rename target must differ from the source path.");
      files[target] = files[path];
      delete files[path];
      changed.delete(path);
      deleted.add(path);
      changed.add(target);
      deleted.delete(target);
    } else {
      if (!Object.prototype.hasOwnProperty.call(files, path)) throw new Error("Cannot edit a missing file: " + path);
      const original = files[path];
      let next = original;
      if (operation.op === "replace_exact") {
        if (typeof operation.expected !== "string" || !operation.expected) throw new Error("Exact replacement requires non-empty expected text in " + path + ".");
        if (typeof operation.replacement !== "string") throw new Error("Exact replacement content must be text in " + path + ".");
        if (!original.includes(operation.expected)) throw new Error("Patch context is stale or missing in " + path + ".");
        const first = original.indexOf(operation.expected);
        if (original.indexOf(operation.expected, first + operation.expected.length) !== -1) {
          throw new Error("Patch context is ambiguous in " + path + "; use a more specific match.");
        }
        next = original.slice(0, first) + operation.replacement + original.slice(first + operation.expected.length);
      } else if (operation.op === "replace_range") {
        if (typeof operation.replacement !== "string") throw new Error("Range replacement content must be text in " + path + ".");
        const sourceLines = original.split("\n");
        if (!Number.isInteger(operation.startLine) || !Number.isInteger(operation.endLine) ||
            operation.startLine < 1 || operation.endLine < operation.startLine || operation.endLine > sourceLines.length) {
          throw new Error("Invalid line range for " + path + ".");
        }
        next = [...sourceLines.slice(0, operation.startLine - 1), operation.replacement, ...sourceLines.slice(operation.endLine)].join("\n");
      } else if (operation.op === "apply_diff") {
        if (typeof operation.patch !== "string" || !operation.patch.trim()) throw new Error("Unified diff content must be non-empty text in " + path + ".");
        next = applyUnifiedDiff(original, operation.patch);
      }
      if (BufferSize(next) > MAX_FILE_BYTES) throw new Error("Patched file exceeds the 500 KB safety limit: " + path);
      if (next !== original) {
        totalBytes += BufferSize(next) - BufferSize(original);
        if (BufferSize(next) > MAX_FILE_BYTES) throw new Error("Patched file exceeds the 500 KB safety limit: " + path);
        if (totalBytes > MAX_PROJECT_BYTES) throw new Error("Project exceeds the 50 MB safety limit.");
        files[path] = next;
        changed.add(path);
      }
    }
    if (totalBytes > MAX_PROJECT_BYTES) throw new Error("Project exceeds the 50 MB safety limit.");
  }
  return { files, changedPaths: [...changed], deletedPaths: [...deleted] };
}

function BufferSize(value: string): number {
  return new TextEncoder().encode(value).length;
}
