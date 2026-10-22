"use client";

import { useEffect, useRef, useState } from "react";

type Props = { files: Record<string, string>; readOnly?: boolean; onSave: (files: Record<string, string>, label: string) => void };
type VoiceOver = { id: string; name: string; text: string; path: string; source: "recording" | "upload" | "tts"; pitch: number; rate: number; voice?: string };
const safeId = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "voice-line";

export default function VoiceOverStudio({ files, readOnly = false, onSave }: Props) {
  const [text, setText] = useState("");
  const [name, setName] = useState("Narrator line");
  const [pitch, setPitch] = useState(1);
  const [rate, setRate] = useState(1);
  const [voiceName, setVoiceName] = useState("");
  const [lines, setLines] = useState<VoiceOver[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [recording, setRecording] = useState(false);
  const [recordingSupported, setRecordingSupported] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setRecordingSupported(typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined");
    try {
      const spec = JSON.parse(files["game-spec.json"] || "{}");
      const saved = spec.audio?.voiceOvers;
      setLines(Array.isArray(saved) ? saved.filter((v: any) => v && typeof v.id === "string" && typeof v.path === "string") : []);
    } catch { setError("game-spec.json is invalid JSON. Fix it before editing voice-over assets."); }
  }, [files["game-spec.json"]]);

  useEffect(() => () => {
    try { if (recorderRef.current?.state === "recording") recorderRef.current.stop(); } catch {}
    streamRef.current?.getTracks().forEach(track => track.stop());
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
  }, []);

  const previewSpeech = () => {
    setError(""); setStatus("");
    if (!text.trim()) { setError("Write a line of dialogue or narration first."); return; }
    if (!("speechSynthesis" in window)) { setError("This browser has no built-in speech synthesis. You can still record or upload a voice-over."); return; }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.trim());
    const voices = window.speechSynthesis.getVoices();
    const chosen = voices.find(v => v.name === voiceName);
    if (chosen) utterance.voice = chosen;
    utterance.pitch = pitch; utterance.rate = rate;
    utterance.onend = () => setStatus("Preview finished. Browser speech is a preview only; save a recording or upload audio to embed a reusable voice-over asset.");
    utterance.onerror = () => setError("Speech preview failed in this browser.");
    window.speechSynthesis.speak(utterance);
    setStatus("Playing a browser-generated preview. This preview is not yet a game asset.");
  };

  const startRecording = async () => {
    setError(""); setStatus("");
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") throw new Error("Microphone recording is not supported here. Try uploading an audio file instead.");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      streamRef.current = stream; chunksRef.current = [];
      const preferred = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find(type => MediaRecorder.isTypeSupported(type));
      const recorder = preferred ? new MediaRecorder(stream, { mimeType: preferred }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = event => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onerror = () => { setError("Recording failed. Check microphone permissions and try again."); setRecording(false); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const reader = new FileReader();
        reader.onload = () => {
          const data = String(reader.result || "");
          if (!data.startsWith("data:audio/")) { setError("The recording could not be encoded as audio."); return; }
          saveAsset(data, blob.type.includes("mp4") ? "m4a" : "webm", "recording");
          setStatus("Recording saved into this project's voice-over assets.");
        };
        reader.onerror = () => setError("Could not read the recorded audio.");
        reader.readAsDataURL(blob);
        stream.getTracks().forEach(track => track.stop()); streamRef.current = null;
      };
      recorder.start(250); setRecording(true); setStatus("Recording. Read the line naturally, then stop to add it to the project.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not start microphone recording."); }
  };

  const stopRecording = () => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state === "recording") { recorder.stop(); setRecording(false); }
  };

  const saveAsset = (dataUrl: string, extension: string, source: "recording" | "upload") => {
    if (readOnly) return;
    const id = safeId(name) + "-" + Date.now().toString(36);
    const path = "assets/voiceovers/" + id + "." + extension;
    const line: VoiceOver = { id, name: name.trim() || "Voice-over", text: text.trim(), path, source, pitch, rate, voice: voiceName || undefined };
    const nextLines = [...lines, line];
    const spec = JSON.parse(files["game-spec.json"] || "{}");
    const audio = spec.audio && typeof spec.audio === "object" ? spec.audio : {};
    const nextFiles = { ...files, [path]: dataUrl, "game-spec.json": JSON.stringify({ ...spec, audio: { ...audio, voiceOvers: nextLines } }, null, 2) + "\n" };
    setLines(nextLines); onSave(nextFiles, "Add voice-over: " + line.name);
    setStatus("Added " + line.name + " to the project manifest and asset map.");
  };

  const importFile = (file?: File) => {
    if (!file || readOnly) return;
    setError(""); setStatus("");
    if (!file.type.startsWith("audio/")) { setError("Choose an audio file such as WAV, MP3, OGG, M4A, or WebM."); return; }
    if (file.size > 1_500_000) { setError("This editor's embedded voice-over limit is 1.5 MB per file. Compress or trim the recording, then retry."); return; }
    const extension = (file.name.split(".").pop() || "webm").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "webm";
    const reader = new FileReader();
    reader.onload = () => {
      const data = String(reader.result || "");
      if (data.startsWith("data:audio/")) saveAsset(data, extension, "upload");
      else setError("Could not read this audio file.");
    };
    reader.onerror = () => setError("Could not read this audio file.");
    reader.readAsDataURL(file);
  };

  const playAsset = (line: VoiceOver) => {
    const source = files[line.path];
    if (!source?.startsWith("data:audio/")) { setError("This voice-over asset is missing from the project files."); return; }
    const audio = new Audio(source); void audio.play().catch(() => setError("Audio playback was blocked by the browser. Tap preview again."));
  };

  const removeLine = (id: string) => {
    if (readOnly) return;
    const nextLines = lines.filter(line => line.id !== id);
    const spec = JSON.parse(files["game-spec.json"] || "{}");
    const audio = spec.audio && typeof spec.audio === "object" ? spec.audio : {};
    const nextFiles = { ...files, "game-spec.json": JSON.stringify({ ...spec, audio: { ...audio, voiceOvers: nextLines } }, null, 2) + "\n" };
    setLines(nextLines); onSave(nextFiles, "Remove voice-over"); setStatus("Removed voice-over from the manifest.");
  };

  return <section className="voiceover-studio" style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid var(--border, #dfe3e8)" }}>
    <div className="tool-view-heading"><div className="eyebrow">GENE AUDIO STUDIO · DIALOGUE</div><h3>Voice-over workshop</h3>
      <p>Write dialogue, audition browser voices with pitch and speed controls, record your own performance, or import a finished recording. Voice-over is optional—GENE should only add it when the game benefits from spoken content.</p></div>
    <label style={{ display: "block", margin: "12px 0 6px" }}>Line / narration text<textarea value={text} onChange={e => setText(e.target.value)} rows={3} maxLength={4000} placeholder="Example: The old station has been abandoned for years…" disabled={readOnly} style={{ width: "100%", marginTop: 6 }} /></label>
    <div className="audio-studio-top" style={{ flexWrap: "wrap" }}>
      <label style={{ flex: "1 1 180px" }}>Asset name<input value={name} onChange={e => setName(e.target.value)} maxLength={80} disabled={readOnly} /></label>
      <label style={{ flex: "1 1 180px" }}>Browser voice<select value={voiceName} onChange={e => setVoiceName(e.target.value)} disabled={readOnly} style={{ display: "block", width: "100%" }}><option value="">Default system voice</option>{typeof window !== "undefined" && ("speechSynthesis" in window) ? window.speechSynthesis.getVoices().map(v => <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>) : null}</select></label>
    </div>
    <div className="audio-level-list">
      <label className="audio-level"><span><strong>Pitch</strong><small>{pitch.toFixed(2)}×</small></span><input type="range" min="0.5" max="2" step="0.05" value={pitch} onChange={e => setPitch(Number(e.target.value))} disabled={readOnly} /></label>
      <label className="audio-level"><span><strong>Speaking rate</strong><small>{rate.toFixed(2)}×</small></span><input type="range" min="0.65" max="1.4" step="0.05" value={rate} onChange={e => setRate(Number(e.target.value))} disabled={readOnly} /></label>
    </div>
    <div className="audio-preview-grid">
      <button className="audio-preview-card" onClick={previewSpeech} disabled={readOnly}><strong>Preview voice</strong><small>System TTS; pitch, rate and available voices</small><em>Speak line</em></button>
      {!recording ? <button className="audio-preview-card" onClick={() => void startRecording()} disabled={readOnly || !recordingSupported}><strong>Record my voice</strong><small>Uses your microphone after browser permission</small><em>Start recording</em></button> : <button className="audio-preview-card" onClick={stopRecording}><strong>Stop & save recording</strong><small>Finish your take and attach it to the project</small><em>Stop recording</em></button>}
      <button className="audio-preview-card" onClick={() => fileInputRef.current?.click()} disabled={readOnly}><strong>Upload voice-over</strong><small>WAV, MP3, OGG, M4A or WebM · up to 1.5 MB</small><em>Choose audio</em></button>
      <input ref={fileInputRef} type="file" accept="audio/*" hidden onChange={e => { importFile(e.target.files?.[0]); e.currentTarget.value = ""; }} />
    </div>
    {error && <div className="forge-notice">{error}</div>}{status && <div className="forge-notice">{status}</div>}
    <div style={{ marginTop: 16 }}><strong>Project voice-over assets ({lines.length})</strong>
      {lines.length ? lines.map(line => <div key={line.id} className="audio-studio-bottom" style={{ gap: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0, flex: "1 1 220px" }}><strong>{line.name}</strong><p>{line.text || "Recorded/imported audio without transcript"}</p><small>{line.path} · {line.source}</small></div>
        <button className="secondary-button" onClick={() => playAsset(line)}>Preview asset</button><button className="secondary-button" onClick={() => removeLine(line.id)} disabled={readOnly}>Remove</button>
      </div>) : <p>No voice-over assets yet. You can leave this empty for games that do not need spoken dialogue.</p>}
    </div>
    {readOnly && <p className="scene-studio-hint">Switch to Build mode to edit voice-over assets.</p>}
  </section>;
}
