"use client";

import { useEffect, useRef, useState } from "react";
import VoiceOverStudio from "./VoiceOverStudio";

type Props = {
  files: Record<string, string>;
  readOnly?: boolean;
  onSave: (files: Record<string, string>, label: string) => void;
};

type Levels = { master: number; music: number; sfx: number };
const DEFAULT_LEVELS: Levels = { master: 0.8, music: 0.35, sfx: 0.8 };
const EVENT_MAP: Record<string, string> = {
  uiConfirm: "playSfx",
  playerAction: "playSfx",
  impact: "playSfx",
  pickup: "playSfx",
  enemyWarning: "playSfx",
  objective: "playSfx",
  outcome: "playSfx"
};

function loadAudioSettings(files: Record<string, string>) {
  const spec = JSON.parse(files["game-spec.json"] || "{}") as Record<string, unknown>;
  const audio = spec.audio && typeof spec.audio === "object" ? spec.audio as Record<string, unknown> : {};
  const volumes = audio.volumes && typeof audio.volumes === "object" ? audio.volumes as Record<string, unknown> : {};
  const level = (key: keyof Levels) => {
    const value = Number(volumes[key]);
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : DEFAULT_LEVELS[key];
  };
  return {
    spec,
    enabled: audio.enabled !== false,
    implementation: typeof audio.implementation === "string" ? audio.implementation : "procedural-web-audio",
    levels: { master: level("master"), music: level("music"), sfx: level("sfx") }
  };
}

export default function AudioStudio({ files, readOnly = false, onSave }: Props) {
  const source = files["game-spec.json"] || "{}";
  const contextRef = useRef<AudioContext | null>(null);
  const nodesRef = useRef<OscillatorNode[]>([]);
  const [levels, setLevels] = useState<Levels>(DEFAULT_LEVELS);
  const [enabled, setEnabled] = useState(true);
  const [implementation, setImplementation] = useState("procedural-web-audio");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [specError, setSpecError] = useState("");

  useEffect(() => {
    try {
      const current = loadAudioSettings(files);
      setLevels(current.levels);
      setEnabled(current.enabled);
      setImplementation(current.implementation);
      setSpecError("");
      setStatus("");
    } catch {
      setSpecError("game-spec.json is invalid JSON. Fix it in Files before editing the audio manifest.");
    }
  }, [source]);

  const stopActive = () => {
    for (const node of nodesRef.current) {
      try { node.stop(); } catch {}
      try { node.disconnect(); } catch {}
    }
    nodesRef.current = [];
  };
  useEffect(() => () => {
    stopActive();
    const context = contextRef.current;
    contextRef.current = null;
    if (context && context.state !== "closed") void context.close().catch(() => undefined);
  }, []);

  const getContext = async () => {
    const AudioContextConstructor = window.AudioContext;
    if (!AudioContextConstructor) throw new Error("This browser does not support Web Audio. The game should still remain playable without sound.");
    if (!contextRef.current || contextRef.current.state === "closed") contextRef.current = new AudioContextConstructor();
    if (contextRef.current.state === "suspended") await contextRef.current.resume();
    return contextRef.current;
  };
  const playTone = async (kind: "ui" | "action" | "impact" | "pickup" | "music") => {
    setError("");
    setStatus("");
    stopActive();
    try {
      const context = await getContext();
      const now = context.currentTime;
      const music = kind === "music";
      const master = enabled ? levels.master : 0;
      const bus = music ? levels.music : levels.sfx;
      const volume = master * bus * (kind === "impact" ? 0.32 : 0.55);
      if (volume <= 0) { setStatus("Preview muted because the master or selected bus level is zero, or audio is disabled."); return; }
      const addVoice = (frequency: number, at: number, duration: number, wave: OscillatorType, gainScale = 1) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = wave;
        oscillator.frequency.setValueAtTime(frequency, at);
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.linearRampToValueAtTime(Math.max(0.0002, volume * gainScale), at + Math.min(0.025, duration * 0.25));
        gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(at);
        oscillator.stop(at + duration + 0.03);
        oscillator.onended = () => { try { oscillator.disconnect(); gain.disconnect(); } catch {} };
        nodesRef.current.push(oscillator);
      };
      if (music) {
        const notes = [261.63, 329.63, 392, 329.63, 293.66, 349.23, 440, 392];
        notes.forEach((note, index) => {
          addVoice(note, now + index * 0.19, 0.24, index % 3 === 0 ? "triangle" : "sine", 0.7);
          if (index % 2 === 0) addVoice(note / 2, now + index * 0.19, 0.3, "sine", 0.24);
        });
        setStatus("Playing a short procedural music motif through the editor test bench.");
      } else if (kind === "ui") {
        addVoice(660, now, 0.09, "sine");
        addVoice(880, now + 0.07, 0.12, "sine", 0.75);
        setStatus("UI confirmation sound previewed.");
      } else if (kind === "action") {
        addVoice(220, now, 0.13, "triangle");
        addVoice(440, now + 0.025, 0.1, "square", 0.35);
        setStatus("Player-action sound previewed.");
      } else if (kind === "impact") {
        addVoice(95, now, 0.16, "sawtooth");
        addVoice(70, now + 0.02, 0.2, "triangle", 0.8);
        setStatus("Impact sound previewed.");
      } else {
        addVoice(523.25, now, 0.1, "sine");
        addVoice(783.99, now + 0.06, 0.16, "triangle");
        setStatus("Pickup/reward sound previewed.");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Audio preview failed. The game runtime must handle audio errors gracefully.");
    }
  };

  const saveManifest = () => {
    if (readOnly) return;
    try {
      const current = loadAudioSettings(files);
      const audio = {
        ...((current.spec.audio && typeof current.spec.audio === "object") ? current.spec.audio as Record<string, unknown> : {}),
        enabled,
        implementation,
        buses: ["master", "music", "sfx", "ambience", "ui"],
        volumes: levels,
        events: EVENT_MAP
      };
      const nextSpec = { ...current.spec, audio };
      const nextFiles = { ...files, "game-spec.json": JSON.stringify(nextSpec, null, 2) + "\n" };
      onSave(nextFiles, "Audio settings and event map");
      setStatus("Saved the audio manifest and volume defaults to game-spec.json. This does not by itself add an audio engine to game.js.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save audio manifest.");
    }
  };

  return <div className="tool-view audio-studio">
    <div className="tool-view-heading">
      <div className="eyebrow">GENE STUDIO · SOUND DESIGN</div>
      <h2>Audio Studio</h2>
      <p>Preview a small procedural sound palette, tune default levels, and save an explicit event/bus manifest. The test bench plays audio in this editor; generated game source still needs a real runtime AudioManager connected to gameplay.</p>
    </div>
    {specError ? <div className="forge-notice">{specError}</div> : <>
      <div className="audio-studio-top">
        <label className="scene-visible"><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} disabled={readOnly} /> Audio enabled by default</label>
        <label className="audio-implementation">Implementation<select value={implementation} onChange={event => setImplementation(event.target.value)} disabled={readOnly}><option value="procedural-web-audio">Procedural Web Audio</option><option value="asset-backed">Imported audio assets</option></select></label>
      </div>
      <div className="audio-level-list">
        {(["master", "music", "sfx"] as const).map(key => <label className="audio-level" key={key}>
          <span><strong>{key === "sfx" ? "Sound effects" : key[0].toUpperCase() + key.slice(1)}</strong><small>{Math.round(levels[key] * 100)}%</small></span>
          <input type="range" min="0" max="1" step="0.05" value={levels[key]} onChange={event => setLevels(current => ({ ...current, [key]: Number(event.target.value) }))} disabled={readOnly} />
        </label>)}
      </div>
      <div className="audio-preview-grid">
        <button className="audio-preview-card" onClick={() => void playTone("ui")}><span>↗</span><strong>UI confirm</strong><small>Two-note sine/triangle cue</small><em>Play preview</em></button>
        <button className="audio-preview-card" onClick={() => void playTone("action")}><span>➤</span><strong>Player action</strong><small>Short layered action cue</small><em>Play preview</em></button>
        <button className="audio-preview-card" onClick={() => void playTone("impact")}><span>✳</span><strong>Impact / damage</strong><small>Low, short impact tones</small><em>Play preview</em></button>
        <button className="audio-preview-card" onClick={() => void playTone("pickup")}><span>✦</span><strong>Pickup / reward</strong><small>Bright ascending reward cue</small><em>Play preview</em></button>
        <button className="audio-preview-card audio-preview-music" onClick={() => void playTone("music")}><span>♫</span><strong>Music motif</strong><small>Eight-note procedural melody with a soft bass layer</small><em>Play sample</em></button>
        <button className="audio-preview-card" onClick={() => { stopActive(); setStatus("Stopped all currently previewing sound nodes."); }}><span>■</span><strong>Stop preview</strong><small>Stops active test voices</small><em>Stop all</em></button>
      </div>
      {error && <div className="forge-notice">{error}</div>}
      {status && <div className="forge-notice">{status}</div>}
      <div className="audio-studio-bottom">
        <div><strong>Mapped events</strong><p>{Object.keys(EVENT_MAP).join(" · ")}</p><small>Master / music / SFX / ambience / UI buses are recorded in the manifest.</small></div>
        <button className="primary-button" onClick={saveManifest} disabled={readOnly}>Save audio manifest</button>
      </div>
      {readOnly && <p className="scene-studio-hint">Switch to Build mode to save audio settings.</p>}
    </>}
    <VoiceOverStudio files={files} readOnly={readOnly} onSave={onSave} />
  </div>;
}
