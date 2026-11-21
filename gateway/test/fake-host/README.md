# Fake RustDesk host

A stand-in for a RustDesk **host** and its **relay pair** (`hbbs` + `hbbr`), in one Node process, so the gateway and the web client can be exercised end to end without a real machine, a real relay, or a network.

It is a **test tool**. The gateway never imports it, it is not in the production image, it adds no runtime dependency, and it only listens on `127.0.0.1`.

```
npm run fake-host                     # id 123456789, password "demo"
npm run fake-host -- --audio          # also send Opus (silence) frames
npm run fake-host -- --help           # every option
```

Expected output:

```
Fake host ready: id=123456789 password="demo"
  hbbs  ws://127.0.0.1:21118
  hbbr  ws://127.0.0.1:21119
  state http://127.0.0.1:8081/fake/state
  events http://127.0.0.1:8081/fake/events
  screen 640x360 @ 30 fps VP9
```

## Pointing the gateway at it

```bash
cd gateway
HBBS_HOST=127.0.0.1 HBBS_WS_PORT=21118 \
HBBR_HOST=127.0.0.1 HBBR_WS_PORT=21119 \
npm run dev

cd web && npm run dev          # then connect to 123456789 / demo
```

The same values can be typed into the connect form's **Advanced options**, which is how you test a browser against a gateway you do not control.

## What it implements

| Stage | What the fake does |
|---|---|
| `hbbs` (rendezvous) | Answers `PunchHoleRequest` with `relay_response { uuid, relay_server, pk }`, the message a current RustDesk server sends for `force_relay: true`. Answers an unknown ID with `punch_hole_response { failure: OFFLINE }`, like a real hbbs. |
| `hbbr` (relay) | Pairs two WebSocket clients by the UUID in their `RequestRelay`, then forwards the bytes between them untouched — after the handshake those bytes are NaCl-secretbox encrypted and the relay cannot read them, exactly like the real thing. |
| `SignedId` | 64 signature bytes + `IdPk { id, pk }`, carrying a **fixed** Curve25519 public key. |
| `PublicKey` | Opens the client's sealed session key with the host's private key (zero nonce, `nacl.box.open`). |
| `Hash` | Encrypted `Hash { salt, challenge }` with **fixed** values, sent the moment the session key is accepted. |
| `LoginRequest` | Verifies `username == id` and recomputes `SHA256(SHA256(password+salt)+challenge)` with the real `hashPassword` from `gateway/src/utils/crypto.ts`. Mismatch → encrypted `LoginResponse { error }`. |
| `LoginResponse` | `peer_info` with one 640×360 display, so the gateway reports a real resolution to the browser. |
| `TestDelay` | Every second, `from_client: false`. The gateway echoes it and derives its delay/FPS target from it. Echoes the gateway sends back are counted for `/fake/state`. |
| `VideoFrame` | Replays a **deterministic** VP9 clip (see below) at a fixed 30 fps, with the real `key` flag read out of the bitstream. |
| `AudioFrame` | Optional (`--audio`): a 3-byte Opus comfort-noise packet every 20 ms, plus the `AudioFormat` misc message. |
| `MouseEvent` / `KeyEvent` | Decoded and recorded; exposed over the control API. |

Everything is symmetric with the gateway's own code: protobuf encoding/decoding comes from `gateway/src/utils/proto.ts`, the password hash from `gateway/src/utils/crypto.ts`, and the `.proto` files are the ones the gateway ships.

### The deterministic screen

`assets/screen.ivf` is a 10-second, 640×360, 30 fps VP9 clip generated once with ffmpeg and committed. Every visual element is a function of the frame index — a cyan box that steps across the screen, an orange bar, a green sweep line, a yellow block, and a grey border on a flat background. No clock, no font rendering, no noise.

Two runs therefore produce the same frames, which is what makes a screenshot comparison meaningful. To regenerate it:

```bash
ffmpeg -f lavfi -i "color=c=0x101820:s=640x360:r=30:d=10" \
  -vf "drawbox=x='mod(floor(t*90)\,560)':y=140:w=64:h=64:color=0x00d0ff:t=fill,\
drawbox=x=20:y=20:w=140:h=36:color=0xff6a00:t=fill,\
drawbox=x=0:y='mod(floor(t*30)\,356)':w=640:h=4:color=0x30ff90:t=fill,\
drawbox=x=560:y=300:w=60:h=40:color=0xffe14d:t=fill,\
drawbox=x=4:y=4:w=632:h=352:color=0x8899aa:t=2" \
  -c:v libvpx-vp9 -b:v 250k -g 30 -lag-in-frames 0 -pix_fmt yuv420p -f ivf \
  gateway/test/fake-host/assets/screen.ivf
```

ffmpeg is **not** needed to run the fake host — only to rebuild the clip.

The IVF reader and the VP9 keyframe detector live in `ivf.ts` and are unit-tested against this clip (`ivf.test.ts`).

## Control API (localhost only)

| Endpoint | Purpose |
|---|---|
| `GET /fake/health` | `{ ok: true }` |
| `GET /fake/state` | `{ id, session, startedAt }`; `session` has `state`, `passwordAccepted`, `framesSent`, `audioFramesSent`, `testDelayEchoes`, `lastDelayMs`, `peerInfoSent`, `codec`. |
| `GET /fake/events` | `{ count, events }` for the last N input events, oldest first. `?type=mouse\|key`, `?limit=n`. |
| `POST /fake/events` | Clears the buffer. |

Each event looks like:

```json
{ "seq": 1, "at": 1730000000000, "type": "mouse",
  "detail": { "mask": 1, "x": 100, "y": 100, "modifiers": [] } }
{ "seq": 2, "at": 1730000000001, "type": "key",
  "detail": { "down": true, "mode": 0, "modifiers": [], "unicode": 97 } }
```

That is what makes an assertion like *"clicking at (100,100) reached the host"* possible.

## What it deliberately does not do

- **No NAT, no hole punching.** Every session is relayed, which is what `force_relay: true` asks for anyway.
- **No multi-monitor.** One display, `display = 0`.
- **No clipboard, no file transfer, no audio input, no terminal.**
- **No signature verification.** The 64 signature bytes in `SignedId` are fixed filler; the client only parses the `IdPk` that follows. A real host signs with an Ed25519 key.
- **No auth beyond the password hash** — no 2FA, no trusted devices, no `sas_enabled`.
- **No keyframe on demand.** `misc.refresh_video` is logged, not acted on; the looping clip already starts with a keyframe every 30 frames.
- **No password retry limits.**
- It does not listen on any interface other than `127.0.0.1`.

## Tests

```bash
cd gateway
npm test                        # unit + integration (the fake's tests run here)
npx vitest run test/fake-host   # just this directory
```

- `ivf.test.ts` — container parsing and VP9 keyframe detection against the shipped clip.
- `servers.test.ts` — hbbs replies, hbbr pairing, byte forwarding, UUID isolation, both arrival orders.
- `session.test.ts` — the full handshake over real sockets with real encryption: `SignedId → PublicKey → Hash → LoginRequest → LoginResponse`, frame streaming, TestDelay echoes, wrong-password rejection, input recording, control API.

Two manual scripts prove it against the real software:

```bash
# terminal 1: npm run fake-host
# terminal 2: gateway dev with HBBS_HOST/HBBR_HOST as above
# terminal 3: gateway dev (web)

node gateway/test/fake-host/smoke.mjs                       # protocol-level
node gateway/test/fake-host/browser-check.mjs shot.png     # real Chrome, screenshot
```

`browser-check.mjs` drives Chrome over the DevTools protocol (no Playwright), fills the real connect form, and fails unless the canvas has painted more than three distinct colours.
