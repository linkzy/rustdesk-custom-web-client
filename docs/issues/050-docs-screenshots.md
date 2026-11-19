# Screenshots for the docs

**Labels:** `good first issue`, `area:docs`, `documentation` · **Milestone:** v0.2.0 — Community-ready

**Context.** The README describes the UI but shows nothing. Someone deciding whether
to trust a remote-desktop tool wants to see the connect screen and a session first.
Deliberately late: the UI still moves (title/meta in flight, theme toggle planned),
and screenshots age badly.

**Do.** Capture at a consistent size with every machine ID and hostname replaced by
placeholders: 1) the connect screen with the Remember-password checkbox,
2) toolbar + a session (plain desktop or terminal is fine), 3) the debug overlay.
Put PNGs (under ~300 KB each) in new `docs/assets/`, named `connect.png`,
`session.png`, `debug.png`; reference them from `docs/README.md` and the README's
"How it works".

**Where.** New `docs/assets/`; `docs/README.md`; README image slots (coordinate
with the maintainer).

**Accept.** No real IDs, relay hostnames, passwords or personal desktop contents;
images committed, not hotlinked; alt text describes what is shown; stable filenames.

**Test without a host.** The connect screen needs none. A session shot needs a real
host — if you have none, contribute the connect screen and mark the issue partial.

**Note.** A Playwright GIF/video is a separate, blocked follow-up; not here.
