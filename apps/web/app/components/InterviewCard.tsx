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
  const submitCustom = () => {
    const value = custom.trim();
    if (!value || busy) return;
    setCustom("");
    onAnswer(value);
  };

  return (
    <div className="g3-interview" role="group" aria-label="Project interview question">
      <div className="g3-interview-head">
        <span className="g3-interview-tag"><i /> PROJECT INTERVIEW</span>
        {step > 0 && <span className="g3-interview-step">Question {step} of {total}</span>}
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
              aria-pressed={question.multi ? selected : undefined}
              disabled={busy}
              onClick={() => question.multi ? toggle(choice) : onAnswer(choice)}
            >
              <span>{choice}</span>
              {question.recommended === choice && <em>Recommended</em>}
            </button>
          );
        })}
      </div>
      {question.multi && <button type="button" className="g3-primary" disabled={busy || picked.length === 0} onClick={() => onAnswer(picked.join("; "))}>Continue with {picked.length || "…"} selected</button>}
      <div className="g3-custom-answer">
        <input
          value={custom}
          maxLength={400}
          onChange={event => setCustom(event.target.value)}
          onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); submitCustom(); } }}
          placeholder="Or type your own answer…"
          aria-label="Type your own answer"
          disabled={busy}
        />
        <button type="button" disabled={busy || !custom.trim()} onClick={submitCustom}>Answer</button>
      </div>
      <div className="g3-interview-actions">
        <button type="button" className="text-action" onClick={onDefault} disabled={busy}>Use smart default</button>
        <button type="button" className="text-action" onClick={onSkip} disabled={busy}>Skip questions and build</button>
      </div>
    </div>
  );
}
