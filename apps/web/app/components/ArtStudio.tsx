"use client";

import { useMemo, useRef, useState, type ChangeEvent } from "react";
import type { DesignDoc } from "../lib/types";
import { safeArtName, sanitizeSvg } from "../lib/svg-safety.mjs";
import { RUNTIME_ART_PATH } from "../lib/runtime-assets";
import { confirmAndApprove, requestToolApproval, type IssuedApproval } from "../lib/tool-approval-client";

type ArtKind = "sprite" | "icon" | "logo" | "background";
type Generated = { name: string; kind: string; path: string; svg: string; bytes: number; shapes: number };
type ResearchResult = {
  topic: string;
  notes: string;
  partial: boolean;
  models: Array<{ id: string; name: string; url: string; tags: string[] }>;
  links: Array<{ id: string; label: string; kind: string; license: string; url: string }>;
};

type Props = {
  files: Record<string, string>;
  doc: DesignDoc;
  isApp: boolean;
  apiReady: boolean | null;
  /** Merge files into the project (null deletes). createVersion=false skips the history entry for batch saves. */
  onAddFiles: (entries: Record<string, string | null>, label: string, createVersion?: boolean) => void;
  onResearchNote: (topic: string, notes: string) => void;
  onPrepareIntegration: (prompt: string) => void;
};

const KIND_LABEL: Record<ArtKind, string> = { sprite: "Character / object sprite", icon: "Pickup / UI icon", logo: "Title logo", background: "Background scene" };

function dataUrl(svg: string) {
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

export default function ArtStudio({ files, doc, isApp, apiReady, onAddFiles, onResearchNote, onPrepareIntegration }: Props) {
  const [prompt, setPrompt] = useState("");
  const [kind, setKind] = useState<ArtKind>("sprite");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [notice, setNotice] = useState("");
  const [topic, setTopic] = useState("");
  const [researching, setResearching] = useState(false);
  const [research, setResearch] = useState<ResearchResult | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const art = useMemo(() => Object.keys(files).filter(path => RUNTIME_ART_PATH.test(path)).sort(), [files]);

  async function requestArt(text: string, artKind: ArtKind, name: string, approval?: IssuedApproval): Promise<Generated> {
    const payload = { prompt: text, kind: artKind, name, style: doc.art.style, palette: doc.art.palette };
    const toolApproval = approval ?? await confirmAndApprove("illustrate", payload);
    const response = await fetch("/api/illustrate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, toolApproval })
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) throw new Error(String(data?.error?.message || "Illustration failed (HTTP " + response.status + ")."));
    return data.art as Generated;
  }

  function uniquePath(name: string, taken: Set<string>) {
    let candidate = "assets/art/" + name + ".svg";
    for (let i = 2; taken.has(candidate) && i < 50; i++) candidate = "assets/art/" + name + "-" + i + ".svg";
    return candidate;
  }

  async function generateOne() {
    const text = prompt.trim();
    if (!text || busy) return;
    setBusy(true);
    setNotice("");
    setProgress("Drawing your illustration with the free AI providers…");
    try {
      const result = await requestArt(text, kind, safeArtName(text.split(/\s+/).slice(0, 3).join("-"), kind));
      const path = uniquePath(safeArtName(result.name, kind), new Set(Object.keys(files)));
      onAddFiles({ [path]: result.svg }, "Add illustration " + path.split("/").pop());
      setNotice("Saved " + path + " (" + Math.round(result.bytes / 1000) + " KB, " + result.shapes + " shapes). Ask GENE to use it in the game, or press “Use in game”.");
      setPrompt("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Illustration failed.");
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  async function generatePack() {
    if (busy) return;
    const plan = doc.assetPlan.slice(0, 5);
    const pending = plan.filter(item => !Object.keys(files).includes("assets/art/" + safeArtName(item.id) + ".svg"));
    if (pending.length && typeof window !== "undefined" && !window.confirm("GENE wants to run these AI illustration calls as one explicit batch:\n\n" + pending.map((item, index) => (index + 1) + ". " + item.kind + " — " + item.prompt.slice(0, 110)).join("\n") + "\n\nEach call gets its own single-use approval. Cancel runs none of them.")) return;
    setBusy(true);
    setNotice("");
    const taken = new Set(Object.keys(files));
    let made = 0;
    let failures = 0;
    const failureNotes: string[] = [];
    for (let i = 0; i < plan.length; i++) {
      const item = plan[i];
      const wanted = "assets/art/" + safeArtName(item.id) + ".svg";
      if (taken.has(wanted)) continue;
      setProgress("Illustrating " + (i + 1) + " of " + plan.length + ": " + item.id + "…");
      try {
        const itemPayload = { prompt: item.prompt, kind: item.kind, name: safeArtName(item.id), style: doc.art.style, palette: doc.art.palette };
        const result = await requestArt(item.prompt, item.kind, safeArtName(item.id), await requestToolApproval("illustrate", itemPayload));
        const path = uniquePath(safeArtName(result.name, item.kind), taken);
        taken.add(path);
        onAddFiles({ [path]: result.svg }, "Art pack: " + item.id, false);
        made++;
        failures = 0;
      } catch (error) {
        failures++;
        failureNotes.push(item.id + ": " + (error instanceof Error ? error.message : "failed"));
        if (failures >= 2) break;
      }
    }
    if (made) onAddFiles({}, "Art pack (" + made + " illustrations)", true);
    setNotice(made
      ? "Created " + made + " illustration(s) from the design document's art plan." + (failureNotes.length ? " Some failed: " + failureNotes.join(" | ") : "")
      : failureNotes.length ? "No illustrations were created. " + failureNotes.join(" | ") : "All planned illustrations already exist.");
    setBusy(false);
    setProgress("");
  }

  async function runResearch() {
    const query = (topic || doc.title + " " + doc.art.style).trim();
    if (query.length < 3 || researching) return;
    setResearching(true);
    setNotice("");
    try {
      const researchPayload = { query };
      const toolApproval = await confirmAndApprove("research", researchPayload);
      const response = await fetch("/api/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...researchPayload, toolApproval }) });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) throw new Error(String(data?.error?.message || "Research failed (HTTP " + response.status + ")."));
      setResearch({ topic: data.topic, notes: data.notes, partial: Boolean(data.partial), models: data.models || [], links: data.links || [] });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Research failed.");
    } finally {
      setResearching(false);
    }
  }

  async function importFiles(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const selected = Array.from(input.files || []);
    input.value = "";
    if (!selected.length) return;
    const entries: Record<string, string> = {};
    const skipped: string[] = [];
    for (const file of selected) {
      const base = safeArtName(file.name.replace(/\.[^.]+$/, ""), "asset");
      const lower = file.name.toLowerCase();
      if (file.size > 900_000) { skipped.push(file.name + " (over 900 KB)"); continue; }
      const text = await file.text().catch(() => "");
      if (lower.endsWith(".svg")) {
        const cleaned = sanitizeSvg(text);
        if (!cleaned.ok) { skipped.push(file.name + " (" + cleaned.error + ")"); continue; }
        entries[uniquePath(base, new Set([...Object.keys(files), ...Object.keys(entries)]))] = cleaned.svg;
      } else if (lower.endsWith(".obj")) {
        if (!/^\s*v\s+-?\d/m.test(text)) { skipped.push(file.name + " (no vertices found)"); continue; }
        entries["assets/" + (base === "art" ? "art-model" : base) + "/model.obj"] = text;
      } else if (lower.endsWith(".mtl")) {
        entries["assets/" + (base === "art" ? "art-model" : base) + "/model.mtl"] = text;
      } else {
        skipped.push(file.name + " (use .svg, .obj or .mtl)");
      }
    }
    const count = Object.keys(entries).length;
    if (count) onAddFiles(entries, "Import " + count + " asset file(s)");
    setNotice((count ? "Imported " + count + " file(s). " : "") + (skipped.length ? "Skipped: " + skipped.join(", ") : "") + (count ? " They are available to the game as GENE_ART / GENE3D assets." : ""));
  }

  function integrationPrompt(paths: string[]) {
    return "Use the saved illustration" + (paths.length > 1 ? "s" : "") + " " + paths.map(path => "\"" + path + "\"").join(", ") +
      " in the actual " + (isApp ? "app UI" : "game") + ". Load them through window.GENE_ART (GENE_ART.draw(ctx, path, x, y, w, h) for canvas, GENE_ART.svg(path) for DOM), assign each to the right role (" +
      (isApp ? "hero, icons, empty states" : "title screen, player, enemies, pickups, background") +
      "), keep a procedural drawing fallback for frames before an image has loaded, and preserve all existing controls and mechanics. Do not claim integration until the art is visibly drawn in the preview.";
  }

  const disabledReason = apiReady === false ? "No AI provider is configured yet." : "";

  return (
    <div className="tool-view g3-art">
      <div className="tool-view-heading">
        <div className="eyebrow">FREE ART STUDIO</div>
        <h2>Illustrations, research and assets</h2>
        <p>Original SVG illustrations are drawn by the free AI providers, sanitized, saved in the project and exposed to the game as <code>GENE_ART</code>. Nothing here uses paid credits.</p>
      </div>

      <section className="g3-card">
        <header><h3>Illustrator</h3><span>{doc.art.style}</span></header>
        <div className="g3-form-row">
          <label>Type
            <select value={kind} onChange={event => setKind(event.target.value as ArtKind)} disabled={busy}>
              {(Object.keys(KIND_LABEL) as ArtKind[]).map(key => <option key={key} value={key}>{KIND_LABEL[key]}</option>)}
            </select>
          </label>
        </div>
        <textarea value={prompt} rows={3} onChange={event => setPrompt(event.target.value)} disabled={busy}
          placeholder="Describe it — e.g. a hooded desert scout with a glowing lantern, side view, teal and amber palette" />
        <div className="g3-card-actions">
          <button type="button" className="primary-button" disabled={busy || !prompt.trim() || apiReady === false} onClick={() => void generateOne()}>{busy && !progress.startsWith("Illustrating") ? "Drawing…" : "Generate illustration"}</button>
          <button type="button" className="secondary-button" disabled={busy || apiReady === false} onClick={() => void generatePack()} title="Draws the key art listed in the design document's art plan">Auto art pack ({Math.min(5, doc.assetPlan.length)})</button>
        </div>
        {progress && <div className="g3-progress"><span className="spinner small-spinner" /> {progress}</div>}
        {disabledReason && <p className="g3-muted">{disabledReason}</p>}
        {notice && <div className="forge-notice">{notice}</div>}
      </section>

      <section className="g3-card">
        <header><h3>Saved illustrations <span className="g3-count">{art.length}</span></h3>
          <div className="g3-card-actions">
            <input ref={importRef} className="visually-hidden" type="file" multiple accept=".svg,.obj,.mtl" onChange={importFiles} />
            <button type="button" className="secondary-button" onClick={() => importRef.current?.click()}>Import SVG / OBJ / MTL</button>
            {art.length > 0 && <button type="button" className="primary-button" onClick={() => onPrepareIntegration(integrationPrompt(art))}>Use all in game</button>}
          </div>
        </header>
        {art.length === 0 ? <p className="g3-muted">No illustrations yet. Generate one above or run the auto art pack. Imported SVGs are sanitized (scripts and external references are removed).</p> :
          <div className="g3-art-grid">
            {art.map(path => <article key={path} className="g3-art-tile">
              <div className="g3-art-thumb"><img src={dataUrl(files[path])} alt={path.split("/").pop() || "illustration"} /></div>
              <strong title={path}>{path.split("/").pop()}</strong>
              <small>{Math.max(1, Math.round(files[path].length / 1000))} KB</small>
              <div className="g3-tile-actions">
                <button type="button" onClick={() => onPrepareIntegration(integrationPrompt([path]))}>Use in game</button>
                <a href={dataUrl(files[path])} download={path.split("/").pop()}>SVG ↓</a>
                <button type="button" aria-label={"Remove " + path} onClick={() => onAddFiles({ [path]: null }, "Remove " + path.split("/").pop())}>×</button>
              </div>
            </article>)}
          </div>}
      </section>

      <section className="g3-card">
        <header><h3>Research &amp; free asset libraries</h3><span>Wikipedia · Poly Haven CC0 · Kenney · OpenGameArt</span></header>
        <div className="g3-form-row g3-inline">
          <input value={topic} onChange={event => setTopic(event.target.value)} placeholder={doc.title + " — theme, setting or object to research"} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void runResearch(); } }} />
          <button type="button" className="primary-button" disabled={researching} onClick={() => void runResearch()}>{researching ? "Searching…" : "Research"}</button>
        </div>
        {research && <div className="g3-research">
          {research.partial && <p className="g3-muted">Some live sources were unreachable; only verified results are shown.</p>}
          {research.models.length > 0 && <><h4>Matching CC0 3D models (Poly Haven)</h4><ul>{research.models.map(model => <li key={model.id}><a href={model.url} target="_blank" rel="noreferrer">{model.name}</a> <small>{model.tags.join(", ")}</small></li>)}</ul></>}
          <h4>Search the free libraries</h4>
          <div className="g3-links">{research.links.map(link => <a key={link.id} href={link.url} target="_blank" rel="noreferrer"><strong>{link.label}</strong><small>{link.kind} · {link.license}</small></a>)}</div>
          <div className="g3-card-actions">
            <button type="button" className="primary-button" onClick={() => { onResearchNote(research.topic, research.notes); setNotice("Saved the research as a builder reference. The next request will include it."); }}>Save as builder reference</button>
          </div>
          <p className="g3-muted">GENE’s sandboxed runtime cannot download files by itself. Download a CC0 asset from the library, then use “Import” above (SVG, OBJ, MTL) to add it to the project.</p>
        </div>}
      </section>
    </div>
  );
}
