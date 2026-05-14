# Development Task List

> **AI agents**: Check this file to know what to work on next.  
> Mark tasks as `[x]` when complete. Work on one task at a time.  
> Dependencies are listed — do not start a task if its dependencies are not done.

---

## Phase 1 — Project Foundation

- [ ] **P1-1** `p1-project-structure` — Set up monorepo structure
  - Create `gateway/` and `web/` packages
  - Init `package.json`, `tsconfig.json`, `.eslintrc` for both
  - Install base dependencies (see ARCHITECTURE.md)
  - _No dependencies_

- [ ] **P1-2** `p1-proto-files` — Download and add protobuf definitions
  - Download `rendezvous.proto` and `message.proto` from rustdesk/hbb_common
  - Place in `gateway/src/proto/`
  - Install `protobufjs` in gateway
  - _Depends on: P1-1_

- [ ] **P1-3** `p1-proto-utils` — Protobuf encode/decode utilities
  - `gateway/src/utils/proto.ts`: helpers to load protos, encode/decode `RendezvousMessage` and `Message`
  - Unit test: encode a `PunchHoleRequest`, decode it back
  - _Depends on: P1-1, P1-2_

---

## Phase 2 — Rendezvous (hbbs)

- [ ] **P2-1** `p2-hbbs-ws` — WebSocket connection to hbbs
  - `gateway/src/rendezvous.ts`: open WS to `hbbs:21118`
  - Handle binary frames, decode `RendezvousMessage`
  - _Depends on: P1-3_

- [ ] **P2-2** `p2-punch-hole` — PunchHoleRequest / PunchHoleResponse
  - Send `PunchHoleRequest{id, force_relay:true}`
  - Parse `PunchHoleResponse` → return `{relayServer, peerPk}`
  - Handle failure cases (peer offline, wrong ID)
  - _Depends on: P2-1_

---

## Phase 3 — Relay (hbbr)

- [ ] **P3-1** `p3-hbbr-ws` — WebSocket connection to hbbr
  - `gateway/src/relay.ts`: open WS to `hbbr:21119`
  - Send `RendezvousMessage{RequestRelay{uuid, id}}`
  - Expose `send(bytes)` / `onMessage` interface
  - _Depends on: P1-3_

- [ ] **P3-2** `p3-relay-pairing` — Relay session pairing
  - Coordinate hbbs (punch hole) + hbbr (request relay) in sequence
  - Wait for peer to join relay, confirm pairing
  - _Depends on: P2-2, P3-1_

---

## Phase 4 — Session Handshake & Encryption

- [ ] **P4-1** `p4-session-handshake` — Auth handshake
  - `gateway/src/session.ts`
  - Receive `Hash{salt, challenge}`, compute password hash
  - Send `LoginRequest` with credentials + `SupportedDecoding`
  - Receive `LoginResponse` → success or error
  - _Depends on: P3-2_

- [ ] **P4-2** `p4-encryption` — XSalsa20 encryption
  - Install `tweetnacl`
  - Receive `PublicKey`, decrypt symmetric session key (Curve25519 + zero nonce)
  - Implement `encryptMessage` / `decryptMessage` with seqnum nonces
  - _Depends on: P4-1_

- [ ] **P4-3** `p4-video-forward` — Video frame relay to browser
  - Decrypt inbound `VideoFrame` messages
  - Extract `EncodedVideoFrame.data` + codec type + keyframe flag
  - Send binary frame to browser WS (2-byte header + raw data)
  - _Depends on: P4-2_

---

## Phase 5 — Input Forwarding

- [ ] **P5-1** `p5-mouse` — Mouse event forwarding
  - Receive JSON `{type:"mouse", x, y, mask, modifiers}` from browser
  - Build `MouseEvent` protobuf, encrypt, send via relay
  - _Depends on: P4-2_

- [ ] **P5-2** `p5-keyboard` — Keyboard event forwarding
  - Receive JSON `{type:"key", down, keyCode, key, modifiers}` from browser
  - Map browser keycodes → RustDesk `ControlKey` enum or `chr`/`unicode`
  - Build `KeyEvent` protobuf, encrypt, send via relay
  - _Depends on: P4-2_

---

## Phase 6 — Browser Frontend

- [ ] **P6-1** `p6-frontend-setup` — React app scaffold
  - `web/` package with React + TypeScript + Vite
  - Basic routing, global styles
  - _No dependencies (can work in parallel with gateway phases)_

- [ ] **P6-2** `p6-ui` — Connection UI
  - `ConnectForm.tsx`: fields for target ID, password, server address
  - Show connection status (idle / connecting / connected / error)
  - _Depends on: P6-1_

- [ ] **P6-3** `p6-ws-connection` — Browser WebSocket to gateway
  - `useGateway.ts` hook: connect, disconnect, send messages, receive frames
  - Handle reconnect logic
  - _Depends on: P6-1_

- [ ] **P6-4** `p6-webcodecs` — WebCodecs VideoDecoder
  - `web/src/video/decoder.ts`
  - Parse binary frame header (codec ID + flags)
  - Init `VideoDecoder` for detected codec
  - Feed `EncodedVideoChunk`, output `VideoFrame`
  - _Depends on: P6-3_

- [ ] **P6-5** `p6-canvas` — Canvas rendering
  - `RemoteScreen.tsx`: `<canvas>` with `drawImage(videoFrame)`
  - Scale to fit container, maintain aspect ratio
  - _Depends on: P6-4_

- [ ] **P6-6** `p6-mouse-input` — Mouse input capture
  - In `RemoteScreen.tsx`: `mousemove`, `mousedown`, `mouseup`, `wheel`
  - Scale coordinates to remote resolution
  - Send via `useGateway`
  - _Depends on: P6-5_

- [ ] **P6-7** `p6-keyboard-input` — Keyboard input capture
  - `keydown`/`keyup` with `preventDefault` where appropriate
  - Map to gateway JSON format
  - _Depends on: P6-5_

---

## Phase 7 — Deployment

- [x] **P7-1** `p7-gateway-docker` — Dockerize gateway
  - `gateway/Dockerfile` (multi-stage: build → runtime alpine)
  - Expose port 4000
  - _Depends on: P4-3, P5-1, P5-2_

- [x] **P7-2** `p7-frontend-docker` — Dockerize frontend
  - `web/Dockerfile` (Vite build → nginx:alpine)
  - nginx config: serve static files, proxy `/ws` to gateway
  - _Depends on: P6-6, P6-7, P6-2_

- [x] **P7-3** `p7-compose` — docker-compose
  - `docker-compose.yml` with `gateway` + `web` services
  - `.env.example` with all required environment variables
  - _Depends on: P7-1, P7-2_

---

## Progress Summary

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

## Known Issues (Not Yet Fixed)

See `docs/KNOWN_ISSUES.md` for full details.

| ID | Summary | Priority |
|---|---|---|
| KI-001 | Session drops after ~10s — `TestDelay` keepalive not echoed back | **High** |
| KI-002 | Input testing requires a second device | Low |
| KI-003 | Performance not better than public servers yet | Medium |

---

## Notes for AI Agents

- Before starting any task, re-read `docs/AI_GUIDELINES.md` and `docs/PROTOCOL.md`
- **Read `docs/KNOWN_ISSUES.md` before touching `session.ts`** — it has critical implementation notes
- The most error-prone areas are: encryption (seqnum sync, nonce format), password hashing order, and WebSocket vs TCP framing
- Test each phase before moving to the next
- Keep the gateway stateful per session — each browser connection maps to exactly one relay connection
- **Never commit `.env` files** — use `.env.example` with placeholder values only
