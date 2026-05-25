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

## Roadmap (Not Yet Started)

| ID | Priority | Feature | Notes |
|---|---|---|---|
| R-03 | 🔴 High | User-configurable server (Advanced Options) | Collapsible "Advanced" section in login form; fields for hbbs host, hbbr host, and server public key — override the gateway `.env` defaults. If left blank, gateway uses its own `.env`. Enables any user to point the deployed client at their own relay server. |
| R-04 | 🔴 High | CAPTCHA on connect | `.env` flag `CAPTCHA_ENABLED=false` (default). When enabled, add hCaptcha (free tier) to the login form before allowing a connection attempt. Prevents relay brute-force by public users. Gateway must verify the CAPTCHA token server-side before forwarding the connect request. |
| R-05 | 🔴 High | Full screen mode | Button in toolbar to enter browser Fullscreen API (`element.requestFullscreen()`). Canvas should fill the entire screen. Exit on Escape or button press. |
| R-06 | 🔴 High | Canvas scaling / fit-to-window | Toggle in toolbar: "Fit" mode stretches the canvas to fill available viewport (CSS `object-fit: contain`), vs "1:1" mode shows the remote at native resolution with scrollbars. Important when host resolution doesn't match client viewport. |
| R-07 | 🟡 Medium | Saved connections | Store multiple named connections in localStorage (ID + password + optional label). Dropdown or list on the login screen to quickly pick a saved connection. |
| R-08 | 🟡 Medium | Session auto-reconnect | Detect WebSocket drop and automatically retry connection (with exponential backoff) without user needing to re-enter credentials. |
| R-09 | 🟡 Medium | Audio streaming | Receive `AudioFrame` messages from host, decode and play via Web Audio API. |
| R-10 | 🟡 Medium | Clipboard sync | Send/receive `Clipboard` messages so text can be pasted into the remote session and copied back. |
| R-11 | 🟢 Low | Further FPS improvement | Currently 3–16 FPS; investigate reaching native app's 30 FPS consistently. |
| R-12 | 🟢 Low | Multi-monitor support | Handle `SwitchDisplay` and `CaptureDisplays` messages; add monitor selector in toolbar. |
| R-13 | 🟢 Low | Mobile touch input | Map touch events to mouse events for phone/tablet use. |
| R-14 | 🟢 Low | File transfer | Implement `FileAction`/`FileResponse` protocol messages. |

---

## Notes for AI Agents

- Before starting any task, re-read `docs/AI_GUIDELINES.md` and `docs/PROTOCOL.md`
- **Read `docs/KNOWN_ISSUES.md` before touching `session.ts`** — it has critical implementation notes
- The most error-prone areas are: encryption (seqnum sync, nonce format), password hashing order, TestDelay echo direction (`from_client: false`), and `video_ack_required: false`
- Keep the gateway stateful per session — each browser connection maps to exactly one relay connection
- **Never commit `.env` files** — use `.env.example` with placeholder values only

