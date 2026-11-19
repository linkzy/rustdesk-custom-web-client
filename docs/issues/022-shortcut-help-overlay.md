# R-24: keyboard shortcut help overlay

**Labels:** `good first issue`, `area:web` · **Milestone:** v0.2.0 — Community-ready

**Context.** Every keypress in the remote screen goes to the host, so there is no
in-app way to discover what does what. A help overlay must document only what
actually works today — and say Ctrl+C / Ctrl+V still are not forwarded (KI-006).

**Do.** A modal listing client shortcuts (Escape exits fullscreen; Fit / 1:1 and
Fullscreen are toolbar buttons) and stating that everything else is forwarded. Open
with a locally intercepted key (`F1` is a candidate — it is in
`CONTROL_KEY_MAP`). Add a `?` button to the toolbar, close on Escape and backdrop
click, trap focus.

**Where.** New `web/src/components/ShortcutHelp.tsx` + `.module.css`;
`RemoteScreen.tsx` (the keydown handler that must intercept the trigger);
`App.tsx` (toolbar button).

**Accept.** Lists only working shortcuts and links KI-006; focus trapped, Escape
closes, focus restored; the trigger key is not forwarded while open;
`npm run build` passes.

**Test without a host.** Static UI: open, tab through, close, reopen. With a host,
press the trigger mid-session and confirm nothing appears remotely.

**Note.** Document what works; do not implement the shortcuts here.
