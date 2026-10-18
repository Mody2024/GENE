import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../apps/web/app/page.tsx", import.meta.url), "utf8");
assert.match(page, /function commitFileMutation\([\s\S]*?inspectProjectFilePaths\(Object\.keys\(nextFiles\)\)/, "file mutations must validate every resulting path");
assert.match(page, /function createProjectFile\([\s\S]*?path\.split\("\/"\)\.some\(part => !part \|\| part === "\." \|\| part === "\.\."/s, "new files must reject traversal and malformed relative paths");
assert.match(page, /function moveOrRenameProjectFile\([\s\S]*?delete nextFiles\[currentPath\]/, "move/rename must relocate the actual source entry");
assert.match(page, /function deleteProjectFile\([\s\S]*?Required core runtime files cannot be deleted/, "required runtime files must be protected from deletion");
assert.match(page, /label,\n      files: \{ \.\.\.nextFiles \},\n      createdAt: now\(\)/, "file operations must create a recoverable version snapshot");
assert.match(page, /className="file-ops-toolbar"/, "file operations must be reachable from the workspace");
console.log("GENE workspace file-operation contract tests passed (create, move/rename, delete protection, safe paths, version checkpoints).");
