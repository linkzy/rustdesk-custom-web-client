# R-21: internationalisation (i18n)

**Labels:** `help wanted`, `area:web` · **Milestone:** v0.4.0 — Bigger features

**Context.** All UI text is hardcoded English in JSX — form labels, status badges,
toolbar buttons, panel headings. RustDesk itself ships dozens of languages; a web
client that only speaks English is a strange gap.

**Do.** A tiny catalogue, no framework (~40 strings): `web/src/i18n/en.ts`,
`pt-BR.ts`, `index.ts` with `t(key)`. Replace every user-visible string in the
components. Locale from `navigator.language`, overridable in the UI, persisted as
`rclient_locale`. Set `<html lang>` accordingly.

**Where.** New `web/src/i18n/`; `web/src/components/*.tsx`; `web/src/App.tsx`.

**Accept.** No user-visible English left in components except proper nouns;
switching locale updates without reload; a missing key falls back to English with a
dev warning, not a crash; `index.html`'s static title/description stay English (for
crawlers); `npm run build` passes.

**Test without a host.** Everything is the connect screen and toolbar — no session
needed. Toggle the locale and check every visible string.

**Note.** Start with English + one translation you can actually review (pt-BR, given
the project's origin); adding more is then mechanical.
