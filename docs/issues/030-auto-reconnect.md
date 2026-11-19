# R-08: reconnect automatically after a network drop

**Labels:** `help wanted`, `area:web` · **Milestone:** v0.3.0 — Everyday remote desktop

**Context.** Laptop sleep, a Wi-Fi switch or a proxy timeout closes the socket and
the session is gone; the user retypes the ID and password. This is the biggest
day-to-day gap against the native client.

**Do.** On an unexpected close while connected, retry with exponential backoff
(1, 2, 4, 8, 15 s, capped, ~10 attempts) and show "reconnecting in Ns…". Re-send
the last `connect` payload from memory when the socket reopens. Stop on user
disconnect, auth errors and `offline`; resume on the browser `online` event. Never
persist the password as a side effect.

**Where.** `web/src/hooks/useGateway.ts` (`ws.onclose`/`onerror`);
`ConnectForm.tsx` (state + Cancel); `App.tsx` if the toolbar shows it.

**Accept.** A dropped socket retries and reconnects without input; Disconnect never
retries; a wrong password never loops; attempts and the next retry are visible and
cancellable; `npm run build` passes.

**Test without a host.** Start/stop the gateway (or a fake WS server): the client
retries and reconnects; unit-test the backoff as a pure function.

**Note.** The gateway holds one session per socket; a reconnect is a fresh
rendezvous — RustDesk has no session resumption to reuse.
