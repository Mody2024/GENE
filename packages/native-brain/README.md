# GENE Native Brain (experimental)

This package starts the provider-independent intelligence path. It is intentionally separate from the existing generation route until it passes tests and can produce useful results. It does **not** call Gemini, Claude, OpenRouter, Groq, or any other model API.

## Current components

- `src/index.mjs`: a local JSONL experience ledger with verified-only retrieval and a deterministic project-brief contract.
- `train.py`: a tiny decoder-only Transformer initialized from random weights, with a UTF-8 byte vocabulary. It downloads no weights and no tokenizer.
- `requirements.txt`: optional PyTorch dependency for training.

The deterministic brief normalizer is not a neural model and does not generate a complete game. It gives Gene a safe native contract while model training is developed. This package is not yet wired as a replacement for the production `/api/agent` generation route.

## Experience ledger

Use the store from a persistent local process:

```js
import { createExperienceStore } from "@gene/native-brain";

const memory = createExperienceStore({ root: "/path/to/gene/native-memory" });
await memory.add({
  task: "2D platformer jump bug",
  engine: "canvas2d",
  kind: "game",
  summary: "Fixed grounded-state reset after landing.",
  tags: ["platformer", "jump", "collision"],
  tests: [
    { name: "jump-from-ground", passed: true },
    { name: "cannot-double-jump", passed: true }
  ],
  verified: true
});
const relevant = await memory.retrieve("platformer jump collision");
```

A record is only considered verified if the caller explicitly requests verification and supplies a non-empty set of passing tests. The ledger stores evidence and labels; it does not prove correctness on its own. For multi-process writes, use a database with transactions rather than this initial single-process JSONL store.

## Train from random initialization

Create a JSONL file where every row has a `text` string. Keep training, validation, and held-out evaluation data separate; only pass the training split to this prototype.

```sh
python -m venv .venv
# activate the environment, then:
pip install -r packages/native-brain/requirements.txt
python packages/native-brain/train.py --data data/native/train.jsonl --steps 1000 --out artifacts/native-brain
```

The model uses random weights and a byte-level vocabulary. It is a research baseline, not a capable general-purpose coding model. A small corpus will teach little; do not route real game generation to this checkpoint until it beats deterministic baselines on held-out tasks and passes output validation.

## Safety and acceptance gates

1. Never call a record verified merely because a model says it succeeded.
2. Run build and gameplay tests outside the model.
3. Keep checkpoints separate; do not overwrite a known-good model before evaluation.
4. Measure on held-out tasks; training loss alone is not a quality metric.
5. Keep native mode opt-in until the full game-build pipeline is integrated and tested.
6. The web deployment must not assume it can write persistent local files. Store memory on the local agent or use an explicitly configured persistent database.

## Next integration steps

1. Add authenticated local-agent endpoints for native status, experience ingestion, and retrieval.
2. Add a native inference worker that loads a Gene-owned checkpoint and returns validated structured actions.
3. Connect the UI and orchestrator to that worker behind a feature flag.
4. Keep external-provider routes disabled in native-only mode; never silently fall back to a third-party model.
5. Run the existing smoke, cancellation, workspace, browser, and game-quality tests before proposing a merge.
