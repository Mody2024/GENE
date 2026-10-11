import type { PatchOperation } from "./types";

export type PatchResult = {
  files: Record<string, string>;
  changedPaths: string[];
  deletedPaths: string[];
};

const MAX_PATH_LENGTH = 240;
const MAX_FILE_BYTES = 500_000;

function safePath(value: string): string {
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
  const files = { ...currentFiles };
  const changed = new Set<string>();
  const deleted = new Set<string>();
  for (const operation of operations) {
    const path = safePath(operation.path);
    if (operation.op === "add_file") {
      if (Object.prototype.hasOwnProperty.call(files, path)) throw new Error("Cannot add an existing file: " + path);
      files[path] = operation.content;
      changed.add(path);
      deleted.delete(path);
    } else if (operation.op === "delete_file") {
      if (!Object.prototype.hasOwnProperty.call(files, path)) throw new Error("Cannot delete a missing file: " + path);
      delete files[path];
      changed.delete(path);
      deleted.add(path);
    } else if (operation.op === "rename_file") {
      const target = safePath(operation.newPath);
      if (!Object.prototype.hasOwnProperty.call(files, path)) throw new Error("Cannot rename a missing file: " + path);
      if (Object.prototype.hasOwnProperty.call(files, target)) throw new Error("Cannot rename over an existing file: " + target);
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
        if (!operation.expected || !original.includes(operation.expected)) throw new Error("Patch context is stale or missing in " + path + ".");
        const first = original.indexOf(operation.expected);
        if (original.indexOf(operation.expected, first + operation.expected.length) !== -1) {
          throw new Error("Patch context is ambiguous in " + path + "; use a more specific match.");
        }
        next = original.slice(0, first) + operation.replacement + original.slice(first + operation.expected.length);
      } else if (operation.op === "replace_range") {
        const sourceLines = original.split("\n");
        if (!Number.isInteger(operation.startLine) || !Number.isInteger(operation.endLine) ||
            operation.startLine < 1 || operation.endLine < operation.startLine || operation.endLine > sourceLines.length) {
          throw new Error("Invalid line range for " + path + ".");
        }
        next = [...sourceLines.slice(0, operation.startLine - 1), operation.replacement, ...sourceLines.slice(operation.endLine)].join("\n");
      } else if (operation.op === "apply_diff") {
        next = applyUnifiedDiff(original, operation.patch);
      }
      if (BufferSize(next) > MAX_FILE_BYTES) throw new Error("Patched file exceeds the 500 KB safety limit: " + path);
      if (next !== original) {
        files[path] = next;
        changed.add(path);
      }
    }
  }
  return { files, changedPaths: [...changed], deletedPaths: [...deleted] };
}

function BufferSize(value: string): number {
  return new TextEncoder().encode(value).length;
}
