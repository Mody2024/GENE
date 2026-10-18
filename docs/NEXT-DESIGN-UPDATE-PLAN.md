# GENE Studio — Next Design Update Plan

## Goal

Ship a coherent, polished visual redesign of GENE Studio after the game-generation reliability update. The design must make GENE feel like a serious, approachable game-making workspace—not a generic chatbot, neon AI dashboard, or decorative mockup.

## Visual direction

- Light-first interface with warm whites, quiet neutral borders, readable charcoal text, and restrained accent color.
- Subtle glass/material depth only where it improves hierarchy; avoid neon, heavy gradients, sci-fi clutter, glowing borders, and excessive cards.
- Compact, deliberate spacing with a strong type scale and clear focus states.
- Responsive behavior for desktop and mobile; game preview remains the primary visual surface.
- Respect reduced motion, keyboard navigation, and contrast.

## Studio layout

1. **Workspace navigation:** projects, create/import, recent work, and settings in a compact rail or sidebar that can collapse on smaller screens.
2. **Conversation / task area:** readable conversation, clear current task state, one obvious stop/cancel action, progress tied to actual steps, and distinct messages for questions, plans, edits, and errors.
3. **Live game preview:** prominent and stable; controls for play/pause, restart, fit-to-view, and responsive preview where supported.
4. **Project explorer:** real hierarchical file tree, meaningful filenames, file-type icons, create/rename/move/delete actions with confirmations where destructive, and clear unsaved-change status.
5. **Inspector / output panel:** selected-file details, build diagnostics, tests and downloadable/exportable output without crowding the core workflow.
6. **Generation modes:** make interactive co-building and autonomous build modes visibly distinct while sharing one consistent workspace.

## Interaction quality

- Show a concise plan before a substantial build, then stream actual task progress rather than fabricated percentages.
- Keep Stop responsive and scoped to the current task/chat; a new chat must not inherit an old task's ability to mutate files.
- Provide clear retry, cancel, undo/recovery, and error explanations.
- Use adaptive controls: beginner-friendly defaults, advanced details only when needed.
- Make empty, loading, error, success, and long-running states intentional and visually consistent.
- Avoid decorative buttons that do nothing; every visible action must work.

## Implementation order

1. Audit existing Studio components and styles; preserve working game-generation, cancellation, file operations, and preview behavior.
2. Define design tokens for surfaces, text, borders, spacing, radius, typography, focus, and motion.
3. Refactor the main workspace shell and responsive layout without changing generation semantics.
4. Redesign project navigation/file tree and selection states.
5. Refine conversation/task status and stop/cancel affordances.
6. Refine game preview controls, diagnostics, and build/export feedback.
7. Add responsive, accessibility, and interaction regression checks.
8. Capture desktop and mobile screenshots in the existing browser playground; fix visible regressions before considering the design update complete.

## Acceptance criteria

- No neon/futuristic clutter; clear light-first visual hierarchy.
- Desktop and mobile layouts both usable without horizontal overflow.
- The game preview is easy to find and operate.
- File hierarchy reflects the actual project; file operations are functional and safe.
- Stop/cancel is visible and actually stops the active task.
- Loading, error, success, and empty states are designed, not accidental.
- Existing generation, preview, export, and file-operation contracts continue to pass.
- Browser checks include at least the workspace shell, project tree interactions, preview controls, and narrow viewport.
- Production build and automated tests pass. Deploy only when deployment limits allow; do not report an un-deployed commit as live.

## Explicitly out of scope for this design pass

- Rewriting the model/provider architecture.
- Claiming a visual redesign makes generated games professional by itself.
- Adding decorative features without functional implementations.
- Replacing working components wholesale when a focused refactor is safer.
