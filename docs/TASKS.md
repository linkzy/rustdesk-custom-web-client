# Roadmap

What is finished, what is open, and where to start. Every open item keeps its
`R-xx` id — the GitHub issues built from this list use the same ids in their
titles, so the two never drift.

- Statuses here are kept in sync with `docs/KNOWN_ISSUES.md` and with the code on
  `main`.
- Issue drafts for each open item live in [`docs/issues/`](./issues/); the ones
  meant to stay open for contributors are marked **good first issue**.
- Mislabelled, stale or missing statuses are bugs in their own right — see the
  conventions at the end.

---

## Done

**Phases 1–7 (v0.1.0)** — 22 tasks: protocol foundation, rendezvous, relay,
session, input, the React frontend, and the first deployment. Details are in git
history.

**Shipped features:** H264/VP9/VP8/AV1 video via WebCodecs (R-11 tuning),
keyboard and mouse input, audio (Opus via `AudioDecoder`, R-09), fullscreen
(R-05), fit / 1:1 scaling (R-06), per-connection relay settings (R-03), hCaptcha
(R-04), a debug overlay, colour themes, the "Remember password" opt-in (R-20), and
internationalisation with English + pt-BR (R-21).

**Fixed issues:** KI-001 (10-second disconnect), KI-004 (scroll direction),
KI-005 (keyboard case/layout). See `docs/KNOWN_ISSUES.md`.

**Deployment:** `docker-compose.yml` (from source), `docker-compose.prod.yml`
(published images), the public demo at <https://rclient-demo.linkzy.dev> on its
own relay pair, and the demo's stability settings (memory caps and log rotation,
R-16/R-19 — partial: only the demo stack has them).

---

## v0.2.0 — Community-ready

Everything a stranger needs to trust and try the repo. Mostly Phase 1 leftovers.

| ID | What | Why it matters | Start at | Difficulty | Label |
|---|---|---|---|---|---|
| R-16 | Log rotation and healthchecks in the repo's own compose files | The demo is capped and healthchecked; a self-hoster's stack still has neither. | `docker-compose.yml`, `docker-compose.prod.yml` | easy | good first issue |
| R-19 | Memory limits in the repo's own compose files | One runaway container can take down a small VPS. | `docker-compose.yml`, `docker-compose.prod.yml` | easy | help wanted |
| R-17 | Structured logging (`level`, session id) | Grepping `[session]` across thousands of lines is the current debugging experience. | `gateway/src/server.ts`, `gateway/src/session.ts` | medium | help wanted |
| R-18 | Firewall guidance for self-hosted relays | "Block scanners at the firewall" is one line with no instructions today. | new `docs/deployment/HARDENING.md` | easy | help wanted |
| R-25 | Reverse-proxy examples (Caddy, Traefik, NPM) | A wrong WebSocket proxy looks like a gateway bug; the README has only a three-line Caddy snippet. | new `docs/deployment/REVERSE-PROXY.md` | easy | good first issue |
| R-26 | Friendlier connect errors | Raw RustDesk strings appear in the form; the technical text belongs in the Debug Panel. | `web/src/hooks/useGateway.ts`, `ConnectForm.tsx` | easy | good first issue |
| R-23 | Audio mute + volume slider | Audio plays at full volume with no control, though a `GainNode` already exists. | `web/src/video/audio.ts`, toolbar | easy | good first issue |
| R-24 | Keyboard shortcut help overlay | Nothing in the app explains what is forwarded and what is not. | new `web/src/components/ShortcutHelp.tsx` | easy | good first issue |

**Already landed for this milestone** (not issues): the vitest suite in both
packages (`npm test`, 50 gateway + 97 web), CI on pull requests
(`.github/workflows/ci.yml`, lint → typecheck → test → build) and the lint fixes
that make that pipeline green.

---

## v0.3.0 — Everyday remote desktop

The things that make it feel like a real client rather than a demo.

| ID | What | Why it matters | Start at | Difficulty | Label |
|---|---|---|---|---|---|
| R-08 | Session auto-reconnect | Any network blip ends the session and the user starts over. | `web/src/hooks/useGateway.ts` | medium | help wanted |
| R-07c | Persist Advanced options per saved connection | Prerequisite for host cards; today there is one global set of relay overrides. | `web/src/components/ConnectForm.tsx`, new `web/src/utils/hosts.ts` | medium | help wanted |
| R-07b | Saved hosts ("Past hosts" cards) | Retrying a machine means retyping its ID and relay. Passwords must follow the Remember-password rule. | `web/src/components/ConnectForm.tsx`, `web/src/utils/hosts.ts` | medium | help wanted |
| R-10 | Clipboard sync | Copy/paste between browser and host does not exist; also the missing half of KI-006. | `gateway/src/session.ts` (proto `Clipboard`), `web/src/components/RemoteScreen.tsx` | hard | help wanted |
| KI-006 | Forward common shortcuts (Ctrl+C, Ctrl+V, …) | Open bug; some shortcuts never reach the page, and copy/paste needs R-10. | `web/src/components/RemoteScreen.tsx`, `gateway/src/utils/keymap.ts` | medium | help wanted |
| R-13b | Mobile keyboard input | Mouse/touch works on Android but there is no way to type. | `web/src/components/RemoteScreen.tsx` | medium | help wanted |

---

## v0.4.0 — Bigger features

Large, protocol-heavy or design-heavy work. Discuss before starting.

| ID | What | Why it matters | Start at | Difficulty | Label |
|---|---|---|---|---|---|
| R-14 | File transfer | Upload/download between browser and host (`FileAction`/`FileResponse` exist in the proto). | `gateway/src/session.ts`, new UI | hard | help wanted |
| R-12 | Multi-monitor | The gateway reads only `displays[0]`; hosts with several screens are stuck on one. | `gateway/src/session.ts` (`handlePeerInfo`) | hard | help wanted |
| R-21 | Internationalisation (i18n) | All UI strings are hardcoded English in JSX. | `web/src/i18n/` — **done**, English + pt-BR, see `docs/TRANSLATING.md` | medium | — |
| R-27 | Add a language (translation contributions) | One catalogue file and one registration line; the parity test keeps translations from drifting. | new `web/src/i18n/<tag>.ts`, `web/src/i18n/index.ts` | easy | good first issue |
| R-22 | Themes (light/dark) | Colours are hardcoded in the CSS modules. | `web/src/**/*.module.css` | medium | good first issue |

---

## Good first issues — stay open for contributors

These are deliberately **not** implemented in Phase 1. Each is self-contained,
touches one or two files, and has acceptance criteria a reviewer can check
without a RustDesk host. Full drafts in [`docs/issues/`](./issues/).

| ID | Issue | File | Why it is a good first issue |
|---|---|---|---|
| R-16 | Log rotation + healthchecks | `docker-compose*.yml` | Copy the demo stack's proven settings. |
| R-25 | Reverse-proxy examples | new `docs/deployment/REVERSE-PROXY.md` | Documentation plus config snippets. |
| R-26 | Friendlier errors | `web/src/utils/errors.ts` (new), `useGateway.ts` | A small mapping table and a pure function. |
| R-23 | Audio mute + volume | `web/src/video/audio.ts` | One component, one `GainNode`. |
| R-24 | Shortcut help overlay | new `web/src/components/ShortcutHelp.tsx` | Pure UI, static content. |
| R-22 | Theme toggle | `web/src/**/*.module.css`, `App.tsx` | CSS variables and a persisted preference. |
| R-27 | Add a language | new `web/src/i18n/<tag>.ts`, `web/src/i18n/index.ts` | Copy one file, translate, one line; the parity test does the reviewing. |
| — | Screenshots for the docs | `docs/assets/` (new) | Needs a real session; coordinate with the maintainer. |

`R-18`, `R-19` and everything in v0.3.0/v0.4.0 are `help wanted`: they need a real
RustDesk host, protocol insight, or more than a day's work.

---

## Conventions

- **One issue per `R-xx`.** The issue title starts with the id: `R-08: reconnect
  automatically after a network drop`.
- **Milestones** are `v0.2.0 — Community-ready`, `v0.3.0 — Everyday remote
  desktop`, `v0.4.0 — Bigger features`.
- **Labels**: `enhancement` (or `bug` for KI-006), plus exactly one of
  `good first issue` / `help wanted`, plus an `area:` label (see
  `docs/issues/README.md`).
- **Renumbering:** `R-21`–`R-26` came with this roadmap and `R-27` with the i18n
  contribution surface. `R-20` was the Remember-password fix, already shipped.
- **Closing an item** means: the code is merged, `docs/TASKS.md` and
  `docs/KNOWN_ISSUES.md` agree, and the issue is closed by the PR.

## Notes for AI agents

- Before starting any task, re-read `docs/AI_GUIDELINES.md` and `docs/PROTOCOL.md`
- **Read `docs/KNOWN_ISSUES.md` before touching `session.ts`** — it has critical implementation notes
- The most error-prone areas are: encryption (seqnum sync, nonce format), password hashing order, TestDelay echo direction (`from_client: false`), and `video_ack_required: false`
- Keep the gateway stateful per session — each browser connection maps to exactly one relay connection
- **Never commit `.env` files** — use `.env.example` with placeholder values only
- `npm test`, `npm run typecheck`, `npm run lint` and `npm run build` all pass in both packages; CI runs the same four on every pull request and on `main` (`lint` is real work now: `gateway/eslint.config.mjs` exists and web's four pre-existing `react-hooks` errors were fixed in code, not suppressed).
- The suite pins the pure parts (hashing, nonces, framing, key mapping, storage rules); a real session still needs a RustDesk host and relay.
- `docs/RELEASING.md` is the release checklist: bump, changelog, tag, images, GitHub Release.
