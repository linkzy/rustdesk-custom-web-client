# AI Agent Guidelines — RustDesk Web Client (`rclient`)

> **If you are an AI agent starting fresh on this project, read this file first.**
> Then read the other docs in this folder in the order listed below.

---

## What This Project Is

`rclient` is a self-hosted **web client for RustDesk** — it lets users access remote machines (managed by a self-hosted RustDesk relay server) from any browser, without installing the RustDesk app.

It consists of two components:
1. **`gateway/`** — A Node.js/TypeScript backend that speaks the RustDesk protocol and bridges to the browser
2. **`web/`** — A React/TypeScript frontend that renders video and captures user input

---

## Reading Order for AI Agents

| Order | File | What it covers |
|---|---|---|
| 0 | `AGENTS.md` | Short entry point: what the project is, commands, top protocol pitfalls |
| 0.5 | `docs/README.md` | Index of every document, routed by intent |
| 1 | `docs/AI_GUIDELINES.md` | This file — orientation, conventions, pitfalls |
| 1.5 | `docs/DEVELOPMENT.md` | Local setup without Docker, checks, image builds |
| 1.6 | `docs/DEPLOYMENT.md` | Self-hosting: relay, HTTPS, operating, troubleshooting |
| 2 | `docs/ARCHITECTURE.md` | System design, component relationships, data flow, gateway WS API, limitations |
| 3 | `docs/PROTOCOL.md` | RustDesk protocol details (protobuf, encryption, codec, port map) |
| 4 | `docs/TASKS.md` | Development task list with status — **check this to know what to work on** |
| 5 | `docs/KNOWN_ISSUES.md` | Confirmed bugs with root cause analysis — **read before touching session.ts** |

---

## Project Structure

```
rclient/
├── AGENTS.md           ← short entry point (read this first)
├── docs/               ← AI documentation (you are here)
├── gateway/            ← Node.js backend (RustDesk protocol bridge)
│   ├── src/
│   │   ├── proto/      ← .proto files
│   │   ├── utils/      ← protobuf helpers, key mapping
│   │   ├── rendezvous.ts  ← hbbs WebSocket client
│   │   ├── relay.ts       ← hbbr WebSocket client
│   │   ├── session.ts     ← per-connection session state
│   │   └── server.ts      ← WebSocket server exposed to browser
│   ├── package.json
│   └── tsconfig.json
├── web/                ← React frontend
│   ├── src/
│   │   ├── components/ ← ConnectForm, RemoteScreen, DebugPanel, StatsOverlay
│   │   ├── hooks/      ← useGateway (WebSocket connection)
│   │   ├── utils/      ← passwordStorage (Remember password)
│   │   └── video/      ← WebCodecs video decoder + Opus audio player
│   ├── package.json
│   └── vite.config.ts
├── docker-compose.yml       ← builds from source
├── docker-compose.prod.yml  ← runs the ghcr.io images
├── .env.example
└── README.md
```

---

## Key Design Decisions

### 1. Force Relay
The gateway always uses `force_relay: true` in `PunchHoleRequest`. This avoids NAT traversal complexity. Since the user runs their own relay server, this is acceptable and simpler.

### 2. Codec Preference
The gateway advertises **VP8, VP9, H264 and AV1** in `SupportedDecoding`, preferring H264 (`prefer: 2`). H264 is preferred because it is hardware-decoded in most browsers. The browser-side decoder supports all four (`web/src/video/decoder.ts`).

### 3. Encryption on Gateway
The RustDesk session encryption (XSalsa20-Poly1305, `tweetnacl` secretbox) is handled entirely in the **gateway**. The browser receives plaintext video frames and sends plaintext input. The gateway is the only component that needs to hold encryption keys.

### 4. Gateway WebSocket API
The gateway exposes one HTTP server that answers `GET /config` and upgrades to WebSocket. The browser sends JSON control messages and receives JSON status messages plus binary video/audio frames. See `docs/ARCHITECTURE.md` for the message format.

### 5. No UDP
The gateway connects to `hbbs`/`hbbr` exclusively via WebSocket (ports 21118/21119). No UDP code is needed in the gateway.

### 6. Password handling
The password is only persisted in the browser when the user opts in with "Remember password" (off by default), and only after a successful connection. The gateway hashes it and never stores or logs it. See the Privacy section of `README.md`; the rules are in `web/src/utils/passwordStorage.ts`.

---

## Coding Conventions

- **Language**: TypeScript strict mode everywhere
- **Async**: async/await, no callbacks
- **Error handling**: Always catch and log; never silently swallow errors
- **Logging**: Use `console.log` with `[component]` prefixes (e.g., `[rendezvous]`, `[relay]`, `[session]`)
- **Protobuf**: Use `protobufjs` to load `.proto` files directly at runtime (no codegen step required during development)
- **Encryption**: Use `tweetnacl` (`nacl.box`, `nacl.secretbox`) — do not use any other crypto library for RustDesk message encryption
- **No hardcoded secrets**: All server addresses, keys, and passwords come from environment variables or runtime parameters
- **No secrets in logs or storage**: the password reaches the gateway over the WebSocket, is hashed, and is never logged or written to disk. The browser stores it only behind the "Remember password" opt-in (`web/src/utils/passwordStorage.ts`) — keep it that way.

---

## Environment Variables (gateway)

| Variable | Description | Example |
|---|---|---|
| `HBBS_HOST` | Rendezvous server hostname | `rdserver.example.com` |
| `HBBS_WS_PORT` | hbbs WebSocket port | `21118` |
| `HBBR_HOST` | Relay server hostname | `rdserver.example.com` |
| `HBBR_WS_PORT` | hbbr WebSocket port | `21119` |
| `SERVER_KEY` | RustDesk server public key (base64) | `<from hbbs logs>` |
| `GATEWAY_PORT` | Port gateway listens on for browser WS | `4000` |
| `CAPTCHA_ENABLED` | Require an hCaptcha token before connecting | `false` |
| `HCAPTCHA_SITE_KEY` | hCaptcha site key, exposed via `GET /config` | `<from hcaptcha.com>` |
| `HCAPTCHA_SECRET_KEY` | hCaptcha secret, used in server-side verification | `<from hcaptcha.com>` |

## Project Status

The project works and is deployed by its author. All 22 original development tasks are complete. The client connects to a self-hosted RustDesk relay, decodes H264 video in the browser, plays host audio (Opus) when the browser supports WebCodecs `AudioDecoder`, and forwards keyboard/mouse input.

**Current known bugs** (open) — see `docs/KNOWN_ISSUES.md`:
- KI-003 — performance on a self-hosted relay is comparable to public relays; under investigation
- KI-006 — Common keyboard shortcuts (Ctrl+C, Ctrl+V, etc.) not forwarded to remote machine

KI-004 (scroll direction) and KI-005 (keyboard caps/layout) are fixed in the code — do not re-open them without evidence.

**Deployments:**
- The repository ships `docker-compose.yml` (builds from source) and `docker-compose.prod.yml` (runs the `ghcr.io` images). There is no `docker-compose.infra.yml` or `docker-compose.app.yml` in the repo; a relay stack is set up separately by whoever hosts RustDesk.
- `deploy/` holds the **public demo** stack (separate VPS, separate tunnel, public RustDesk relays by default). Its runbook is `deploy/DEMO.md`; do not confuse it with the owner's production instance.
- Public access in both deployments goes through Cloudflare Tunnel in front of the `web` container. No server addresses or keys are published here — read them from the deployment's own `.env`.

---

When completing a task, verify it by running the relevant unit test or manually tracing the logic. For protocol tasks, log the raw bytes and compare to expected protobuf structure. Do not mark a task done without evidence it works.

---

## Common Pitfalls

1. **WebSocket framing vs TCP framing**: On WebSocket connections to hbbs/hbbr, each WS binary frame = one protobuf message. No 4-byte length prefix. On TCP connections (not used here), there IS a 4-byte big-endian length prefix. Do not mix these up.

2. **Pre-increment seqnum counters (CRITICAL)**: Encryption uses two independent sequence number counters — one for messages sent, one for messages received. Both initialise at 0, but use **pre-increment** (`++seq`). This means the first sent message uses seq=1, the second uses seq=2, etc. Using post-increment (`seq++`) causes every message to decrypt with the wrong nonce. This matches Rust's `self.seq += 1; nonce = get_nonce(self.seq)`.

3. **Nonce format**: 24-byte nonce. First 8 bytes = seqnum as uint64 little-endian. Remaining 16 bytes = zeros.

4. **Password hashing order (CRITICAL)**: `SHA256( SHA256(plaintext_password + salt) + challenge )`. Inner hash = password + salt; outer hash = inner result + challenge. See PROTOCOL.md for correct code. Wrong order → `LoginResponse.error = "Wrong Password"`.

5. **Codec negotiation timing**: `SupportedDecoding` must be included in the **first `LoginRequest`** inside `OptionMessage`. If omitted, the remote may choose an incompatible codec.

6. **Secure handshake direction (CRITICAL)**: The CLIENT generates the symmetric session key and sends it to the peer. The peer does NOT send a key to the client. Flow:
   - Peer → Client: `SignedId` (contains peer's Curve25519 pk in IdPk, after 64-byte Ed25519 sig)
   - Client generates: random `symKey`, ephemeral Curve25519 keypair
   - Client encrypts `symKey` with `nacl.box(symKey, zeroNonce, peerPk, ephemeralSk)`
   - Client → Peer: `PublicKey { asymmetric_value: ephemeral.publicKey, symmetric_value: sealedKey }`
   - No further `PublicKey` message comes from the peer — next peer message is already encrypted.

7. **LoginRequest.username must be the target ID**: Set `username` to the **target machine's RustDesk ID** (e.g. `"54372565"`), not empty string. The peer server checks `username != own_id` and returns `LoginResponse { error: "Offline" }` if it doesn't match.

8. **relay_response vs punch_hole_response**: When `force_relay: true`, newer hbbs versions reply with `relay_response` (not `punch_hole_response`). Handle both. `relay_response` already has the UUID assigned by the server — do not generate a new one.

9. **protobufjs bytes fields**: `Type.decode()` returns bytes as `Uint8Array`. `Type.toObject({ ... })` returns bytes as binary strings — convert with `Buffer.from(str, 'binary')`, **not** `Buffer.from(str, 'base64')`.

10. **protobufjs int64/uint64 re-encoding**: `toObject({ longs: String })` returns int64 fields as JavaScript strings. If you decode a message and re-encode it (e.g. to echo it back), convert the value with `Number(value)` first. Passing a string to `verify()`/`encode()` throws `"integer|Long expected"`, which gets caught by the outer try/catch and silently drops the message.

11. **TestDelay keepalive (CRITICAL — easy to get wrong)**: The peer sends `Message { test_delay: { time, from_client: false } }` every second. You MUST echo it back with `from_client: false` (NOT true). The host checks `if t.from_client` — if true, it treats it as a client-initiated ping and just echoes it back silently. If false, it processes it as a delay measurement response, feeds `VIDEO_QOS.user_network_delay(rtt)`, which ramps up FPS when RTT < 50ms. Sending `from_client: true` means the host never processes RTT → FPS stays at minimum (~2 FPS). Also: echo only when `msg.test_delay.from_client === false` (don't echo echoes). Code:
    ```typescript
    if (!msg.test_delay.from_client) {
      const echoTime = Number(msg.test_delay.time) || 0;
      this.sendMessage({ test_delay: { time: echoTime, from_client: false, last_delay: 0 } });
    }
    ```

12. **`video_ack_required` must be `false`**: Native RustDesk clients always send `video_ack_required: false` in `LoginRequest`. With `false`, the host acks the video frame internally *before* sending it, so the capture loop never blocks → 30 FPS. With `true`, the host waits up to 3 seconds for `Misc { video_received: true }` after each frame → 2 FPS max. Always set `video_ack_required: false`.

13. **`SupportedDecoding` direction**: The CLIENT sends `SupportedDecoding` (what it can decode) inside `LoginRequest.option.supported_decoding`. The HOST sends `SupportedEncoding` (what it can encode) inside `PeerInfo.encoding`. These are opposite directions. Never send `Misc { supported_encoding: ... }` from the client — that field is host→client only.

