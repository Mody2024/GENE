import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const sourcePath = fileURLToPath(new URL("../apps/web/app/lib/runtime-audio.ts", import.meta.url));
const source = await readFile(sourcePath, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
}).outputText;
const moduleUrl = "data:text/javascript;base64," + Buffer.from(compiled).toString("base64");
const { buildRuntimeAudioBootstrap } = await import(moduleUrl);

function executeBridge(files, audioEngine = {}) {
  const bootstrap = buildRuntimeAudioBootstrap(files);
  const script = bootstrap.replace(/^<script>\s*/, "").replace(/\s*<\/script>$/, "");
  const players = [];
  class MockAudio {
    constructor(src) { this.src = src; this.volume = 1; this.playbackRate = 1; players.push(this); }
    play() { this.playCalled = true; return Promise.resolve(); }
  }
  const engine = Object.assign({
    hasSavedSettings: () => true,
    sfx: () => true,
    music: { start: () => true }
  }, audioEngine);
  const document = { readyState: "complete", querySelectorAll: () => [] };
  vm.runInNewContext(script, { window: { GeneAudio: engine }, document, Audio: MockAudio, console });
  return { engine, players, bootstrap };
}

const goodAudio = "data:audio/mpeg;base64,QUJDRA==";
const largeAudio = "data:audio/mpeg;base64," + "A".repeat(2_000_100);
const mediumAudio = "data:audio/mpeg;base64," + "A".repeat(1_600_000);
const files = {
  "game-spec.json": JSON.stringify({
    audio: {
      enabled: true,
      volumes: { master: 0.5, music: 0.3, sfx: 0.7 },
      voiceOvers: [
        { id: "greeting", name: "Greeting", path: "assets/greeting.mp3" },
        { id: "too-large", name: "Too large", path: "assets/too-large.mp3" },
        { id: "budget-a", name: "Budget A", path: "assets/a.mp3" },
        { id: "budget-b", name: "Budget B", path: "assets/b.mp3" }
      ]
    }
  }),
  "assets/greeting.mp3": goodAudio,
  "assets/too-large.mp3": largeAudio,
  "assets/a.mp3": mediumAudio,
  "assets/b.mp3": mediumAudio,
  "assets/not-audio.txt": "data:text/plain;base64,QUJD"
};
const { engine, players } = executeBridge(files);
assert.deepEqual(Array.from(engine.voiceOvers, item => item.id), ["greeting", "budget-a"], "bridge embeds valid audio within individual and combined size limits");
const player = engine.playVoiceOver("greeting");
assert.ok(player, "saved voice-over ID resolves to a playable audio object");
assert.equal(player.src, goodAudio);
assert.equal(player.volume, 0.5, "voice-over volume respects the saved master volume");
assert.equal(player.playCalled, true);
assert.equal(engine.playVoiceOver("missing"), false, "missing voice-over IDs fail safely");

const disabled = executeBridge({
  "game-spec.json": JSON.stringify({ audio: { enabled: false, voiceOvers: [{ id: "line", path: "line.mp3" }] } }),
  "line.mp3": goodAudio
});
assert.equal(disabled.engine.playVoiceOver("line"), false, "disabled audio prevents voice-over playback");

console.log("Runtime audio bridge behavior passed.\n");
