# GENE Studio 2.0 — Full Redesign Entry Point

The next design update is a **full Studio redesign**, not a cosmetic polish pass.

The complete design scope, information architecture, responsive layouts, interaction contracts, accessibility requirements, implementation phases, and definition of done are documented here:

- [Full GENE Studio 2.0 Redesign Specification](./GENE-STUDIO-2.0-REDESIGN-SPEC.md)

## Scope at a glance

- Rework the global Studio frame, project navigation, and responsive behavior.
- Redesign first-run dashboard and project creation.
- Turn the flat project list into a real hierarchical file explorer.
- Redesign editor surface, chat/task rail, autonomous and interactive modes, and Stop behavior presentation.
- Make live preview and focused play mode first-class.
- Redesign Plan & Tasks, diagnostics, versions/recovery, Assets/Forge, and build/export/publish surfaces.
- Introduce consistent light-first design tokens, typography, spacing, status states, and motion rules.
- Test desktop, tablet, mobile, keyboard accessibility, and existing project-generation behavior.

## Release rule

Implement the design across real existing components. Do not ship a header-only makeover, mock controls, fake project data, or visual changes that break generation, cancellation, files, preview, or export. Run typecheck, automated tests, production build, and browser-playground checks. Push directly to main as requested. Production deployment is a separate status and must not be claimed until confirmed.
