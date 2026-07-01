# Development Task List

> **AI agents**: All Phase 1–7 tasks are complete as of v0.1.0. The project is working.  
> Current work focuses on known issues and roadmap items below.

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
| KI-004 | Mouse scroll wheel direction inverted — **fixed** |
| KI-005 | Keyboard layout / Caps Lock mismatch — **fixed** |

---

## Roadmap — Feature Work

| ID | Priority | Feature | Status | Notes |
|---|---|---|---|---|
| R-03 | 🔴 High | User-configurable server (Advanced Options) | ✅ **Done** | Collapsible "Advanced" section in login form; fields for hbbs/hbbr/server key. localStorage persistence. Full gateway wiring. |
| R-04 | 🔴 High | CAPTCHA on connect | ✅ **Done** | hCaptcha widget, server-side verification, `/config` endpoint. Needs actual hCaptcha keys in `.env` to enable. |
| R-05 | 🔴 High | Full screen mode | ✅ **Done** | Fullscreen API, toolbar button, hides toolbar when active. Escape to exit. |
| R-06 | 🔴 High | Canvas scaling / fit-to-window | ✅ **Done** | Fit (CSS aspect-ratio) / 1:1 native toggle. Preference persisted in localStorage. |
| R-07 | 🟡 Medium | Multi-connection manager | ✅ **Done** | Single set of fields persisted in localStorage. |
| R-07b | 🟡 Medium | Past hosts cards | ❌ **Not started** | After a successful connection, save the host to a "Past hosts" section with cards (host ID + optional label + last connected timestamp). Clicking a card auto-fills the form (ID, password, and custom hbbs/hbbr/server key) and connects. Matching native client UX. |
| R-07c | 🟡 Medium | Persist Advanced Options per connection | ❌ **Not started** | Prerequisite for R-07b and R-14b. Each saved connection must remember its custom hbbs/hbbr/server key alongside the host ID and password, so a user can have multiple connections with different relay servers. |
| R-08 | 🟡 Medium | Session auto-reconnect | ❌ **Not started** | WebSocket drop triggers disconnect; no retry logic or exponential backoff. |
| R-09 | 🟡 Medium | Audio streaming | ❌ **Not started** | Proto definitions exist (`AudioFrame`). No handler in gateway or frontend. |
| R-10 | 🟡 Medium | Clipboard sync | ❌ **Not started** | Proto definitions exist (`Clipboard`). No handler in gateway or frontend. |
| R-11 | 🟢 Low | FPS improvement | ✅ **Done** | 30fps request, `image_quality` tuning, `test_delay`/`target_bitrate`, `video_ack_required: false`. FPS now depends on host machine performance. |
| R-12 | 🟢 Low | Multi-monitor support | ❌ **Not started** | Proto definitions exist (`SwitchDisplay`, `CaptureDisplays`). Gateway reads only `displays[0]`. No monitor selector UI. |
| R-13 | 🟢 Low | Mobile touch input | ✅ **Done** | Mouse clicks work on Android. If issues surface, file a new KI. |
| R-13b | 🟡 Medium | Mobile keyboard input | ❌ **Not started** | Touch/mouse works on mobile but there is no way to type on the remote machine from a mobile browser. Need an on-screen keyboard overlay or device keyboard forwarding. |
| R-14 | 🟢 Low | File transfer | ❌ **Not started** | Proto definitions exist (`FileAction`, `FileResponse`). No handler in gateway or frontend. |
| R-14b | 🟡 Medium | Demo defaults to public RustDesk servers | ❌ **Not started** | Blocked by R-07c. Change the default `.env` `HBBS_HOST`/`HBBR_HOST` to point to the public RustDesk relay servers so the demo works out of the box for random visitors. The owner sets their custom relay in Advanced Options, which persists via R-07c. |

---

## Roadmap — VPS Infrastructure & Stability

Infrastructure improvements to keep the Oracle free-tier VPS stable. Unaddressed, the VPS will freeze ~every 3 weeks due to log bloat, stale WebSocket connections, and memory pressure.

| ID | Priority | Task | Notes |
|---|---|---|---|
| R-15 | 🔴 High | Disable keystroke-level logging | **Done** — commented out the `sendLog(...)` call in `server.ts:136`. Comment includes a note to restore for keyboard shortcut debugging (see KI-006). Keystroke events were producing 95%+ of all log volume (10k lines = ~30 min of use). |
| R-16 | 🟡 Medium | Persistent log storage with rotation | Switch Docker log driver from `json-file` (unbounded) to `local` or `journald` with `max-size=10m` `max-file=3`. Or mount a volume and write logs to file with external rotation. Prevents log growth from consuming VPS disk/memory. |
| R-17 | 🟡 Medium | Structured logging for easier analysis | Tag all log lines with level (`INFO`/`WARN`/`ERROR`) and include `sessionId` / `targetId` in a consistent structured field. When time comes to audit again, `grep 'ERROR'` gives instant signal instead of scrolling 6k lines. |
| R-18 | 🟡 Medium | Scanner blacklist | hbbr is hit daily by Palo Alto Networks scanners (ASN 394161, IPs `198.235.24.x`, `205.210.31.x`) and other crawlers. Block at nginx/firewall level via `fail2ban` or `iptables` geo/ASN rules. Low effort, reduces noise. |
| R-19 | 🟡 Medium | Container memory limits | Add `deploy.resources.limits.memory` in `docker-compose.yml`: hbbs 256M, hbbr 256M, gateway 128M, nginx 64M. Prevents any single container OOM from destabilising the whole VPS. hbbs tried to allocate 1 GB on a 956 MB VPS (Jun 19) — limit would have triggered a clean restart instead of a freeze. |

---

## Notes for AI Agents

- Before starting any task, re-read `docs/AI_GUIDELINES.md` and `docs/PROTOCOL.md`
- **Read `docs/KNOWN_ISSUES.md` before touching `session.ts`** — it has critical implementation notes
- The most error-prone areas are: encryption (seqnum sync, nonce format), password hashing order, TestDelay echo direction (`from_client: false`), and `video_ack_required: false`
- Keep the gateway stateful per session — each browser connection maps to exactly one relay connection
- **Never commit `.env` files** — use `.env.example` with placeholder values only

