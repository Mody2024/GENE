import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildRuntimeAudioBootstrap } from "../apps/web/app/lib/runtime-audio.ts";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const studio = read("apps/web/app/components/VoiceOverStudio.tsx");
const audioStudio = read("apps/web/app/components/AudioStudio.tsx");
const prompts = read("apps/web/app/lib/prompts.ts");

assert.ok(audioStudio.includes("VoiceOverStudio"), "Audio Studio mounts the voice-over workshop");
assert.ok(studio.includes("getUserMedia") && studio.includes("MediaRecorder"), "voice-over workshop supports microphone recording");
assert.ok(studio.includes('accept="audio/*"') && studio.includes("saveAsset(data"), "voice-over workshop imports and saves real audio assets");
assert.ok(studio.includes("speechSynthesis") && studio.includes("utterance.pitch") && studio.includes("utterance.rate"), "browser speech preview exposes voice, pitch and rate controls");
assert.ok(prompts.includes("VOICE-OVER ASSET WORKFLOW") && prompts.includes("do not force voice acting"), "game generation treats voice-over as optional and context-aware");
assert.ok(prompts.includes("GeneAudio.playVoiceOver(id"), "game generation knows how to connect saved voice-over assets");

const sample = "data:audio/webm;base64,QUJD";
const files = {
  "game-spec.json": JSON.stringify({ audio: { enabled: true, volumes: { master: 0.8, music: 0.3, sfx: 0.7 }, voiceOvers: [{ id: "intro", name: "Intro", path: "assets/voiceovers/intro.webm" }] } }),
  "assets/voiceovers/intro.webm": sample
};
const runtime = buildRuntimeAudioBootstrap(files);
assert.ok(runtime.includes("playVoiceOver"), "runtime exposes voice-over playback");
assert.ok(runtime.includes(sample), "runtime embeds validated saved audio assets");
assert.ok(!buildRuntimeAudioBootstrap({ "game-spec.json": files["game-spec.json"] }).includes(sample), "runtime skips missing voice-over assets");
const disabled = buildRuntimeAudioBootstrap({ "game-spec.json": JSON.stringify({ audio: { enabled: false, voiceOvers: [{ id: "intro", path: "assets/voiceovers/intro.webm" }] } }), "assets/voiceovers/intro.webm": sample });
assert.ok(disabled.includes("if(!item||!item.src||!cfg.enabled)return false"), "runtime respects the game's audio-disabled setting");
console.log("Voice-over asset workflow contract passed.");
