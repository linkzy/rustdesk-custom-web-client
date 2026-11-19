# KI-006: forward common keyboard shortcuts (Ctrl+C, Ctrl+V, …)

**Labels:** `bug`, `help wanted`, `area:web` · **Milestone:** v0.3.0 — Everyday remote desktop

**Context.** Ctrl+C / Ctrl+V / Ctrl+A / Ctrl+Z do not reach the remote machine. Two
causes are tangled: the browser may consume some combinations before the page sees
them, and copy/paste needs a clipboard channel that does not exist (R-10).
`keymap.ts` already encodes Ctrl/Alt as `chr` + `keyCode`, so the encoding is
probably not the culprit.

**Do.** Instrument first: temporarily restore the commented keystroke log in
`server.ts` (R-15) or log in the browser which events arrive, and build a
shortcut × browser table (Chrome, Firefox, Safari). For shortcuts that never
arrive, check the listener target (`document` vs canvas) and `preventDefault`
timing. Fix what can work; document the browser-reserved ones in the help overlay.
Copy/paste proper lands with R-10.

**Where.** `web/src/components/RemoteScreen.tsx`; `gateway/src/utils/keymap.ts`;
`gateway/src/server.ts`.

**Accept.** The PR (or `docs/KNOWN_ISSUES.md`) shows which shortcuts now work per
browser; Ctrl+A / Ctrl+Z reach the host; Ctrl+C / Ctrl+V work with R-10 or are
documented as blocked on it; no typing regression (KI-005 stays fixed);
`npm run build` passes.

**Test without a host.** Logging the received `KeyboardEvent`s in each browser
answers half the question; end to end needs a host.

**Note.** This is an open bug; the fix may be partly documentation. State what was
proven and what was not.
