import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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

const runtime = read("apps/web/app/lib/runtime-audio.ts");
assert.ok(runtime.includes("playVoiceOver"), "runtime exposes voice-over playback");
assert.ok(runtime.includes("voiceOvers.push({ id: item.id"), "runtime maps saved voice-over metadata");
assert.ok(runtime.includes("data:audio\\/[a-z0-9.+-]+;base64,"), "runtime only embeds base64 audio data URLs");
assert.ok(runtime.includes("voiceBytes + approximateBytes > 2_000_000"), "runtime enforces a combined voice-over asset size budget");
assert.ok(runtime.includes("if(!item||!item.src||!cfg.enabled)return false"), "runtime respects the game's audio-disabled setting");
const studioAfterRemoval = read("apps/web/app/components/VoiceOverStudio.tsx");
assert.ok(studioAfterRemoval.includes("delete nextFiles[removedLine.path]"), "removing the final reference to a voice-over also removes its unused asset");
assert.ok(studioAfterRemoval.includes("existingVoiceBytes + incomingVoiceBytes > 2_000_000"), "voice-over editor rejects assets beyond the runtime's combined embed budget");
assert.ok(studioAfterRemoval.includes("incomingVoiceBytes > 1_500_000"), "voice-over editor enforces the runtime's per-file size ceiling");
console.log("Voice-over asset workflow contract passed.\n");
