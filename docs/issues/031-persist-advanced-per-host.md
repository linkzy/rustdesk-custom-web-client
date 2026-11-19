# R-07c: persist Advanced options per saved connection

**Labels:** `help wanted`, `area:web` · **Milestone:** v0.3.0 — Everyday remote desktop

**Context.** The Advanced options (rendezvous host, relay host, server key) are one
global set in `localStorage`. Anyone with two relays — home lab and work — retypes
them each time, and saved-host cards (R-07b) cannot exist without per-host settings.

**Do.** New `web/src/utils/hosts.ts` with a record keyed by machine ID
(`id`, `label?`, `lastConnectedAt`, `hbbsHost?`, `hbbrHost?`, `serverKey?`) in
`rclient_hosts` as one JSON array. The form fills Advanced fields from it; save on a
successful connection. Keep the global keys as the last-used values for a new ID so
nothing regresses.

**Where.** New `web/src/utils/hosts.ts`; `ConnectForm.tsx`; `App.tsx` (the
`connected` transition). Pattern: `web/src/utils/passwordStorage.ts`.

**Accept.** Two IDs with different relays keep their own settings across reloads;
**no password field** in `rclient_hosts` (any future one must go through the
Remember-password opt-in, per host); corrupt data is ignored, not fatal; unit-testable
with mocked storage; `npm run build` passes.

**Test without a host.** Unit tests: save, load, overwrite by id, remove, corrupt
JSON. In the browser, set two IDs' Advanced fields and reload.
