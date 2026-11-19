# R-26: friendlier errors in the connect flow

**Labels:** `good first issue`, `area:web` · **Milestone:** v0.2.0 — Community-ready

**Context.** The form shows raw strings — `Peer not available: OFFLINE — make sure
the RustDesk app is running…`, `WebSocket connection failed`. The technical text
belongs in the Debug Panel; the form should say what happened and what to try.

**Do.** A pure `friendlyError(raw): { title, hint }` in new
`web/src/utils/errors.ts`, mapped: wrong password, offline/not running, relay
timeout, host closed, gateway unreachable, captcha, everything else → current
message. `useGateway.ts` keeps `addLog(raw)`; `ConnectForm.tsx` renders title+hint.

**Where.** New `web/src/utils/errors.ts`; `web/src/hooks/useGateway.ts`;
`web/src/components/ConnectForm.tsx`.

**Accept.** Pure function, unit-testable with no browser; every case above covered;
unknown errors fall through safely; raw text still reaches the Debug Panel;
`npm run build` passes.

**Test without a host.** Unit-test the mapping; in the browser, connect to an
unknown machine ID on a reachable relay → "offline" wording; stop the gateway →
"gateway unreachable" wording.
