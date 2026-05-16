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

## Known Issues (Open)

See `docs/KNOWN_ISSUES.md` for full root cause analysis.

| ID | Summary | Priority |
|---|---|---|
| KI-004 | Mouse scroll wheel direction inverted | Low |
| KI-005 | Keyboard layout / Caps Lock mismatch — wrong characters sent to host | Medium |

---

## Roadmap (Not Yet Started)

| ID | Feature | Notes |
|---|---|---|
| R-01 | Fix KI-005 — keyboard layout/caps mismatch | Audit key event translation in `RemoteScreen.tsx` + gateway |
| R-02 | Fix KI-004 — scroll wheel inverted | One-line fix in `RemoteScreen.tsx` |
| R-03 | Browser-level authentication | Login page protecting the rclient UI from unauthorized use |
| R-04 | Audio streaming | Receive `AudioFrame` messages, decode and play via Web Audio API |
| R-05 | Clipboard sync | Send/receive `Clipboard` messages for paste-into-remote support |
| R-06 | Multi-monitor | Handle `SwitchDisplay` and `CaptureDisplays` messages |
| R-07 | Mobile touch input | Map touch events to mouse events for phone/tablet use |
| R-08 | File transfer | Implement `FileAction`/`FileResponse` protocol messages |
| R-09 | Further FPS improvement | Currently 3–16 FPS; investigate reaching native app's 30 FPS |
| R-10 | Session reconnect | Auto-reconnect after network drop without re-entering credentials |

---

## Notes for AI Agents

- Before starting any task, re-read `docs/AI_GUIDELINES.md` and `docs/PROTOCOL.md`
- **Read `docs/KNOWN_ISSUES.md` before touching `session.ts`** — it has critical implementation notes
- The most error-prone areas are: encryption (seqnum sync, nonce format), password hashing order, TestDelay echo direction (`from_client: false`), and `video_ack_required: false`
- Keep the gateway stateful per session — each browser connection maps to exactly one relay connection
- **Never commit `.env` files** — use `.env.example` with placeholder values only

