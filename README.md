# GENE — AI App & Game Builder

GENE is an AI-assisted workspace for building and editing self-contained web apps and browser games through natural-language chat. This repository is the source of truth for the app. Build/test status must describe work the app actually performed; failed generation is rejected rather than presented as a successful game.

## Current milestone: GENE 1.2 Flash foundation

Implemented in this branch:
- Chat-first workspace inspired by professional AI coding tools, with working navigation and dark/light themes.
- Two project types: browser games (Canvas 2D/raw WebGL) and frontend web apps (semantic HTML/CSS/JavaScript), each with separate planning/validation contracts and in-app source editing.
- App-specific welcome prompts, plans, live DOM preview, scrollable fullscreen preview with an edit composer, editable source tabs, and a standalone PWA export plus Electron/Capacitor wrapper kits.
- A built-in, no-API-key-needed playable starter game (**Outpost: Last Light**) with keyboard/mobile controls, an energy-core objective, pursuing drones, dash, shield, win/loss states, restart, and editable/exportable HTML/CSS/JavaScript source.
- Plan/Build modes and a sequential one-question-at-a-time interview prompt contract.
- Multi-provider AI endpoint: Gemini is primary, with optional Groq and OpenRouter fallback keys; provider keys remain server-side, and thinking levels affect request strategy.
- Staged four-file generation, per-file compact retries, source normalization, title repair, and final assembled-project validation to prevent incomplete or invalid AI output from being saved.
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
2. Set `GEMINI_API_KEY`; optionally configure `GROQ_API_KEY` and/or `OPENROUTER_API_KEY` for cross-provider recovery. Set `GENE_AI_REVIEW=true` to have a different configured provider independently review candidate code before validation (best effort, with extra quota/latency). Never commit secrets.
3. From the repository root, run `npm install`.
4. Run `npm run dev`.
5. Open `http://localhost:3000`.

Run `npm test` for contract checks and `npm run build` for the production build.

## Deploy on Vercel

Import this GitHub repository into Vercel. Set the Root Directory to `apps/web`, build command to `next build`, and add `GEMINI_API_KEY` plus optional `GENE_FAST_MODEL` to Vercel Environment Variables. Do not commit `.env.local`.

## Optional web publishing

The Publish action creates a static Vercel deployment only when these server-side variables are configured: `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, and `GENE_PUBLISH_PASSWORD` (optional `VERCEL_TEAM_ID` and `VERCEL_PROJECT_NAME`). The publish password gates deployment creation; use a strong secret and rotate it if exposed. Vercel API/deployment quotas still apply.

## Honest limitations of this milestone

- Projects are stored in browser localStorage. Import/export lets you move them, but cloud persistence and shared accounts are not implemented yet.
- The web preview route uses this browser's saved project. The Local Agent route serves the actual synced files from disk at a localhost URL; that local URL is not a public/shareable deployed game URL.
- GENE returns generated source files and executes them in a sandboxed iframe; there is not yet a dedicated long-running filesystem worker or engine build farm.
- Static checks plus canvas telemetry cannot prove every gameplay path. Automated gameplay control/screenshot comparison and deterministic behavior tests are planned.
- 2D/3D game runtime targets self-contained Canvas 2D or raw WebGL. Three.js/Phaser adapters, Godot/Unity/Unreal exporters, multiplayer server generation and native EXE builds are not yet implemented.
- Forge creates real low-poly primitive-composed OBJ assets; it does not yet perform image-to-3D generation, Blender retopology/UV/rigging, advanced textures or texture baking. Mesh creation alone does not claim that the asset has been integrated into a gameplay scene.

## GENE 1.5 Flash Preview roadmap

See [docs/GENE-1.5-PREVIEW-ROADMAP.md](docs/GENE-1.5-PREVIEW-ROADMAP.md) for the preview scope, cloud EXE/APK reliability gates, autonomous brain improvements, and production acceptance criteria.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).


## Real cloud EXE/APK builder

The workspace has a one-click cloud packaging path backed by GitHub Actions:
- Windows workers use Electron Builder on a real Windows runner to compile a Windows installer (.exe).
- Linux workers provision Java and the Android SDK, then compile a real Capacitor Android debug APK (.apk).
- GENE sends only an AES-256-GCM encrypted source bundle to a temporary gene-build-* branch. The shared encryption key is never stored in the source repository. Old encrypted source branches are cleaned up after seven days.
- Build state and direct binary URLs are returned to the workspace. The resulting binary URLs are served from Vercel Blob and can be downloaded without manually extracting a ZIP.

### One-time cloud setup

1. In Vercel, create a Blob store for the gene-flash project and copy its read/write token.
2. Create a fine-grained GitHub personal access token limited to this repository, with **Contents: Read and write** and **Actions: Read and write**. Store it only in Vercel as GENE_BUILD_GITHUB_TOKEN.
3. Generate one 32-byte encryption key, for example with Node.js: <code>node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"</code>.
4. Add these Vercel Production environment variables, then redeploy:
   - GENE_BUILD_GITHUB_TOKEN: the fine-grained repository token from step 2.
   - GENE_BUILD_PASSWORD: a strong private password used to authorize cloud build requests in the workspace.
   - GENE_BUILD_ENCRYPTION_KEY: the base64 key from step 3.
   - GENE_BUILD_REPOSITORY: Mody2024/GENE (optional; this is the default).
5. In **GitHub → Mody2024/GENE → Settings → Secrets and variables → Actions**, add:
   - GENE_BUILD_ENCRYPTION_KEY: exactly the same key as in Vercel.
   - BLOB_READ_WRITE_TOKEN: the Vercel Blob read/write token from step 1.
6. Ensure GitHub Actions are enabled for the repository. Use the workspace's **Build setup** button to check whether Vercel-side configuration is detected.

### Output and security notes

- Build inputs are limited to 100 files and 3 MB of source, with path traversal checks. Do not embed large images/audio/video as data URLs; keep the project lightweight.
- Build source is encrypted before it is committed to a temporary branch. Temporary encrypted source and status branches are deleted after seven days.
- Direct artifact URLs use a public Vercel Blob store: anyone who obtains a URL can download that project's EXE/APK. Treat the links as shareable and do not build confidential projects unless this visibility is acceptable.
- Android output is a **debug-signed APK** suitable for testing and direct installation. Google Play releases require a release keystore, package identity, and release signing configuration.
- Windows output is a compiled Electron installer, not a signed Windows publisher binary. SmartScreen may warn until it is signed with a trusted code-signing certificate.
- Cloud builds use GitHub Actions minutes, Vercel Blob storage/bandwidth, and dependency downloads. Free quotas may limit how many projects can be built.
- This build route packages web apps/games as Electron/Capacitor shells. It is not a Unity/Godot/Unreal native project compiler.
