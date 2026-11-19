# R-17: structured logging for easier analysis

**Labels:** `help wanted`, `area:gateway` · **Milestone:** v0.2.0 — Community-ready

**Context.** Logs are free-form `[session]` lines plus a per-second FPS line per
session, interleaved across sessions. Debugging one connection means scrolling;
the keystroke log is off (R-15) precisely because volume was unmanageable.

**Do.** A small `log(level, msg, fields)` helper (new `gateway/src/utils/log.ts`)
emitting `INFO session=7f3a target=123456789 msg="login successful"`. Give each
`Session` a short id at construction and pass it through. Keep the `[component]`
context in the message. No framework, no JSON, no new dependency.

**Where.** `gateway/src/server.ts`, `session.ts`, `rendezvous.ts`, `relay.ts`.

**Accept.** Every `console.*` in `gateway/src/` goes through the helper; every line
has a level and (where one exists) a session id; `grep 'ERROR'` returns errors only;
message behaviour unchanged; `npm run build` passes.

**Test without a host.** Start the gateway, connect a browser socket, send a
`connect` for a non-existent ID: the rendezvous failure is one ERROR line with a
session id. `/config` still answers.
