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
- Accepts one WebSocket connection per browser session
- Parses incoming JSON control messages from browser
- Dispatches to Session Manager
- Forwards binary video frames to browser

### `gateway/src/rendezvous.ts` — Rendezvous Client
- Opens WebSocket to `hbbs:21118`
- Sends `PunchHoleRequest{id, force_relay: true}`
- Returns `{relayServer, peerPublicKey}` to caller
- One instance per connection attempt (not long-lived)

### `gateway/src/relay.ts` — Relay Client
- Opens WebSocket to `hbbr:21119`
- Sends `RequestRelay{uuid}` to pair with remote peer
- Exposes `send(bytes)` and `onMessage(handler)` interface
- Stays open for the duration of the session

### `gateway/src/session.ts` — Session State
- Holds encryption key and seqnum counters
- Performs auth handshake (Hash → LoginRequest → LoginResponse)
- Decrypts inbound `VideoFrame` messages → sends to browser
- Encrypts outbound `MouseEvent`/`KeyEvent` messages → sends via relay

### `web/src/hooks/useGateway.ts` — Browser WS Client
- Manages WebSocket lifecycle (connect/disconnect/reconnect)
- Sends `{type:"connect", targetId, password, serverKey}`
- Receives binary video frames → passes to VideoDecoder
- Sends `{type:"mouse"|"key", ...}` input events

### `web/src/video/decoder.ts` — WebCodecs VideoDecoder
- Initializes `VideoDecoder` for H264 or VP9
- Receives binary chunks (1-byte header + frame data)
- Produces `VideoFrame` objects for canvas rendering

### `web/src/components/RemoteScreen.tsx` — Canvas Display
- Renders `VideoFrame` objects via `drawImage` on `<canvas>`
- Captures and forwards mouse/keyboard events

---

## Gateway WebSocket API (Browser ↔ Gateway)

### Browser → Gateway (JSON)

```jsonc
// Initiate connection to a remote peer
{
  "type": "connect",
  "targetId": "123456789",        // RustDesk peer ID
  "password": "mypassword",       // RustDesk connection password
  "serverKey": "base64key=="      // Your hbbs server public key
}

// Mouse event
{
  "type": "mouse",
  "x": 512,                       // absolute x (remote resolution)
  "y": 300,                       // absolute y
  "mask": 1,                      // button mask (see RustDesk MouseEvent)
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
{ "type": "connected",  "width": 1920, "height": 1080, "codec": "h264" }
{ "type": "error",      "message": "Wrong password" }
{ "type": "disconnected" }

// Video frame (binary frame)
// Byte 0:    codec  (0x01 = H264, 0x02 = VP9, 0x03 = VP8, 0x04 = AV1)
// Byte 1:    flags  (bit 0 = keyframe)
// Bytes 2+:  raw encoded frame bitstream (H264 Annex B / VP9 raw)
```

---

## Connection Lifecycle

```
Browser          Gateway          hbbs (21118)        hbbr (21119)        Remote Peer
   │                │                  │                   │                   │
   │──{connect}────►│                  │                   │                   │
   │                │──PunchHoleReq───►│                   │                   │
   │                │◄─PunchHoleResp───│ (relay_server,pk) │                   │
   │                │                  │                   │                   │
   │                │──RequestRelay(uuid)─────────────────►│                   │
   │                │                  │                   │──RequestRelay────►│
   │                │                  │                   │◄─────────────────│
   │                │                  │                   │  (pair established)
   │                │◄──Hash{salt,challenge}────────────────────────────────── │
   │                │──LoginRequest{credentials,codecs}─────────────────────── │
   │                │◄──LoginResponse{peer_info}──────────────────────────────│
   │                │◄──PublicKey{curve25519_pk, enc_symmetric_key}───────────│
   │                │  [decrypt symmetric key, begin encrypted session]        │
   │◄─{connected}──│                  │                   │                   │
   │                │◄══VideoFrame═══════════════════════════════════════════ │
   │◄══binary════─│                  │                   │                   │
   │──{mouse}──────►│══MouseEvent════════════════════════════════════════════►│
   │──{key}────────►│══KeyEvent══════════════════════════════════════════════►│
```

---

## Deployment

```
docker-compose up
```

Services:
- `gateway` — Node.js container, port 4000 (internal only)
- `web` — nginx container, port 80/443 (public), proxies `/ws` to gateway

Recommended: Put nginx reverse proxy with TLS (Let's Encrypt) in front of the `web` service.

---

## Security Notes

1. **Never expose the gateway port (4000) publicly** — only the `web` nginx container should be public
2. **Use TLS** in production — the nginx container handles this
3. **Passwords are hashed** in the gateway before sending to the remote peer — the gateway never stores plaintext passwords
4. **The browser never sees RustDesk encryption keys** — all crypto happens in the gateway
5. **Consider adding gateway-level authentication** (e.g., a simple bearer token) if the gateway is exposed to the internet, to prevent unauthorized use of your relay server
