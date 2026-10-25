import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const sourcePath = fileURLToPath(new URL("./runtime-audio.ts", import.meta.url));
const source = await readFile(sourcePath, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
}).outputText;
const moduleUrl = "data:text/javascript;base64," + Buffer.from(compiled).toString("base64");
const { buildRuntimeAudioBootstrap } = await import(moduleUrl);

function runAudioManifest(spec, extraFiles = {}) {
  const files = { "game-spec.json": JSON.stringify(spec), ...extraFiles };
  const bootstrap = buildRuntimeAudioBootstrap(files);
  const scripts = Array.from(bootstrap.matchAll(/<script>([\s\S]*?)<\/script>/g));
  assert.equal(scripts.length, 1, "audio manifest is emitted as one runtime script");
  const calls = { volumes: [], sfx: [], music: [], players: [] };
  const audio = {
    __manifestConfigured: false,
    hasSavedSettings: () => false,
    setVolume: (bus, value) => calls.volumes.push([bus, value]),
    sfx: name => { calls.sfx.push(name); return name; },
    music: { start: mood => { calls.music.push(mood); return mood; } },
    setMuted: value => { calls.muted = value; },
    getSettings: () => ({ muted: !!calls.muted }),
  };
  class MockAudio {
    constructor(src) { this.src = src; this.volume = 1; this.playbackRate = 1; calls.players.push(this); }
    play() { this.played = true; return Promise.resolve(); }
  }
  const document = {
    readyState: "complete",
    querySelectorAll: () => [],
    addEventListener() {},
  };
  const context = { console, document, Audio: MockAudio, Math, Number, String, Object, Array, JSON };
  context.window = context;
  context.GeneAudio = audio;
  vm.runInNewContext(scripts[0][1], context);
  return { audio, calls, context, bootstrap };
}

test("Audio Studio manifest applies saved volumes and maps gameplay events to SFX", () => {
  const { audio, calls } = runAudioManifest({
    audio: {
      enabled: true,
      volumes: { master: 0.7, music: 0.25, sfx: 0.6 },
      events: { jump: "jump-sfx", collect: "coin-sfx" }
    }
  });
  assert.deepEqual(calls.volumes, [["master", 0.7], ["music", 0.25], ["sfx", 0.6]]);
  assert.equal(audio.sfx("jump"), "jump-sfx");
  assert.equal(audio.playSfx("collect"), "coin-sfx");
  assert.deepEqual(calls.sfx, ["jump-sfx", "coin-sfx"]);
  audio.music.start("calm");
  assert.deepEqual(calls.music, ["calm"]);
});

test("saved voice-over assets play with bounded volume and playback rate", () => {
  const voice = "data:audio/wav;base64,QUJDRA==";
  const { audio, calls } = runAudioManifest({
    audio: {
      enabled: true,
      volumes: { master: 0.5, music: 0.3, sfx: 0.8 },
      voiceOvers: [{ id: "intro", name: "Intro voice", path: "assets/audio/intro.wav" }]
    }
  }, { "assets/audio/intro.wav": voice });
  const player = audio.playVoiceOver("intro", { volume: 0.8, playbackRate: 1.5 });
  assert.ok(player);
  assert.equal(player.src, voice);
  assert.equal(player.volume, 0.4);
  assert.equal(player.playbackRate, 1.5);
  assert.equal(player.played, true);
  assert.equal(calls.players.length, 1);
});

test("disabled audio gates effects, music, and voice-over playback", () => {
  const { audio, calls } = runAudioManifest({
    audio: {
      enabled: false,
      volumes: { master: 0.8, music: 0.4, sfx: 0.8 },
      voiceOvers: [{ id: "intro", path: "assets/audio/intro.wav" }]
    }
  }, { "assets/audio/intro.wav": "data:audio/wav;base64,QUJDRA==" });
  assert.equal(audio.sfx("jump"), false);
  assert.equal(audio.music.start("calm"), false);
  assert.equal(audio.playVoiceOver("intro"), false);
  assert.equal(calls.players.length, 0);
});

test("audio bootstrap excludes missing, non-audio, and oversized voice-over payloads", () => {
  const oversized = "data:audio/wav;base64," + "A".repeat(2_100_000);
  const { audio } = runAudioManifest({
    audio: {
      enabled: true,
      voiceOvers: [
        { id: "missing", path: "assets/audio/missing.wav" },
        { id: "bad", path: "assets/audio/bad.txt" },
        { id: "large", path: "assets/audio/large.wav" },
        { id: "valid", path: "assets/audio/valid.wav" }
      ]
    }
  }, {
    "assets/audio/bad.txt": "data:text/plain;base64,QUJD",
    "assets/audio/large.wav": oversized,
    "assets/audio/valid.wav": "data:audio/wav;base64,QUJDRA=="
  });
  assert.deepEqual(Array.from(audio.voiceOvers, item => item.id), ["valid"]);
});
