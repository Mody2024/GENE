"use client";

import { useState } from "react";
import type { Question } from "../lib/types";

type Props = {
  question: Question;
  busy: boolean;
  onAnswer: (answer: string) => void;
  onDefault: () => void;
  onSkip: () => void;
};

/** One interview decision at a time, with progress, a recommended option, optional multi-select and a free-text answer. */
export default function InterviewCard({ question, busy, onAnswer, onDefault, onSkip }: Props) {
  const [picked, setPicked] = useState<string[]>([]);
  const [custom, setCustom] = useState("");
  const step = question.step && question.total ? question.step : 0;
  const total = question.total || 0;
  const choices = question.choices || [];

  const toggle = (choice: string) => setPicked(current => current.includes(choice) ? current.filter(item => item !== choice) : [...current, choice]);
  const choose = (choice: string) => question.multi ? toggle(choice) : setPicked([choice]);
  const previewClass = (choice: string) => {
    const value = choice.toLowerCase();
    if (/horror|creepy|dark|cinematic|case file|noir/.test(value)) return "preview-noir";
    if (/arcade|pixel|energetic|runner|score/.test(value)) return "preview-arcade";
    if (/fantasy|storybook|magic|illustrated/.test(value)) return "preview-fantasy";
    if (/racing|speed|garage|driv/.test(value)) return "preview-racing";
    if (/space|cosmic|atmospheric|ambient|wonder/.test(value)) return "preview-cosmic";
    if (/playful|colorful|kids/.test(value)) return "preview-playful";
    if (/retro|crt|hardware/.test(value)) return "preview-retro";
    if (/clean|minimal|studio|professional|personal use/.test(value)) return "preview-clean";
    if (/nature|ocean|explor/.test(value)) return "preview-nature";
    return "preview-default";
  };
  const submitPicked = () => { if (busy || picked.length === 0) return; onAnswer(question.multi ? picked.join("; ") : picked[0]); };
  const submitCustom = () => {
    const value = custom.trim();
    if (!value || busy) return;
    setCustom("");
    onAnswer(value);
  };

  return (
    <div className="g3-interview" role="group" aria-label={step > 0 ? "Project decision " + step + " of " + total : "Project interview question"}>
      <div className="g3-interview-head">
        <span className="g3-interview-tag">PROJECT SETUP</span>
        {step > 0 && <span className="g3-interview-step">{step} / {total} decisions</span>}
      </div>
      {step > 0 && <div className="g3-interview-track" aria-hidden="true"><span style={{ width: Math.min(100, Math.round(step / total * 100)) + "%" }} /></div>}
      <h3>{question.text}</h3>
      {question.why && <p className="g3-interview-why">{question.why}</p>}
      <div className="g3-choice-grid">
        {choices.map(choice => {
          const selected = picked.includes(choice);
          return (
            <button
              key={choice}
              type="button"
              className={"g3-choice" + (selected ? " selected" : "") + (question.recommended === choice ? " recommended" : "")}
              aria-pressed={selected}
              disabled={busy}
              onClick={() => choose(choice)}
            >
              <span className={"g3-choice-preview " + previewClass(choice)} aria-hidden="true"><i /><i /><i /></span>
              <span>{choice}</span>
              {question.recommended === choice && <em>Recommended</em>}
            </button>
          );
        })}
      </div>
      {picked.length > 0 && <div className="g3-interview-continue-row"><span>{question.multi ? picked.length + " selected" : "Selected: " + picked[0]}</span><button type="button" className="g3-primary" disabled={busy} onClick={submitPicked}>{busy ? "Saving…" : "Continue"}</button></div>}
      <div className="g3-custom-answer">
        <input
          value={custom}
          maxLength={400}
          onChange={event => setCustom(event.target.value)}
          onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); submitCustom(); } }}
          placeholder="Or describe your preference…"
          aria-label="Type your own answer"
          disabled={busy}
        />
        <button type="button" disabled={busy || !custom.trim()} onClick={submitCustom}>Use answer</button>
      </div>
      <div className="g3-interview-actions">
        <button type="button" className="text-action" onClick={onDefault} disabled={busy}>Use recommended default</button>
        <button type="button" className="text-action" onClick={onSkip} disabled={busy}>Skip interview and build</button>
      </div>
    </div>
  );
}
