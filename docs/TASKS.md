# Development Task List

> **AI agents**: All Phase 1–7 tasks are complete as of v0.1.0. The project is working.  
> Current work focuses on the known issues and roadmap items below.  
> Statuses here are kept in sync with `docs/KNOWN_ISSUES.md` and with the code on `main`.

---

## Phase 1–7: Complete ✅

All 22 original tasks are done. See git history for implementation details.

| Phase | Tasks | Done |
|---|---|---|
| 1 — Foundation | 3 | 3 |
| 2 — Rendezvous | 2 | 2 |
| 3 — Relay | 2 | 2 |
| 4 — Session | 3 | 3 |
| 5 — Input | 2 | 2 |
| 6 — Frontend | 7 | 7 |
| 7 — Deploy | 3 | 3 |
| **Total** | **22** | **22** |

---

## Known Issues (Resolved in v0.1.1) ✅

| ID | Summary |
|---|---|
| KI-004 | Mouse scroll wheel direction inverted — **fixed** (`RemoteScreen.tsx` inverts `deltaY`) |
| KI-005 | Keyboard layout / Caps Lock mismatch — **fixed** (printable characters go through the `unicode` field; keyup is skipped) |

Open issues live in `docs/KNOWN_ISSUES.md`: KI-003 (performance) and KI-006 (Ctrl+C / Ctrl+V not forwarded).

---

## Roadmap — Feature Work

| ID | Priority | Feature | Status | Notes |
|---|---|---|---|---|
| R-03 | 🔴 High | User-configurable server (Advanced Options) | ✅ **Done** | Collapsible "Advanced" section in login form; fields for hbbs/hbbr/server key. localStorage persistence. Full gateway wiring. |
| R-04 | 🔴 High | CAPTCHA on connect | ✅ **Done** | hCaptcha widget, server-side verification, `/config` endpoint. Enabled with `CAPTCHA_ENABLED=true` plus `HCAPTCHA_SITE_KEY`/`HCAPTCHA_SECRET_KEY` on the gateway (see `gateway/.env.example`). |
| R-05 | 🔴 High | Full screen mode | ✅ **Done** | Fullscreen API, toolbar button, hides toolbar when active. Escape to exit. |
| R-06 | 🔴 High | Canvas scaling / fit-to-window | ✅ **Done** | Fit (CSS aspect-ratio) / 1:1 native toggle. Preference persisted in localStorage (`rclient_fit`). |
| R-07 | 🟡 Medium | Multi-connection manager | 🟨 **Partial** | Only one set of connection fields exists, persisted in localStorage; a new connect replaces the current session (the gateway holds one `Session` per browser socket). Real multi-connection support and saved-host cards are R-07b/R-07c. |
| R-07b | 🟡 Medium | Past hosts cards | ❌ **Not started** | After a successful connection, save the host to a "Past hosts" section with cards (host ID + optional label + last connected timestamp). Clicking a card auto-fills the form (ID, password, and custom hbbs/hbbr/server key) and connects. Matching native client UX. |
| R-07c | 🟡 Medium | Persist Advanced Options per connection | ❌ **Not started** | Prerequisite for R-07b and R-14b. Each saved connection must remember its custom hbbs/hbbr/server key alongside the host ID and password, so a user can have multiple connections with different relay servers. |
| R-08 | 🟡 Medium | Session auto-reconnect | ❌ **Not started** | WebSocket drop triggers disconnect; no retry logic or exponential backoff. |
| R-09 | 🟡 Medium | Audio streaming | ✅ **Done** | Host audio (Opus) is forwarded by the gateway (`audio_frame` → marker byte 5, plus `Misc.audio_format` → `{type:'audio_format'}`) and played in the browser by `web/src/video/audio.ts` using WebCodecs `AudioDecoder` + Web Audio scheduling. Requires `AudioDecoder`/`AudioContext` in the browser; without them video and input keep working and audio is skipped. Merged on `main`. |
| R-10 | 🟡 Medium | Clipboard sync | ❌ **Not started** | Proto definitions exist (`Clipboard`). No handler in gateway or frontend. |
| R-11 | 🟢 Low | FPS improvement | ✅ **Done** | 30fps request, `image_quality` tuning, `test_delay`/`target_bitrate`, `video_ack_required: false`. FPS now depends on host machine performance. |
| R-12 | 🟢 Low | Multi-monitor support | ❌ **Not started** | Proto definitions exist (`SwitchDisplay`, `CaptureDisplays`). Gateway reads only `displays[0]`. No monitor selector UI. |
| R-13 | 🟢 Low | Mobile touch input | ✅ **Done** | Mouse clicks work on Android. If issues surface, file a new KI. |
| R-13b | 🟡 Medium | Mobile keyboard input | ❌ **Not started** | Touch/mouse works on mobile but there is no way to type on the remote machine from a mobile browser. Need an on-screen keyboard overlay or device keyboard forwarding. |
| R-14 | 🟢 Low | File transfer | ❌ **Not started** | Proto definitions exist (`FileAction`, `FileResponse`). No handler in gateway or frontend. |
| R-14b | 🟡 Medium | Demo defaults to public RustDesk servers | ✅ **Done (deployment)** | The repo's own `.env.example` still points at a self-hosted relay; the public demo is configured separately in `deploy/demo.env.example` with `HBBS_HOST`/`HBBR_HOST` = RustDesk's public servers, so a visitor needs only an ID and password. Visitors can still enter their own relay under Advanced Options. See `deploy/DEMO.md`. |
| R-20 | 🔴 High | "Remember password" opt-in (privacy fix) | ✅ **Done** | The password used to be written to `localStorage` on every keystroke. It is now saved only when the user ticks "Remember password" (off by default), and only after a successful connection; unticking deletes it. See `web/src/utils/passwordStorage.ts` and the Privacy section of `README.md`. |

---

## Roadmap — Deployment Stability

Operational improvements for the host running the relay and rclient. Unaddressed, an undersized VPS can freeze under log bloat, stale WebSocket connections and memory pressure.

The relay containers (`hbbs`/`hbbr`) are set up outside this repository, so the notes below distinguish what this repo's compose files configure (gateway, web) from what belongs to the relay stack.

| ID | Priority | Task | Notes |
|---|---|---|---|
| R-15 | 🔴 High | Disable keystroke-level logging | **Done** — the verbose `sendLog(...)` call in `gateway/src/server.ts` (in the `key` branch) is commented out. The comment says to restore it for keyboard shortcut debugging (see KI-006). Keystroke events were producing most of the log volume. |
| R-16 | 🟡 Medium | Persistent log storage with rotation | **Partial** — the public demo stack (`deploy/docker-compose.demo.yml`) sets `json-file` with `max-size: 10m`, `max-file: 3` (30 MB per container). The repo's `docker-compose.yml` / `docker-compose.prod.yml` and the relay stack still use the default unbounded driver. |
| R-17 | 🟡 Medium | Structured logging for easier analysis | Tag all log lines with level (`INFO`/`WARN`/`ERROR`) and include `sessionId` / `targetId` in a consistent structured field, so `grep 'ERROR'` gives instant signal. |
| R-18 | 🟡 Medium | Scanner blacklist | The relay is scanned by internet-wide crawlers. Block at the firewall or reverse-proxy level (`fail2ban` or equivalent). Low effort, reduces noise. |
| R-19 | 🟡 Medium | Container memory limits | **Partial** — the demo stack caps `gateway` at 192 MB and `web` at 96 MB (`mem_limit`). The repo's `docker-compose.yml` / `docker-compose.prod.yml` have no limits yet, and neither do the relay containers (`hbbs`/`hbbr`), which belong to the relay stack's own compose file. |

---

## Notes for AI Agents

- Before starting any task, re-read `docs/AI_GUIDELINES.md` and `docs/PROTOCOL.md`
- **Read `docs/KNOWN_ISSUES.md` before touching `session.ts`** — it has critical implementation notes
- The most error-prone areas are: encryption (seqnum sync, nonce format), password hashing order, TestDelay echo direction (`from_client: false`), and `video_ack_required: false`
- Keep the gateway stateful per session — each browser connection maps to exactly one relay connection
- **Never commit `.env` files** — use `.env.example` with placeholder values only
- `npm run build` passes in `web/`; `npm run lint` currently fails on four pre-existing `react-hooks` errors (`RemoteScreen.tsx` writes refs during render; `ConnectForm.tsx` calls `setCaptchaToken` inside an effect). Fixing them is test/lint work, not part of a feature change.
- The gateway's `lint` script cannot run yet: `eslint` is not a dependency of `gateway/package.json`. `npm run build` (plain `tsc`) is the check that works.

