# GENE — AI Game Studio

GENE is an AI-assisted game-development workspace. The repository is the source of truth: source edits are versioned, generated code is validated before it can be saved, and the UI must never claim that a build or test happened without evidence.

## Current milestone: V1.2 Flash foundation

- Chat-first workspace with Plan and Build modes
- Sequential question/answer interview
- Gemini API endpoint with server-only key handling
- Canvas/WebGL self-contained game source contract
- Server-side generated-file validation
- Local browser project persistence, source editor and version snapshots
- Sandboxed game preview with runtime error/render telemetry
- Explicit failure when Gemini is not configured; no fake AI build in fallback mode

The currently implemented agent returns generated source files to the browser workspace. Local browser persistence is useful for the first milestone; shared cloud persistence, authenticated multi-user projects, real automated browser gameplay testing, engine exporters, asset workers and publishing remain separate milestones and are not represented as already complete.

## Stack

- Next.js 14 / React 18 / TypeScript
- Gemini API through server-side HTTPS (no browser-exposed API key)
- Browser sandbox for running generated source
- GitHub Actions for smoke tests and production build validation

## Run locally

Node.js 20 is the recommended development runtime for the web workspace.

1. Copy `apps/web/.env.example` to `apps/web/.env.local`.
2. Set `GEMINI_API_KEY` to your own Google AI Studio API key. Keep it secret.
3. From repository root, run `npm install`.
4. Run `npm run dev`.
5. Open `http://localhost:3000`.

The web app can be built with `npm run build` and checked with `npm test`.

## Deploy on Vercel

Import this GitHub repository into Vercel and set the Root Directory to `apps/web`. Add `GEMINI_API_KEY` and optionally `GENE_FAST_MODEL` to Vercel Environment Variables. Do not commit `.env.local`.

## Current constraints

- This milestone targets small browser games with self-contained Canvas 2D or raw WebGL source.
- Browser-local projects live in localStorage. Clearing browser storage can remove them; export your project/source regularly.
- Generated projects are not automatically published to public URLs yet.
- A successful source validation does not by itself prove that every gameplay path works. The UI reports browser runtime signals but full automated gameplay tests are still planned.
- GPU-heavy image-to-3D generation is not yet implemented; Forge is currently a contract and pipeline boundary.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
