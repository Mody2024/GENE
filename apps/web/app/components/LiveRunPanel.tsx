"use client";

import { useEffect, useState } from "react";

export type LiveRunStage = "context" | "research" | "model" | "forge" | "apply" | "reload";
export type LiveRun = {
  id: string;
  operation: string;
  prompt: string;
  startedAt: number;
  stage: LiveRunStage;
  files: Array<{ path: string; size: number }>;
  research?: { topic: string; status: "running" | "done" | "failed"; images?: number; facts?: number };
  forge?: { asset: string; status: "connecting" | "modelling" | "done" | "failed"; detail?: string };
  attempt?: number;
  model?: string;
};

const TITLES: Record<string, string> = {
  edit: "Editing your project",
  chat: "Thinking",
  plan: "Planning",
  interview: "Planning",
  research: "Researching",
  enhancePrompt: "Improving your prompt",
  build: "Building your game",
  surprise: "Building your surprise game",
  buildPart: "Building a project part"
};

function kb(bytes: number) { return bytes < 1024 ? bytes + " B" : (bytes / 1024).toFixed(bytes < 10240 ? 1 : 0) + " KB"; }

/** What GENE is doing for THIS request: the ask, the context it read, research, and where the model call is. */
export default function LiveRunPanel({ run, logOpen, onToggleLog }: { run: LiveRun; logOpen?: boolean; onToggleLog?: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 500); return () => window.clearInterval(timer); }, []);
  const seconds = Math.max(0, Math.round((now - run.startedAt) / 1000));
  const editing = run.operation === "edit";
  const order: LiveRunStage[] = ["context", ...(run.research ? ["research" as const] : []), "model", ...(run.forge ? ["forge" as const] : []), "apply", "reload"];
  const at = order.indexOf(run.stage);
  const total = run.files.reduce((sum, file) => sum + file.size, 0);
  const steps = [
    { key: "context", label: run.files.length ? "Read " + run.files.length + " project file" + (run.files.length === 1 ? "" : "s") + " as context" : "No project files yet", detail: run.files.length ? kb(total) + " · " + run.files.slice(0, 4).map(file => file.path).join(", ") + (run.files.length > 4 ? " +" + (run.files.length - 4) : "") : "" },
    ...(run.research ? [{ key: "research", label: run.research.status === "failed" ? "Research unavailable, continuing with stated assumptions" : "Researching “" + run.research.topic.slice(0, 48) + "”", detail: run.research.status === "done" ? (run.research.images || 0) + " images · " + (run.research.facts || 0) + " facts attached" : "Wikipedia · Wikimedia Commons · Poly Haven" }] : []),
    { key: "model", label: editing ? "GENE is writing the change" : run.operation === "plan" || run.operation === "interview" ? "GENE is shaping the plan" : "GENE is working on your request", detail: (run.model ? run.model + " · " : "") + seconds + "s" + (run.attempt && run.attempt > 1 ? " · retry " + run.attempt + "/3" : "") },
    ...(run.forge ? [{ key: "forge", label: run.forge.status === "connecting" ? "Connecting to GENE Forge" : run.forge.status === "modelling" ? "GENE Forge is modelling " + run.forge.asset : run.forge.status === "done" ? "Forge finished modelling and exporting" : "Forge could not generate this asset", detail: run.forge.detail || "Procedural mesh · per-part colours · materials · geometry validation" }] : []),
    { key: "apply", label: editing ? "Check and apply the changed files" : "Check the result", detail: "" },
    ...(editing ? [{ key: "reload", label: "Reload the live preview", detail: "" }] : [])
  ];
  return (
    <div className="live-run" role="status" aria-live="polite">
      <div className="live-run-head"><strong>{TITLES[run.operation] || "Working"}</strong><span>{seconds}s{onToggleLog && <button type="button" className="live-run-log" aria-expanded={!!logOpen} onClick={onToggleLog}>{logOpen ? "Hide log" : "Activity"}</button>}</span></div>
      <blockquote className="live-run-ask">{run.prompt.length > 220 ? run.prompt.slice(0, 220) + "…" : run.prompt}</blockquote>
      <ol className="live-run-steps">
        {steps.map(step => {
          const index = order.indexOf(step.key as LiveRunStage);
          const state = index < at ? "done" : index === at ? "active" : "todo";
          return <li key={step.key} className={"lr-" + state}><span className="lr-mark">{state === "done" ? "✓" : state === "active" ? "●" : "○"}</span><div><strong>{step.label}</strong>{step.detail && <small>{step.detail}</small>}</div></li>;
        })}
      </ol>
    </div>
  );
}
