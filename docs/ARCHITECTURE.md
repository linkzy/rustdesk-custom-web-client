# Architecture — RustDesk Web Client (`rclient`)

---

## Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│  Browser (any device)                                               │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  React App                                                   │  │
│  │  ┌─────────────┐  ┌───────────────┐  ┌──────────────────┐  │  │
│  │  │ ConnectForm │  │ RemoteScreen  │  │  Input capture   │  │  │
│  │  │             │  │  <canvas>     │  │  mouse/keyboard  │  │  │
│  │  └──────┬──────┘  └───────┬───────┘  └────────┬─────────┘  │  │
│  │         │                 │                    │            │  │
│  │         └─────────────────┼────────────────────┘            │  │
│  │                           │ WebSocket (ws://gateway:4000)   │  │
│  └───────────────────────────┼─────────────────────────────────┘  │
└──────────────────────────────┼──────────────────────────────────────┘
                               │
                ┌──────────────▼──────────────┐
                │   Gateway Service           │
                │   (Node.js / TypeScript)    │
                │                             │
                │  ┌────────────────────────┐ │
                │  │  Browser WS Server     │ │  ← port 4000
                │  │  (server.ts)           │ │
                │  └──────────┬─────────────┘ │
                │             │               │
                │  ┌──────────▼─────────────┐ │
                │  │  Session Manager        │ │
                │  │  (session.ts)           │ │
                │  │  - encryption state     │ │
                │  │  - seqnum counters      │ │
                │  │  - peer public key      │ │
                │  └──────┬──────────┬───────┘ │
                │         │          │         │
                │  ┌──────▼──┐  ┌────▼──────┐  │
                │  │Rendezvous│  │  Relay   │  │
                │  │(hbbs WS) │  │(hbbr WS) │  │
                │  │port 21118│  │port 21119│  │
                │  └──────────┘  └──────────┘  │
                └─────────────────────────────┘
                               │
                ┌──────────────▼──────────────┐
                │   VPS — Self-hosted RustDesk │
                │   hbbs (rendezvous) :21118   │
                │   hbbr (relay)      :21119   │
                └──────────────┬───────────────┘
                               │  relay tunnel
                ┌──────────────▼──────────────┐
                │   Remote Machine (Windows/  │
                │   Linux) running RustDesk   │
                └─────────────────────────────┘
```

---

## Component Responsibilities

### `gateway/src/server.ts` — Browser WebSocket Server
- Listens on `GATEWAY_PORT` (default 4000)
- Serves `GET /config` (captcha settings) and the WebSocket upgrade on the same HTTP server
- Accepts one WebSocket connection per browser session
- Parses incoming JSON control messages from browser (`ping`, `connect`, `mouse`, `key`, `disconnect`)
- Verifies the hCaptcha token when `CAPTCHA_ENABLED=true`
- Dispatches to Session Manager
- Forwards binary video and audio frames to browser

### `gateway/src/rendezvous.ts` — Rendezvous Client
- Opens WebSocket to `hbbs:21118`
- Sends `PunchHoleRequest{id, force_relay: true}`
- Returns `{relayServer, peerPk, uuid}` to caller
- One instance per connection attempt (not long-lived)

### `gateway/src/utils/keymap.ts` — Browser → RustDesk Key Translation
- Maps browser keys to `ControlKey` values, or to `unicode` (printable characters) / `chr` (Ctrl+Alt shortcuts)
- Skipped keys (no payload): non-printable keys and unicode keyups

### `gateway/src/relay.ts` — Relay Client
- Opens WebSocket to `hbbr:21119`
- Sends `RequestRelay{uuid}` to pair with remote peer
- Exposes `send(bytes)` and `onMessage(handler)` interface
- Stays open for the duration of the session

### `gateway/src/session.ts` — Session State
- Holds encryption key and seqnum counters
- Performs auth handshake (Hash → LoginRequest → LoginResponse)
- Decrypts inbound `VideoFrame` messages → sends to browser
- Forwards `AudioFrame` (Opus) and `Misc.audio_format` → browser
- Echoes `TestDelay` back with `from_client: false`
- Encrypts outbound `MouseEvent`/`KeyEvent` messages → sends via relay

### `web/src/hooks/useGateway.ts` — Browser WS Client
- Manages WebSocket lifecycle (connect, send, close; no automatic reconnect)
- Sends `{type:"connect", targetId, password, serverConfig, captchaToken}`
- Receives binary video/audio frames → routes marker `5` to the audio player, the rest to VideoDecoder
- Sends `{type:"mouse"|"key", ...}` input events and `{type:"ping", ts}` every 3 s

### `web/src/video/decoder.ts` — WebCodecs VideoDecoder
- Initializes `VideoDecoder` for H264, VP9, VP8 or AV1 based on the marker byte
- Receives binary chunks (2-byte header + frame data)
- Produces `VideoFrame` objects for canvas rendering, plus FPS/decode-time stats

### `web/src/video/audio.ts` — Opus Audio Player
- Only active when the browser has `AudioDecoder` and `AudioContext`
- Configures `AudioDecoder` with the `sampleRate`/`channels` the host announced (`Misc.audio_format`)
- Schedules decoded buffers on the Web Audio clock (80 ms lookahead)

### `web/src/components/RemoteScreen.tsx` — Canvas Display
- Renders `VideoFrame` objects via `drawImage` on `<canvas>`
- Captures and forwards mouse/keyboard events

### `web/src/utils/passwordStorage.ts` — Password Persistence
- Keeps the password of the in-flight attempt in memory only
- Writes it to `localStorage` only after a successful connection **and** only when `rclient_remember_password` is `'true'` (the "Remember password" checkbox, off by default)
- Unticking the box deletes `rclient_password` immediately; a failed attempt persists nothing

---

## Gateway WebSocket API (Browser ↔ Gateway)

The gateway (`gateway/src/server.ts`) runs **one HTTP server** that answers a
single REST endpoint and upgrades the same listener to WebSocket:

| Route | Method | What it returns |
|---|---|---|
| `/config` | `GET` | `{ "captchaEnabled": boolean, "hcaptchaSiteKey": string }` — the site key is only filled in when captcha is enabled |
| other HTTP paths | any | `404` |
| WebSocket upgrade | upgrade | the session socket. `new WebSocketServer({ server: httpServer })` accepts an upgrade on any path; in practice clients use `/ws`, because nginx only proxies `/ws` (`web/nginx.conf`) and `useGateway.ts` opens `/ws`. |

`/config` sends `Access-Control-Allow-Origin: *` so it can also be read directly
from a dev origin.

### Browser → Gateway (JSON)

```jsonc
// Initiate connection to a remote peer
{
  "type": "connect",
  "targetId": "123456789",        // RustDesk peer ID
  "password": "mypassword",       // RustDesk connection password
  "serverConfig": {               // optional Advanced options overrides
    "hbbsHost": "myserver.com:21118",
    "hbbrHost": "myserver.com:21119",
    "serverKey": "base64key=="
  },
  "captchaToken": "..."           // required when CAPTCHA_ENABLED=true on the gateway
}

// Keepalive (answered with {type:"pong", ts})
{ "type": "ping", "ts": 1234.5 }

// Mouse event
{
  "type": "mouse",
  "x": 512,                       // absolute x (remote resolution)
  "y": 300,                       // absolute y
  "mask": 9,                      // (button << 3) | type; type: 0=move 1=down 2=up 3=wheel
  "modifiers": ["ctrl"]           // optional: "ctrl", "alt", "shift", "meta"
}

// Keyboard event
{
  "type": "key",
  "down": true,                   // true = keydown, false = keyup
  "keyCode": 65,                  // browser KeyboardEvent.keyCode
  "key": "a",                     // browser KeyboardEvent.key
  "modifiers": []
}

// Disconnect
{ "type": "disconnect" }
```

### Gateway → Browser (Mixed)

```jsonc
// Status messages (JSON text frames)
{ "type": "connected",     "width": 1920, "height": 1080, "codec": "h264" }
{ "type": "error",         "message": "Wrong password" }
{ "type": "disconnected" }
{ "type": "pong",          "ts": 1234.5 }          // echo of the browser's ping
{ "type": "gw_stats",      "gwFps": 24.5 }         // once per second, from the gateway
{ "type": "audio_format",  "sampleRate": 48000, "channels": 2 }
{ "type": "log",           "message": "..." }      // human-readable debug log

// Binary frame
// Byte 0:    codec  (0x01 = H264, 0x02 = VP9, 0x03 = VP8, 0x04 = AV1, 0x05 = Opus audio)
// Byte 1:    flags  (bit 0 = keyframe; always 0 for audio)
// Bytes 2+:  raw payload (H264 Annex B / VP9 raw / raw Opus packet)
```

`useGateway.ts` routes every binary frame: marker `5` goes to the Opus player,
the rest to the video decoder, which configures itself from the marker byte
(`web/src/video/decoder.ts`).

### Captcha flow (R-04)

Captcha is off unless the gateway sets `CAPTCHA_ENABLED=true`.

```
Browser                          Gateway (server.ts)             hCaptcha API
   │  GET /config                    │
   │────────────────────────────────►│  { captchaEnabled, hcaptchaSiteKey }
   │◄────────────────────────────────│
   │  (if enabled: load api.js, render widget, get token)
   │  {type:"connect", captchaToken} │
   │────────────────────────────────►│──POST /siteverify (secret, token)──►│
   │                                 │◄────────────── { success } ─────────│
   │◄── {type:"error"} or proceed ───│
```

- `GET /config` returns the site key only when captcha is enabled
  (`server.ts`), so the form knows whether to render the widget.
- `ConnectForm` loads `https://js.hcaptcha.com/1/api.js?render=explicit`,
  renders the widget into `#hcaptcha-widget`, and stores the token.
- On `connect` with captcha enabled, the gateway rejects a missing token
  (`CAPTCHA required`) or a token hCaptcha does not verify
  (`CAPTCHA verification failed`) before any rendezvous happens.
- After a failed/disconnected attempt the form resets the widget
  (`hcaptcha.reset()`), so every attempt needs a fresh token.

### Per-connection server overrides (R-03)

`ConnectForm`'s **Advanced options** sends the overrides inside `serverConfig`;
nothing is applied to the gateway process, they are per session:

| Field | Used by |
|---|---|
| `hbbsHost` | `performRendezvous` — `host:port` or `host`; port falls back to `HBBS_WS_PORT` |
| `hbbrHost` | `connectRelay` — `host:port` or `host`; port falls back to `HBBR_WS_PORT`, host falls back to `HBBR_HOST`, then to the relay address hbbs returned |
| `serverKey` | `performRendezvous` — sent as `licence_key` in `PunchHoleRequest` |

Empty fields are omitted on the browser side and the gateway falls back to its
`.env`. The values are kept in `localStorage` (`rclient_hbbs_host`,
`rclient_hbbr_host`, `rclient_server_key`).

---

## Known limitations

Current, code-level limits — not plans (the roadmap is in `TASKS.md`):

| Limitation | Reality in the code |
|---|---|
| **Audio needs WebCodecs `AudioDecoder`** | `web/src/video/audio.ts` checks `AudioDecoder`/`AudioContext` at load and silently skips audio when they are missing. Video and input keep working; the packet is simply dropped. |
| **Single monitor** | `session.ts → handlePeerInfo` reads `displays[0]` only. No display switcher exists (`SwitchDisplay` is defined in the proto but unused). |
| **No file transfer** | `FileAction`/`FileResponse` are in the proto; neither gateway nor UI handles them. |
| **No clipboard** | `Clipboard`/`Cliprdr` are in the proto; no handler on either side (R-10). |
| **Ctrl+C / Ctrl+V not forwarded** | Open bug — KI-006. Some shortcuts never reach the page, and copy/paste needs the clipboard channel that does not exist yet. |
| **One session per browser socket** | `server.ts` keeps a single `session` variable; a new `connect` disconnects the previous session. One WebSocket = one remote machine. |
| **One gateway process, single-threaded** | All sessions share one Node.js event loop; there is no worker pool or horizontal sharding. |
| **No automatic reconnect** | `useGateway.ts` closes and reports `disconnected`; reconnecting is the user clicking Connect again (R-08). |
| **Force relay only** | `force_relay: true` in `rendezvous.ts`. Direct P2P is not attempted, so the relay is always in the path and its latency is always yours. |
| **Codec reported is fixed** | The `connected` message says `codec: "h264"` regardless of what the host chose; the decoder still adapts to the actual marker byte. |
| **Mobile keyboard input** | Mouse/touch works on Android; there is no on-screen keyboard or device-keyboard forwarding (R-13b). |
| **Rendezvous retries then gives up** | An OFFLINE peer is retried 3 times, 2 s apart, then the connect fails. |

---

## Connection Lifecycle

```
Browser          Gateway          hbbs (21118)        hbbr (21119)        Remote Peer
   │                │                  │                   │                   │
   │──{connect}────►│                  │                   │                   │
   │                │──PunchHoleReq───►│                   │                   │
   │                │◄─PunchHoleResp───│ (relay_server,pk) │                   │
   │                │  (or relay_response with a server-assigned uuid)          │
   │                │──RequestRelay(uuid)─────────────────►│                   │
   │                │                  │                   │──RequestRelay────►│
   │                │                  │                   │◄─────────────────│
   │                │                  │                   │  (pair established)
   │                │◄──SignedId{id}────────────────────────────────────────── │
   │                │──PublicKey{ephemeral_pk, sealed_session_key}────────────►│
   │                │◄──Hash{salt,challenge}─── (encrypted from here on) ────── │
   │                │──LoginRequest{hash,codecs,options}──────────────────────►│
   │                │◄──LoginResponse{peer_info}──────────────────────────────│
   │◄─{connected}──│                  │                   │                   │
   │◄══VideoFrame═══════════════════════════════════════════════════════════════ │
   │◄══AudioFrame═══════════════════════════════════════════════════════════════ │
   │◄══binary══════─│                  │                   │                   │
   │──{mouse}──────►│══MouseEvent════════════════════════════════════════════►│
   │──{key}────────►│══KeyEvent══════════════════════════════════════════════►│
```

---

## Deployment

The repository ships two compose files, both running the same two services:

| File | Use |
|---|---|
| `docker-compose.yml` | Builds `gateway/` and `web/` locally — development or a self-built deployment |
| `docker-compose.prod.yml` | Runs the pre-built `ghcr.io/linkzy/rclient-gateway:latest` and `ghcr.io/linkzy/rclient-web:latest` images — deploying without a build |

```bash
# From source
docker compose -f docker-compose.yml up -d

# Pre-built images
docker compose -f docker-compose.prod.yml up -d
```

Services (identical in both files):
- `gateway` — Node.js container, port 4000 on the internal `rclient` network (`expose:`, never published)
- `web` — nginx container, published on `${WEB_PORT:-80}`; proxies `/ws` and `/config` to the gateway

A RustDesk relay (`hbbs`/`hbbr`) is **not** part of this repository. Run it separately (its own compose file and data volume) and point `HBBS_HOST`/`HBBR_HOST`/`SERVER_KEY` at it.

**Public access in the author's deployment** goes through a Cloudflare Tunnel (no open ports); the tunnel forwards to the `web` container. Any HTTPS reverse proxy (nginx, Caddy, Traefik) works the same way — see the README's Step 4. Deployment hosts, addresses and keys are not published in this documentation; they live in the deployment's own `.env`.

**CI/CD:** GitHub Actions (`.github/workflows/docker-build.yml`) builds `linux/amd64` + `linux/arm64` images on every push to `main` and on manual dispatch, and pushes `ghcr.io/<owner>/rclient-gateway:latest` and `ghcr.io/<owner>/rclient-web:latest` (plus a per-commit tag).

**To deploy a new version:**
```bash
# on the server, in the directory holding the compose file and .env
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

### There are two live instances

| Instance | What it is |
|---|---|
| `rclient.linkzy.dev` | The owner's private production instance, on its own VPS with its own relay. Not a public demo. |
| `rclient-demo.linkzy.dev` | A **public demo** on a separate VPS, so visitors never reach the owner's relay (rule PROJ-003). It defaults to **RustDesk's public servers** (`rs-ny.rustdesk.com`, ports 21118/21119), so anyone can try it with just a machine ID and password; visitors can still point it at their own relay under Advanced options. |

The demo is deployed from `deploy/` (`docker-compose.demo.yml`,
`demo.env.example`, `cloudflared/`) with its own compose project, network, tunnel
and `.env`. Full runbook, host details, stability limits and the one operational
caveat live in [`../deploy/DEMO.md`](../deploy/DEMO.md) — it is not repeated here.

The caveat worth knowing as a developer: the gateway always sets
`force_relay: true`, so a session cannot fall back to a direct connection. When
the demo deployed, RustDesk's ID port (21118) answered but its relay ports
(21117/21119) appeared unreachable from several vantage points. If a demo session
connects and then waits for an image, check the relay path first. The demo's
`.env` can point at a working relay without code changes.

---

## Security Notes

1. **Never expose the gateway port (4000) publicly** — only the `web` nginx container should be public. Both compose files use `expose`, not `ports`, for the gateway.
2. **Use TLS** in production — WebCodecs requires a secure context, and TLS protects the connection password in transit.
3. **Passwords are hashed** in the gateway before being sent to the remote peer (`SHA256(SHA256(password + salt) + challenge)`); the gateway never writes the password to disk and does not log it.
4. **The browser never sees RustDesk encryption keys** — all crypto happens in the gateway.
5. **The browser may store the password** — only when the user ticks "Remember password", and only after a successful connect; see `web/src/utils/passwordStorage.ts` and the README's Privacy section.
