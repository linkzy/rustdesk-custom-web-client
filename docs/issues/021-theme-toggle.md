# R-22: theme toggle (light / dark)

**Labels:** `good first issue`, `area:web` · **Milestone:** v0.4.0 — Bigger features

**Context.** The UI is dark-only with colours hardcoded per CSS module (`#0f172a`,
`#1e293b`, `#94a3b8`, …). The connect screen is the first thing a visitor sees, in
whatever light their desk has.

**Do.** Move the palette to custom properties on `:root` plus a
`[data-theme="light"]` block in `web/src/index.css`; replace hardcoded colours with
`var(--…)`; add a toggle (toolbar and connect screen) persisted as
`rclient_theme` = `'light' | 'dark' | 'system'`; default `system`, honouring
`prefers-color-scheme`.

**Where.** `web/src/index.css`, `App.css`, every `*.module.css`, `App.tsx`.

**Accept.** Both themes meet WCAG AA text contrast; no hardcoded hex remains in
module files; the choice survives reload and `system` follows the OS live; the
remote canvas stays neutral (it is video); `npm run build` passes.

**Test without a host.** The connect screen and toolbar are enough: toggle, reload,
change the OS theme, run a contrast pass.
