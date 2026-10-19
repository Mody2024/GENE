# GENE Native Brain (experimental)

This branch adds a provider-independent path to Gene's existing workspace. Select **Gene Native** in the thinking selector to use this path; the API handler returns from the native branch before it inspects provider keys or calls external model APIs. Setting `GENE_NATIVE_ONLY=true` forces that routing behavior for the deployment.

## What works in native mode today

- A deterministic, native-only generator returns a complete four-file starter for Canvas 2D games, WebGL 3D exploration games, and simple web apps.
- The 2D starter includes movement, scoring, hazards, pause/restart, and procedural audio.
- The 3D starter includes a WebGL scene, player movement, collectibles, hazards, score, and pause/restart.
- The web-app starter includes an interactive task list with local persistence.
- Native research tries public MDN and Wikipedia search endpoints and includes curated engine references. Search results are discovery leads, not AI-generated summaries. If live search fails, the response includes direct search links and clearly says it could not retrieve live results.
- The current UI build orchestration and validation pipeline remains in place, so the native result is handled through Gene's staged build flow.

**Important limitation:** this generator is currently deterministic template/code, not the scratch-trained neural model. It can produce useful starter projects, but it is not yet capable of interpreting arbitrary game requests with frontier-level reasoning or generating polished commercial-scale games. The WebGL template is a small exploration prototype, not a full 3D engine.

## Scratch-trained neural model

- `train.py`: a small decoder-only Transformer initialized with random weights and a UTF-8 byte vocabulary. It downloads no model weights or tokenizer.
- `infer.py`: samples text from a saved checkpoint.
- `requirements.txt`: optional PyTorch dependency.

This is a research baseline, not yet wired into live game generation. The first useful step is to train on permitted, high-quality text/code and Gene's verified game-task records, then measure against held-out tasks. A low training loss is not proof of useful game-building ability. Do not replace the deterministic native generator with a neural checkpoint until it can produce valid structured outputs and beat the baseline on the same evaluation set.

## Experience memory

`src/index.mjs` includes a local JSONL experience ledger. A record only becomes verified if the caller explicitly requests verification and provides at least one test and every supplied test passes. The ledger is not yet wired to the web-deployed native generator; deployment filesystems are not durable storage. The next integration should put persistent experience storage in the local agent or an explicitly configured persistent database, and feed only verified experiences into training.

## Turn verified project learning into training data

The exporter reads the local `experiences.jsonl` ledger and includes only records explicitly marked verified with at least one test and every recorded test passing. It deterministically separates records into training, validation, and held-out evaluation files; unverified and failed experiences are excluded.

```sh
python packages/native-brain/export_training_data.py \
  --input /path/to/experiences.jsonl \
  --out-dir data/native/verified
```

Review the exported examples before training. The current ledger must still be connected to actual local-agent/browser-test outcomes before it can accumulate useful verified experience automatically. Do not train on self-reported success alone.

## Run the tests

```sh
npm run test:native-brain
npm run test:native-browser
```

The browser test uses Playwright/Chromium to exercise generated 2D gameplay controls, pause/restart, and web-app state persistence. CI installs Chromium before running it.

## Train from scratch

Create JSONL training records with one `{"text":"..."}` object per line. Keep training, validation, and held-out evaluation data separate.

```sh
python -m venv .venv
# Activate the environment, then:
pip install -r packages/native-brain/requirements.txt
python packages/native-brain/train.py --data data/native/train.jsonl --steps 1000 --out artifacts/native-brain
python packages/native-brain/infer.py --checkpoint artifacts/native-brain/gene-native-random-init.pt --prompt "Gene game plan:" --max-new-tokens 200
```

The scratch model is not a capable general-purpose coding model. No third-party AI provider is used by the native generation route. Research fetches public documentation endpoints only; these fetches do not call an AI model.

## Acceptance gates before merging

1. All existing repository tests pass.
2. Generated 2D game interaction tests pass in a real browser.
3. The Next.js production build passes.
4. A preview deployment is checked without promoting it to production.
5. Native mode does not call an external AI provider.
6. Project memory uses durable storage and is connected to verified build/test outcomes.
7. Neural inference is not used for builds until structured-output, held-out quality, and regression gates pass.
