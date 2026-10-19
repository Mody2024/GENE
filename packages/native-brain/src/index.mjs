import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const MAX_RECORD_BYTES = 64 * 1024;
const MAX_QUERY_CHARS = 12_000;
const ALLOWED_ENGINES = new Set(["canvas2d", "webgl3d", "webapp"]);
const ALLOWED_KINDS = new Set(["game", "app"]);

function cleanText(value, max = 4000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function safeId(value) {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
}

/**
 * Local-first experience ledger. It stores observations, not model claims:
 * callers must pass test results and explicitly mark a record as verified.
 */
export function createExperienceStore({ root }) {
  if (!root) throw new TypeError("A persistent experience root is required.");
  const directory = path.resolve(root);
  const ledgerPath = path.join(directory, "experiences.jsonl");

  async function readRecords() {
    try {
      const raw = await readFile(ledgerPath, "utf8");
      return raw.split("\n").filter(Boolean).flatMap(line => {
        try {
          const row = JSON.parse(line);
          return row && row.schemaVersion === 1 && typeof row.id === "string" ? [row] : [];
        } catch { return []; }
      });
    } catch (error) {
      if (error?.code === "ENOENT") return [];
      throw error;
    }
  }

  return {
    async list({ limit = 100, verifiedOnly = false } = {}) {
      const rows = await readRecords();
      return rows.filter(row => !verifiedOnly || row.verified === true).slice(-Math.max(1, Math.min(500, limit))).reverse();
    },
    async add(input) {
      if (!input || typeof input !== "object") throw new TypeError("Experience record is required.");
      const task = cleanText(input.task, 160);
      const engine = cleanText(input.engine, 32);
      const summary = cleanText(input.summary, 4000);
      if (!task || !summary || !ALLOWED_ENGINES.has(engine)) throw new TypeError("task, summary, and a supported engine are required.");
      const tests = Array.isArray(input.tests) ? input.tests.slice(0, 80).map(test => ({
        name: cleanText(test?.name, 160),
        passed: test?.passed === true,
        detail: cleanText(test?.detail, 1000)
      })).filter(test => test.name) : [];
      const verified = input.verified === true && tests.length > 0 && tests.every(test => test.passed);
      const record = {
        schemaVersion: 1,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        task,
        engine,
        kind: ALLOWED_KINDS.has(input.kind) ? input.kind : "game",
        summary,
        tags: Array.isArray(input.tags) ? [...new Set(input.tags.map(tag => cleanText(tag, 60)).filter(Boolean))].slice(0, 30) : [],
        tests,
        verified
      };
      const serialized = JSON.stringify(record);
      if (Buffer.byteLength(serialized) > MAX_RECORD_BYTES) throw new RangeError("Experience record exceeds the size limit.");
      await mkdir(directory, { recursive: true });
      // Serialize writes by using an atomic replace; local-agent requests are short.
      const current = await readFile(ledgerPath, "utf8").catch(error => error?.code === "ENOENT" ? "" : Promise.reject(error));
      const temporary = ledgerPath + "." + crypto.randomBytes(6).toString("hex") + ".tmp";
      await writeFile(temporary, current + serialized + "\n", { encoding: "utf8", mode: 0o600 });
      await rename(temporary, ledgerPath);
      return record;
    },
    async retrieve(query, { limit = 5, verifiedOnly = true } = {}) {
      const needle = cleanText(query, MAX_QUERY_CHARS).toLowerCase();
      if (!needle) return [];
      const terms = [...new Set(needle.split(/[^a-z0-9_+-]+/i).filter(term => term.length > 2))];
      const rows = await readRecords();
      return rows.filter(row => !verifiedOnly || row.verified === true).map(row => {
        const haystack = [row.task, row.engine, row.kind, row.summary, ...(row.tags || [])].join(" ").toLowerCase();
        const score = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
        return { row, score };
      }).filter(item => item.score > 0).sort((a, b) => b.score - a.score || b.row.createdAt.localeCompare(a.row.createdAt))
        .slice(0, Math.max(1, Math.min(20, limit))).map(item => ({ ...item.row, retrievalScore: item.score }));
    }
  };
}

/**
 * Deterministic project brief normalizer. This does not pretend to be a trained
 * language model: it provides a safe, model-independent contract while the
 * from-scratch model is being trained and evaluated.
 */
export function createNativeBrief(input = {}) {
  const prompt = cleanText(input.prompt, MAX_QUERY_CHARS);
  if (!prompt) throw new TypeError("A non-empty game request is required.");
  const kind = input.kind === "app" ? "app" : "game";
  const requestedEngine = cleanText(input.engine, 32);
  const inferredEngine = requestedEngine || (kind === "app" ? "webapp" : /3d|three.?dimensional|third.?person|first.?person|open.?world/i.test(prompt) ? "webgl3d" : "canvas2d");
  if (!ALLOWED_ENGINES.has(inferredEngine) || (kind === "app" && inferredEngine !== "webapp")) {
    throw new TypeError("Unsupported engine for the selected project kind.");
  }
  const title = cleanText(input.title, 140) || prompt.split(/[.!?\n]/)[0].slice(0, 100) || "Untitled Gene Project";
  const systems = [];
  const patterns = [
    [/platform|jump|side.?scroll/i, "player movement and collision"],
    [/enemy|boss|combat|fight/i, "combat and enemy state"],
    [/inventory|item|collect|craft/i, "items and inventory"],
    [/quest|story|dialogue|mystery/i, "objectives and story progression"],
    [/save|progress|checkpoint/i, "save and checkpoint state"],
    [/menu|pause|settings|volume/i, "menus and settings"],
    [/world|level|map|explor/i, "world and level progression"]
  ];
  for (const [pattern, name] of patterns) if (pattern.test(prompt)) systems.push(name);
  if (!systems.includes("menus and settings")) systems.push("menus and settings");
  if (!systems.includes("world and level progression")) systems.push("world and level progression");
  return {
    schemaVersion: 1,
    mode: "native-scaffold",
    modelUsed: false,
    externalAiUsed: false,
    title,
    kind,
    engine: inferredEngine,
    request: prompt,
    systems,
    milestones: [
      { id: "spec", title: "Validate the design brief", required: true },
      { id: "core-loop", title: "Implement a playable core loop", required: true },
      { id: "ui-audio", title: "Add menus, feedback, and audio", required: true },
      { id: "tests", title: "Run build and gameplay checks", required: true },
      { id: "repair", title: "Repair failures and rerun regression checks", required: true }
    ],
    qualityGates: ["project-loads", "controls-respond", "objective-reachable", "no-console-errors", "regression-pass"]
  };
}
