# GENE Studio 2.0 — Full Product Redesign Specification

Status: design specification for the next implementation pass. This is intentionally a full workspace redesign, not a cosmetic polish checklist.

## Product principle

GENE is a game-making studio with an AI teammate. The main interface should make the project, live build, file hierarchy, active task, and next action obvious. Conversation is one control surface—not the entire product. Preserve the existing generation engine, project state, build/run contracts, file operations, and cancellation behavior while redesigning presentation and navigation.

## Visual identity

### Direction
- Light-first, calm, precise, crafted, and tactile. Use warm off-white canvas, clean white working surfaces, charcoal text, muted secondary text, thin neutral dividers, and one restrained signature accent.
- A small amount of glass/material depth for floating inspectors and preview overlays only; no heavy blur behind every panel.
- Strong typography hierarchy, compact labels for technical metadata, generous whitespace for high-value work, and dense-but-readable tool panels.
- Studio should feel like a thoughtful creative tool, not a futuristic spaceship, crypto dashboard, generic admin template, or chat clone.
- No neon glow, overdone gradients, excessive rounded cards, decorative orbital backgrounds, fake metrics, or permanently animated decoration.

### Design tokens
Create central CSS custom properties for:
- app canvas, primary surface, elevated surface, inset surface;
- primary/secondary/muted text and link/accent states;
- subtle/strong borders, focus ring, selected state, success/warning/error/info;
- spacing scale, compact and comfortable density;
- small/medium/large radii and shadow levels;
- UI font, display font, monospace font;
- transition duration/easing and reduced-motion override.
Do not scatter one-off colors and radii across components. Verify contrast for text, statuses, focus, and disabled controls.

## Information architecture

### Global frame
- **Workspace switcher:** brand mark, current project, recent projects, create/import, settings, help.
- **Project navigation:** Studio, Files, Plan & Tasks, Assets, Scene/Visual Editor when supported, Versions/Recovery, Diagnostics.
- **Main work surface:** content changes based on the selected tool but project identity and task state remain visible.
- **Live output:** game/app preview is a first-class pane, resizable/collapsible and expandable to focused play mode.
- **Activity/status area:** truthful connection, dirty-file, save, build, runtime, and export states. Never show success just because an action was requested.

### Responsive behavior
- Desktop wide: project navigation + central work surface + live preview; allow preview width adjustment and optional file inspector.
- Desktop medium: collapsible project navigation and inspector; preserve preview controls.
- Tablet: use an explicit tool switcher and collapsible preview rather than squeezing all panes.
- Mobile: single active surface at a time, bottom or top tool navigation, focused preview screen, usable composer, touch-sized controls, and no horizontal overflow.
- Persist user-selected pane sizes and collapse state only if supported safely by existing preferences; never lose project content when changing layouts.

## First-run and project creation

### Welcome screen
Replace the large generic chat-first welcome with a project dashboard:
- prominent **New project** and **Open/import project** actions;
- recent projects with real names, engine/format, last-opened time where available, and genuine status;
- start-from-prompt option;
- small, curated starter templates grouped by game type, not a wall of cards;
- clear distinction between a blank project, a starter prototype, and an existing project.
Avoid fabricated thumbnails or progress. If no recent project data exists, show a purposeful empty state.

### Project creation flow
- Step 1: name and project type (2D game, 3D/browser game, web app, or let GENE decide).
- Step 2: engine/runtime target and platform expectations only when they affect generation.
- Step 3: describe the game, attach references, or choose a starter.
- Optional advanced settings collapsed by default.
- Show the initial project brief and allow correction before generation begins.
- Keyboard navigation, cancel/back, focus management, and mobile layout must work.

## Main Studio workspace

### Top project bar
Show project name, saved/unsaved state, selected target, runtime status, and focused actions: Play, Build/Check, Export. Put less common actions (publish, sync to local agent, package builds, duplicate, settings) in a discoverable overflow menu. Keep buttons functional and labels truthful.

### Project explorer
- Render a true nested tree from file paths, not a flat list of every file.
- Expand/collapse folders, distinguish file types, highlight the active file, and show dirty/unsaved state where available.
- Support create file/folder, rename, move, duplicate, delete with confirmation for destructive operations, and reveal/open actions only when the underlying operation is supported.
- Provide search/filter and a useful empty state.
- Show safe errors for collisions, invalid paths, unsupported files, and failed operations.
- Do not make a visual mock tree: actions must mutate the actual project state and survive existing save/recovery behavior.

### Editor surface
- File tabs with active, dirty, and close states; keep a clear path breadcrumb.
- Readable editor area, line/diagnostic gutter if supported, and visible language/file type.
- Avoid claiming full IDE features (language server, debugger, syntax intelligence) unless implemented.
- For source edits, provide clear save/apply state and a safe way to revert to the saved version.
- On narrow screens, use a file selector rather than overflowing tabs.

### Live preview / play mode
- Preview pane with clear loading, ready, runtime error, and empty states.
- Play, pause, restart, fit-to-view, expand, and open-separately actions where supported.
- Keyboard focus should go to the game only when the player intentionally clicks/focuses it; provide a way to return to Studio.
- Preview errors should expose a concise message and a path to relevant logs/files when available.
- A preview that rendered once must not be presented as proof that all mechanics work.
- In focused play mode, reduce editor chrome but keep exit, restart, and runtime status obvious.

### Conversation and AI task rail
- Treat chat as a teammate panel connected to the selected project and current task.
- Separate user messages, plans, file changes, test results, warnings, and errors using restrained visual differences.
- Composer should show the selected mode (Chat, Plan, Build), model/reasoning choice, attachments, and keyboard hints without crowding the prompt.
- Use contextual actions: apply/retry/review change/open file/view test result.
- Show actual work events and task checkpoints, never fabricated percentage progress.
- A new chat must not appear to cancel or inherit another task unless that behavior is explicitly wired and truthful.

### Autonomous and interactive modes
- **Interactive:** ask before significant architecture decisions, explain the next change, make bounded edits, and let the user steer.
- **Autonomous:** show the brief, planned milestones, current operation, cancellation, and final report; minimize interruptions after scope is agreed.
- Both modes use the same project files, preview, diagnostics, and recovery model. Make the active mode clear.
- A single prominent Stop action must cancel the active run and queued work as appropriate; reflect cancellation only after it is acknowledged. Keep unrelated chats isolated.

## Plan, tasks, diagnostics, and recovery

### Plan & tasks
- Compact project brief with goals, controls, mechanics, target, and acceptance criteria.
- Task list with pending/running/passed/failed/skipped states and links to relevant output.
- Clearly distinguish planned checks from executed checks.
- Explain when a prototype is smaller than the requested full game.

### Diagnostics
- Group issues by severity and source (generation, syntax/build, runtime, assets, export).
- Show file path, short actionable description, and available fix/retry action.
- Filter by errors/warnings/info; stale reports must be marked stale.
- No fake green checkmarks or unsupported quality claims.

### Versions and recovery
- Timeline/list of real saved checkpoints, timestamp, and meaningful change summary when available.
- Preview diff/restore where existing data supports it.
- Confirm restore and explain what will be replaced.
- Preserve current work before risky operations; never imply cloud persistence if state is local-only.

## Assets and visual editing

### Asset library
- Browse generated assets with actual names, type, source path, and available metadata.
- Search/filter by type and project usage.
- Create/import/replace/rename/delete operations must be real, path-safe, and integrated with the file tree.
- Empty states should explain what can be added.

### Asset Forge / scene tools
- Put generation prompt, asset settings, preview, and saved outputs into a coherent workspace.
- Separate generation controls from inspection controls.
- Show supported formats and real geometry/material metadata; do not invent polygon counts or rigging features.
- When editing an asset, make the target asset explicit and provide a clear before/after or version state where feasible.

## Build, export, and publish

- One consistent output center for browser preview, source ZIP, local-agent sync, and available Windows/Android packaging.
- Each target states what it actually produces and any requirements/limitations.
- Show queued/running/success/failed states only when supported by real task data.
- Make downloadable outputs and logs easy to find; distinguish an Electron wrapper from a native engine build.
- Publishing configuration and errors should be actionable. A deployment quota or missing credential must not be presented as a successful deployment.

## Interaction and motion

- All buttons have a real action and appropriate disabled/loading state.
- Hover, pressed, selected, focus, disabled, empty, loading, success, warning, and error states are designed consistently.
- Use motion only to communicate navigation, loading, or state change. Honor prefers-reduced-motion.
- Keyboard: logical tab order, visible focus, escape to close dialogs/menus where appropriate, and no keyboard traps.
- Dialogs have labels, focus management, safe close behavior, and accessible status announcements.
- Touch targets are comfortable; tooltips never carry the only explanation of a critical action.

## Accessibility and localization readiness

- Semantic landmarks and heading hierarchy.
- Accessible names for icon-only controls.
- Contrast-tested text and status colors.
- No status conveyed by color alone.
- Respect reduced motion and browser zoom.
- Avoid hard-coded text layout assumptions that break with Arabic or longer labels; keep layout ready for RTL even if full localization is later.

## Implementation phases

### Phase A — Inventory and baseline
- Map current components, state ownership, CSS selectors, project operations, preview lifecycle, cancellation, and persistence.
- Capture baseline desktop and mobile screenshots.
- Identify duplicate/overlapping styles and fragile selectors before removing them.

### Phase B — Tokens and global frame
- Add centralized design tokens and typography.
- Redesign app canvas, top bar, navigation, workspace grid, and status surfaces.
- Preserve every existing action and project state contract.

### Phase C — New project and navigation
- Redesign welcome/dashboard and project creation dialog.
- Build nested project explorer and responsive navigation.
- Test create/open/import flows and active project changes.

### Phase D — Core studio
- Redesign chat/task rail, composer, mode selector, progress, and stop/cancel presentation.
- Redesign editor tabs and actual file operations.
- Redesign live preview and focused play mode.

### Phase E — Tools and output
- Redesign plan/tasks, diagnostics, versions/recovery, assets/Forge, export and publish output.
- Reuse shared components and status language rather than styling each tool independently.

### Phase F — Responsive/accessibility pass
- Test wide desktop, medium desktop, tablet and 390px mobile.
- Check keyboard flows, focus states, reduced motion, overflow, and long project/file names.

### Phase G — Regression and release
- Run typecheck, unit/contract tests, production build and browser playground.
- Add interaction checks for navigation, project creation, nested tree, preview controls, stop/cancel and narrow view.
- Compare screenshots to baseline and fix regressions.
- Push directly to main as requested; do not claim the redesign is live until deployment is confirmed.

## Definition of done

The redesign is complete only when:
1. The whole Studio—not just a header or button set—has a coherent new visual system.
2. Welcome, project creation, navigation, chat/task rail, editor/files, live preview, plan/diagnostics, assets, recovery and output surfaces are included.
3. Existing project generation, files, preview, cancellation, export, and recovery still work.
4. Desktop and mobile screenshots show the new layout without overflow or broken hierarchy.
5. Core controls have actual behavior and pass browser interaction tests.
6. Typecheck, automated tests and production build pass, with any environmental test limitation explicitly recorded.
7. The main branch contains the work; deployment status is reported separately.

## Out of scope for the redesign
- Replacing the game-generation architecture or model provider system.
- Fake cloud storage, fake multiplayer, fake native builds, or fake quality badges.
- Rewriting the application wholesale just to change the look.
- Treating a polished UI as proof of professional game-generation quality.
