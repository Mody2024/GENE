# GENE

GENE is an AI game-development workspace built around a persistent project filesystem, agentic planning/building, verified game runtimes, real versioning, and publishing.

Principles:
- No fake progress. UI activity must correspond to real tool execution.
- No build-succeeded claim without runtime validation.
- Plan mode is read-only; Build mode can mutate the project.
- Every mutation is versioned and reversible.
- The same project chat continues across edits.
- 2D targets Phaser; small browser 3D targets Three.js/WebGL.
- Performance budgets are part of every project contract.

Repository layout:
- apps/web: GENE web workspace
- apps/agent: local/remote project agent
- packages/ai-core: model routing, interview, planning, tool protocol
- packages/project-engine: filesystem, checkpoints, diffs, project model
- packages/game-runtime-2d: browser 2D runtime primitives
- packages/game-runtime-3d: browser 3D runtime primitives
- packages/forge: asset pipeline contracts and generators
- tests: contract and end-to-end tests

Phase 0 foundation is being built directly in GitHub. Generated ZIPs are not the source of truth.
