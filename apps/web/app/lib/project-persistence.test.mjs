import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// Exercise the pure snapshot helpers without requiring browser IndexedDB.
const sourcePath = fileURLToPath(new URL("./project-persistence.ts", import.meta.url));
const source = await readFile(sourcePath, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
}).outputText;
const moduleUrl = "data:text/javascript;base64," + Buffer.from(compiled).toString("base64");
const { normalizeDurableProjectSnapshot, mergeDurableProjectSnapshots, reconcileDurableProjectWorkspace } = await import(moduleUrl);

function project(id, updatedAt = "2026-10-24T10:00:00.000Z") {
  return { id, name: id, updatedAt, files: {}, versions: [], references: [] };
}

test("normalization drops duplicate IDs and projects marked deleted", () => {
  const result = normalizeDurableProjectSnapshot({
    projects: [project("keep"), project("keep", "2026-10-25T10:00:00.000Z"), project("gone")],
    deletedProjectIds: ["gone"], activeProjectId: "gone", savedAt: "2026-10-24T10:00:00.000Z"
  });
  assert.deepEqual(result.projects.map(item => item.id), ["keep"]);
  assert.equal(result.activeProjectId, "");
});

test("normalization rejects an active ID not present in retained projects", () => {
  const result = normalizeDurableProjectSnapshot({
    projects: [project("one")], activeProjectId: "missing", savedAt: "2026-10-24T10:00:00.000Z"
  });
  assert.equal(result.activeProjectId, "");
});

test("snapshot merge preserves current versions for duplicate IDs", () => {
  const current = { projects: [project("shared")], activeProjectId: "shared", savedAt: "2026-10-24T10:00:00.000Z", deletedProjectIds: [] };
  const recovered = { projects: [project("shared", "2026-10-23T10:00:00.000Z"), project("recovered")], activeProjectId: "recovered", savedAt: "2026-10-23T10:00:00.000Z", deletedProjectIds: [] };
  const result = mergeDurableProjectSnapshots(current, recovered);
  assert.deepEqual(result.projects.map(item => item.id), ["shared", "recovered"]);
  assert.equal(result.projects[0].updatedAt, "2026-10-24T10:00:00.000Z");
  assert.equal(result.activeProjectId, "shared");
});

test("snapshot tombstones prevent recovered projects from being resurrected", () => {
  const current = { projects: [project("current")], activeProjectId: "current", savedAt: "2026-10-24T10:00:00.000Z", deletedProjectIds: ["deleted"] };
  const recovered = { projects: [project("deleted"), project("recovered")], activeProjectId: "deleted", savedAt: "2026-10-23T10:00:00.000Z", deletedProjectIds: [] };
  const result = mergeDurableProjectSnapshots(current, recovered);
  assert.deepEqual(result.projects.map(item => item.id), ["current", "recovered"]);
  assert.equal(result.activeProjectId, "current");
  assert.deepEqual(result.deletedProjectIds, ["deleted"]);
});

test("snapshot merge chooses a valid timestamp when the other is invalid", () => {
  const current = { projects: [project("a")], activeProjectId: "a", savedAt: "not-a-date", deletedProjectIds: [] };
  const recovered = { projects: [project("b")], activeProjectId: "b", savedAt: "2026-10-24T12:00:00.000Z", deletedProjectIds: [] };
  const result = mergeDurableProjectSnapshots(current, recovered);
  assert.equal(result.savedAt, "2026-10-24T12:00:00.000Z");
});

test("normalization bounds workspace size, references, versions, and identifiers", () => {
  const tooLongId = "x".repeat(257);
  const projects = [
    { ...project("bounded"), references: Array.from({ length: 120 }, (_, i) => ({ id: i })), versions: Array.from({ length: 12 }, (_, i) => ({ number: i })) },
    project(tooLongId),
    ...Array.from({ length: 10 }, (_, i) => project("project-" + i))
  ];
  const result = normalizeDurableProjectSnapshot({
    projects,
    activeProjectId: "bounded",
    savedAt: "2026-10-24T12:00:00.000Z",
    deletedProjectIds: []
  });
  assert.ok(result.projects.length <= 8);
  assert.equal(result.projects.some(item => item.id === tooLongId), false);
  assert.equal(result.projects.find(item => item.id === "bounded").references.length, 100);
  assert.equal(result.projects.find(item => item.id === "bounded").versions.length, 8);
});

test("normalization safely handles non-object and malformed snapshot input", () => {
  assert.equal(normalizeDurableProjectSnapshot(null), null);
  assert.equal(normalizeDurableProjectSnapshot("not a snapshot"), null);
  assert.equal(normalizeDurableProjectSnapshot({ projects: "invalid" }), null);
});

test("snapshot merge falls back to a valid recovered active project when current selection is stale", () => {
  const current = {
    projects: [project("current")],
    activeProjectId: "deleted-current-selection",
    savedAt: "2026-10-24T12:00:00.000Z",
    deletedProjectIds: ["deleted-current-selection"]
  };
  const recovered = {
    projects: [project("recovered")],
    activeProjectId: "recovered",
    savedAt: "2026-10-24T11:00:00.000Z",
    deletedProjectIds: []
  };
  const result = mergeDurableProjectSnapshots(current, recovered);
  assert.equal(result.activeProjectId, "recovered");
  assert.deepEqual(result.projects.map(item => item.id), ["current", "recovered"]);
});

test("workspace reconciliation applies durable deletion tombstones to legacy local data", () => {
  const local = [project("keep"), project("deleted")];
  const durable = {
    projects: [project("durable")],
    activeProjectId: "durable",
    savedAt: "2026-10-24T12:00:00.000Z",
    deletedProjectIds: ["deleted"]
  };
  const result = reconcileDurableProjectWorkspace(local, "deleted", durable);
  assert.deepEqual(result.projects.map(item => item.id), ["keep", "durable"]);
  assert.equal(result.activeProjectId, "durable");
});

test("workspace reconciliation prefers the newest duplicate and retains local ordering", () => {
  const local = [project("second", "2026-10-24T12:00:00.000Z"), project("shared", "2026-10-25T12:00:00.000Z")];
  const durable = {
    projects: [project("shared", "2026-10-23T12:00:00.000Z"), project("first")],
    activeProjectId: "first",
    savedAt: "2026-10-24T12:00:00.000Z",
    deletedProjectIds: []
  };
  const result = reconcileDurableProjectWorkspace(local, "second", durable);
  assert.deepEqual(result.projects.map(item => item.id), ["second", "shared", "first"]);
  assert.equal(result.projects.find(item => item.id === "shared").updatedAt, "2026-10-25T12:00:00.000Z");
  assert.equal(result.activeProjectId, "second");
});

test("workspace reconciliation rejects stale active IDs and falls back to a valid project", () => {
  const result = reconcileDurableProjectWorkspace(
    [project("local")],
    "missing",
    { projects: [project("durable")], activeProjectId: "durable", savedAt: "", deletedProjectIds: [] }
  );
  assert.equal(result.activeProjectId, "local");
});

test("durable database opening closes a connection that succeeds after a blocked-open rejection", async () => {
  const source = await readFile(sourcePath, "utf8");
  assert.match(source, /request\.onblocked = \(\) => \{[\s\S]*?settled = true;[\s\S]*?Durable project storage is blocked/);
  assert.match(source, /if \(settled\) \{\s*database\.close\(\);\s*return;\s*\}/);
});

test("durable reads wait for transaction completion and reject transaction aborts", async () => {
  const source = await readFile(sourcePath, "utf8");
  assert.match(source, /Resolve only after the transaction commits/);
  assert.match(source, /transaction\.oncomplete = \(\) => \{\s*if \(requestFinished\) resolve\(result\);/);
  assert.match(source, /transaction\.onabort = \(\) => reject\(transaction\.error \|\| new Error\("Durable project read transaction was aborted\."\)\)/);
});
