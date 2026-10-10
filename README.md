# GENE — AI App & Game Builder

GENE is an AI-assisted workspace for building and editing self-contained web apps and browser games through natural-language chat. This repository is the source of truth for the app. Build/test status must describe work the app actually performed; failed generation is rejected rather than presented as a successful game.

## Current milestone: GENE 1.2 Flash foundation

Implemented in this branch:
- Chat-first workspace inspired by professional AI coding tools, with working navigation and dark/light themes.
- Two project types: browser games (Canvas 2D/raw WebGL) and frontend web apps (semantic HTML/CSS/JavaScript), each with separate planning/validation contracts and in-app source editing.
- App-specific welcome prompts, plans, live DOM preview, scrollable fullscreen preview, editable source tabs and standard ZIP exports (`index.html`, `styles.css`, `app.js`, `app-spec.json`) that can be imported back into GENE.
- A built-in, no-API-key-needed playable starter game (**Outpost: Last Light**) with keyboard/mobile controls, an energy-core objective, pursuing drones, dash, shield, win/loss states, restart, and editable/exportable HTML/CSS/JavaScript source.
- Plan/Build modes and a sequential one-question-at-a-time interview prompt contract.
- Gemini server API endpoint with server-only API key handling, thinking levels, response validation, rate limiting, and explicit errors when no key is configured.
- Read-only grounded Google Search mode; sources are returned from Gemini Search grounding when available.
- Genre-specific implementation/acceptance guides for platformers, precision runners, 2D action, tower defense, 3D lane runners and 3D arena games.
- Image and text/source reference attachments, with image bytes passed to Gemini.
- Browser project state with recent projects, editable game source, version snapshots, restore, preview, runtime error/first-render telemetry, and a bounded two-attempt repair loop.
- Full-window same-browser play route at `/play/<project-id>`.
- ZIP source export including current source, version snapshots, references, manifest and README; ZIP/legacy project import.
- Local Agent with token authentication, safe filesystem writes, previous-folder backups, on-disk source validation, real asset serving and a stable disk-backed play URL.
- GENE Forge: prompt-driven low-poly recipes converted into actual OBJ geometry, MTL materials and JSON asset manifests, plus an interactive WebGL mesh viewport, AI edits and individual file export. This is primitive-based mesh generation, not high-fidelity texturing or image-to-3D.
- Server-side checks for generated file names/sizes, JavaScript syntax, required canvas, game-spec fields, objective/win/loss declarations, render loop, input hooks, draw operations, external runtime dependencies and conservative object budgets.
- GitHub Actions contract tests including an HTTP end-to-end test of real local file sync and play serving, a production build, and Playwright browser tests for visible Canvas 2D pixels, keyboard movement, UI controls, a no-key playable starter, and real WebGL shader/buffer/draw calls.

App previews allow client-side form handlers while keeping the iframe sandboxed; a restrictive Content Security Policy blocks network connections and native form destinations. Current generated apps are self-contained frontends, not deployed backends.

The generation path asks Gemini for the actual source files used by the preview. Source validation and a visible canvas signal are useful diagnostics, but they are not equivalent to full gameplay automation. GENE must not claim that every game mechanic was verified unless it has evidence for that specific test.

## Stack

- Next.js 14 / React 18 / TypeScript
- Gemini API via server-side HTTPS (the API key is never sent to browser code)
- Sandboxed browser preview for self-contained Canvas 2D / raw WebGL projects
- JSZip for source project export/import
- GitHub Actions for contract tests and production builds

## Local development

Use Node.js 20 or a newer supported LTS release for the web workspace.

1. Copy `apps/web/.env.example` to `apps/web/.env.local`.
2. Set `GEMINI_API_KEY` to your own Google AI Studio API key. Do not commit this file.
3. From the repository root, run `npm install`.
4. Run `npm run dev`.
5. Open `http://localhost:3000`.

Run `npm test` for contract checks and `npm run build` for the production build.

## Deploy on Vercel

Import this GitHub repository into Vercel. Set the Root Directory to `apps/web`, build command to `next build`, and add `GEMINI_API_KEY` plus optional `GENE_FAST_MODEL` to Vercel Environment Variables. Do not commit `.env.local`.

## Honest limitations of this milestone

- Projects are stored in browser localStorage. Import/export lets you move them, but cloud persistence and shared accounts are not implemented yet.
- The web preview route uses this browser's saved project. The Local Agent route serves the actual synced files from disk at a localhost URL; that local URL is not a public/shareable deployed game URL.
- GENE returns generated source files and executes them in a sandboxed iframe; there is not yet a dedicated long-running filesystem worker or engine build farm.
- Static checks plus canvas telemetry cannot prove every gameplay path. Automated gameplay control/screenshot comparison and deterministic behavior tests are planned.
- 2D/3D game runtime targets self-contained Canvas 2D or raw WebGL. Three.js/Phaser adapters, Godot/Unity/Unreal exporters, multiplayer server generation and native EXE builds are not yet implemented.
- Forge creates real low-poly primitive-composed OBJ assets; it does not yet perform image-to-3D generation, Blender retopology/UV/rigging, advanced textures or texture baking. Mesh creation alone does not claim that the asset has been integrated into a gameplay scene.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
