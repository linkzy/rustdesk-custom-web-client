# R-27: add a language

**Labels:** `good first issue`, `area:web`, `area:docs` · **Milestone:** v0.4.0 — Bigger features

**Context.** The UI is now fully translated (English + pt-BR) through a tiny
catalogue in `web/src/i18n/`. Adding a language is meant to be a one-file,
one-line pull request — this issue is where that promise gets tested. Pick your
own language; if you can review the result, even better.

**Do.** Copy `web/src/i18n/en.ts` to `<tag>.ts` using the BCP 47 name
`navigator.language` produces (`de`, `fr`, `zh-Hans`, `es-419`), rename the export
and set `label` to the language's own name ("Deutsch"), then translate the values
— keeping every key and `{placeholder}` untouched. Register it with **one** entry
in `LOCALES` in `web/src/i18n/index.ts`. No component changes. Full walkthrough:
`docs/TRANSLATING.md`.

**Where.** New `web/src/i18n/<tag>.ts`, and one entry in `LOCALES` in
`web/src/i18n/index.ts`. Those are the whole integration — if you find yourself
editing a component, stop and say so in the PR.

**Accept.** `npm test` passes — the parity test fails if any key is missing or
extra, or a `{placeholder}` was renamed. `npm run lint`, `typecheck` and `build`
pass. Switching to your language leaves no English on the connect screen, the
toolbar, the Advanced options or a connection error, except the deliberate
exceptions in `docs/TRANSLATING.md` (product name, RustDesk terms, log lines,
`index.html` metadata). One screenshot of the connect screen in your language in
the PR.

**Test without a host.** Everything is the connect screen and toolbar — no session
needed. Switch the language in the picker, open Advanced options, and force a
connection error (any bad ID) to see the translated badge.

**Note.** Translating is mostly mechanical, and that is the point: if you had to
touch a component, say so in the PR — the design got in the way and we want to
know.
