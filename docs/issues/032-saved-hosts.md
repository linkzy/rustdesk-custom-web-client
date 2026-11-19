# R-07b: saved hosts ("Past hosts" cards)

**Labels:** `help wanted`, `area:web` · **Milestone:** v0.3.0 — Everyday remote desktop

**Context.** Connecting twice means retyping the ID — and, without the
Remember-password opt-in, the password. The native client keeps recent peers; this
is the equivalent. Depends on R-07c for per-host relay settings.

**Do.** A "Recent hosts" list under the connect form: cards with label (or ID), last
connected time, and a custom relay marker. Clicking fills the form (ID, Advanced
options, and the password **only if** opted in for that host) and focuses Connect —
it does not auto-connect. A remove button with confirmation. Read/write through
`web/src/utils/hosts.ts`; no second store.

**Where.** New `web/src/components/RecentHosts.tsx` + `.module.css`;
`ConnectForm.tsx`; `web/src/utils/hosts.ts`.

**Accept.** Cards persist, keyed by ID, most recent first; click fills but does not
connect; removing a card removes its record (and saved password); keyboard
navigable, each card a real button; the feature stores no password itself;
`npm run build` passes.

**Test without a host.** Seed `localStorage.rclient_hosts` by hand and check
rendering, ordering, click and remove. Connecting needs a host (out of scope).
