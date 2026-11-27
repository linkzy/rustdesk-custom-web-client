# RustDesk Protocol Reference

> This document summarizes the RustDesk protocol as it applies to the `rclient` gateway.
> Source: https://github.com/rustdesk/rustdesk (open source, MIT/AGPL)
>
> The proto file versions used by this project live in `gateway/src/proto/` (`rendezvous.proto`, `message.proto`) and are loaded at runtime by `protobufjs`.

---

## Port Map

| Port | Transport | Purpose |
|---|---|---|
| 21115 | TCP | NAT test |
| 21116 | TCP + UDP | hbbs main (TCP = rendezvous, UDP = peer keepalive) |
| **21118** | **WebSocket** | **hbbs WebSocket — use this** |
| 21117 | TCP | hbbr relay |
| **21119** | **WebSocket** | **hbbr WebSocket — use this** |

The gateway uses **only 21118 and 21119** (WebSocket). No UDP is needed.

---

## Proto Files

Located in `rustdesk/hbb_common` repo at `protos/`:
- `rendezvous.proto` — signaling, NAT traversal, relay negotiation
- `message.proto` — session messages (video, input, auth, etc.)

### Proto File Sources

```
https://raw.githubusercontent.com/rustdesk/rustdesk/master/libs/hbb_common/protos/rendezvous.proto
https://raw.githubusercontent.com/rustdesk/rustdesk/master/libs/hbb_common/protos/message.proto
```

The copies in `gateway/src/proto/` are loaded with `protobufjs` at runtime (no codegen step). If you refresh them from upstream, check the enum values in this document against the new files.

---

## Wire Framing

### WebSocket Mode (used by gateway)
Each WebSocket **binary frame** = one serialized protobuf message.  
**No length prefix.** WebSocket frames carry their own length.

### TCP Mode (not used, for reference)
```
[4-byte big-endian length][protobuf bytes]
```

---

## Rendezvous Protocol (`rendezvous.proto`)

### Top-level message
```proto
message RendezvousMessage {
  oneof union {
    PunchHoleRequest  punch_hole_request  = 8;
    PunchHoleResponse punch_hole_response = 11;
    RequestRelay      request_relay       = 18;
    RelayResponse     relay_response      = 19;
    // ... others not needed for gateway
  }
}
```

### Connection flow (force_relay mode — what gateway uses)

**Step 1 — Client → hbbs (WS:21118)**
```proto
RendezvousMessage {
  punch_hole_request: PunchHoleRequest {
    id: "TARGET_PEER_ID",
    nat_type: ASYMMETRIC,
    licence_key: "<SERVER_KEY>",   // from env / Advanced options, may be empty
    conn_type: DEFAULT_CONN,
    force_relay: true              // ← always true for web gateway
  }
}
```

**Step 2 — hbbs → Client (two possible responses)**

_Option A: `relay_response` (newer hbbs, most common with `force_relay: true`)_
```proto
RendezvousMessage {
  relay_response: RelayResponse {
    uuid: "server-assigned-uuid",    // use this UUID — do NOT generate your own
    relay_server: "relay.example.com", // relay server address
    pk: bytes,                        // signed IdPk blob (peer's Curve25519 pk inside)
    // refuse_reason is set on error
  }
}
```
When you get `relay_response`, hbbs has **already notified the peer** to connect to hbbr with the same UUID. Go directly to Step 3.

_Option B: `punch_hole_response` (older hbbs)_
```proto
RendezvousMessage {
  punch_hole_response: PunchHoleResponse {
    relay_server: "relay.example.com",
    pk: bytes,
    failure: ID_NOT_EXIST  // or OFFLINE, LICENSE_MISMATCH on error
  }
}
```
When you get `punch_hole_response`, generate your own UUID and send `RequestRelay` to **both** hbbs and hbbr.

**Step 3 — Client → hbbr (WS:21119)**
```proto
RendezvousMessage {
  request_relay: RequestRelay {
    id: "TARGET_PEER_ID",
    uuid: "uuid-from-step-2",   // from relay_response OR self-generated
    relay_server: "...",
    secure: false,              // peer will still initiate SignedId handshake
    conn_type: DEFAULT_CONN
  }
}
```

After both sides connect to hbbr with the same UUID, hbbr relays bytes bidirectionally. The peer initiates the `SignedId` secure handshake.

---

## Session Protocol (`message.proto`)

### Top-level message
```proto
message Message {
  oneof union {
    SignedId         signed_id        = 3;   // peer → client: secure handshake init
    PublicKey        public_key       = 4;   // client → peer: send encrypted session key
    Hash             hash             = 9;   // peer → client: auth challenge (encrypted)
    LoginRequest     login_request    = 7;   // client → peer (encrypted)
    LoginResponse    login_response   = 8;   // peer → client (encrypted)
    VideoFrame       video_frame      = 6;   // peer → client: encoded frame (encrypted)
    MouseEvent       mouse_event      = 10;  // client → peer (encrypted)
    AudioFrame       audio_frame      = 11;  // peer → client: Opus packet (encrypted)
    KeyEvent         key_event        = 15;  // client → peer (encrypted)
    TestDelay        test_delay       = 5;   // peer ↔ client: keepalive ping (encrypted)
    Misc             misc             = 19;  // display info, options, audio format, etc.
    PeerInfo         peer_info        = 25;  // peer → client: display list
  }
}
```

**Message sequence after relay pairing:**
1. Peer → Client: `SignedId` (unencrypted)
2. Client → Peer: `PublicKey { asymmetric_value, symmetric_value }` (unencrypted)
3. All further messages are **encrypted** with the session key
4. Peer → Client: `Hash { salt, challenge }` (encrypted)
5. Client → Peer: `LoginRequest` (encrypted)
6. Peer → Client: `LoginResponse` (encrypted, contains `PeerInfo` on success)
7. Peer → Client: `VideoFrame` and `AudioFrame` streams (encrypted)
8. Peer ↔ Client: `TestDelay` keepalive roughly every second (encrypted, **must echo back with `from_client: false`**)

---

## Authentication Handshake

### 1. Server → Client: Challenge
```proto
Message { hash: Hash { salt: "abc123", challenge: "xyz789" } }
```

### 2. Client → Server: Login
```proto
Message {
  login_request: LoginRequest {
    username: "TARGET_PEER_ID",  // MUST be the target ID (the machine's RustDesk ID) (e.g. "54372565")
                                  // Empty string → server returns "Offline" error!
    password: bytes,        // see hashing below
    my_id: "rclient-web",   // any string ID for the gateway
    my_name: "Web Browser",
    option: OptionMessage {
      supported_decoding: SupportedDecoding {
        ability_vp8:  1,
        ability_vp9:  1,
        ability_h264: 1,
        ability_av1:  1,
        prefer: H264        // H264 (enum value 2) for best browser support
      },
      image_quality: Balanced,  // enum 3 (gateway sends image_quality: 3)
      custom_fps: 30,
      disable_audio: No         // BoolOption 1 = No, i.e. do NOT disable audio
    },
    video_ack_required: false,  // MUST be false (see AI_GUIDELINES pitfall 12)
    session_id: uint64,        // random uint64
    version: "1.3.8"
  }
}
```

### Password Hashing

**CRITICAL — easy to get wrong:**
```
Step 1: intermediate = SHA256( plaintext_password_bytes + salt_bytes )
Step 2: final        = SHA256( intermediate + challenge_bytes )
```

In code:
```typescript
const intermediate = crypto.createHash('sha256')
  .update(Buffer.from(password, 'utf8'))
  .update(saltBuffer)     // salt bytes — NOT hex, NOT base64, raw bytes
  .digest();              // raw 32-byte Buffer

const final = crypto.createHash('sha256')
  .update(intermediate)
  .update(challengeBuffer) // challenge bytes — same note
  .digest();              // 32-byte result = the password field

// Send as raw Uint8Array in LoginRequest.password
```

**NEVER** do `SHA256(challenge + SHA256(salt + password))` — wrong order, wrong result.

**Salt and challenge** are `bytes` fields in the proto. `protobufjs` with default options returns them as **binary strings** (each `charCodeAt(i)` = byte value). Always convert with `Buffer.from(str, 'binary')`, NOT `Buffer.from(str, 'base64')`.

### `username` Field (Critical)

`LoginRequest.username` **must** be set to the **target ID** (the machine's RustDesk ID) (e.g. `"54372565"`), not empty string. The server checks:
```rust
if !is_ip_str(username) && !is_domain_port_str(username) && username != machine_own_id {
    // Returns "Offline" error — even if correct password!
}
```
Empty string fails this check. Set `username = targetId` (spaces stripped).

### 3. Server → Client: Result
```proto
// Success:
Message { login_response: LoginResponse { peer_info: PeerInfo { ... } } }
// Failure:
Message { login_response: LoginResponse { error: "Wrong password" } }
```

---

## Encryption

### Secure Handshake (SignedId flow)

Before any encrypted messages, the peer (server side) initiates a **Curve25519 key exchange**:

**Step 1 — Peer → Client: SignedId**
```proto
Message { signed_id: SignedId { id: bytes } }
```
`SignedId.id` = `Ed25519_signature(64 bytes) + IdPk_protobuf_bytes`

`IdPk` (defined in `message.proto`):
```proto
message IdPk { string id = 1; bytes pk = 2; }
```
`IdPk.pk` = peer's **Curve25519 public key** (32 bytes). Skip the first 64 signature bytes to parse IdPk without verification:
```typescript
const idPkBytes = signedId.id.slice(64);  // skip Ed25519 signature
const idPk = root.lookupType('IdPk').decode(idPkBytes);
const peerCurve25519Pk = idPk.pk;  // 32 bytes
```

**Step 2 — Client → Peer: PublicKey (client generates session key)**
```typescript
const symKey    = nacl.randomBytes(32);              // random 32-byte session key
const ephemeral = nacl.box.keyPair();                // ephemeral Curve25519 keypair
const zeroNonce = new Uint8Array(24);                // zero nonce
const sealedKey = nacl.box(symKey, zeroNonce, peerCurve25519Pk, ephemeral.secretKey);
```
```proto
Message {
  public_key: PublicKey {
    asymmetric_value: ephemeral.publicKey,  // our ephemeral Curve25519 pk (32 bytes)
    symmetric_value:  sealedKey,            // symKey encrypted for peer (48 bytes)
  }
}
```
The peer decrypts `symmetric_value` using its own Curve25519 secret key + `asymmetric_value`.  
**Store `symKey` immediately** — all subsequent messages from the peer are encrypted with it.

The server does NOT send a `public_key` reply. The very next message from the peer is already encrypted. (The gateway keeps a no-op `handlePublicKey` handler that only warns if an unexpected one arrives.)

### Keepalive (TestDelay)

The peer sends `Message { test_delay: { time, from_client: false } }` roughly every second. The client must echo it back with `from_client: false`, and only when the incoming `from_client` is false. That reply feeds the host's `VIDEO_QOS` RTT measurement, which drives FPS adaptation. Echoing with `from_client: true` makes the host treat it as a client ping and drops to minimum FPS. See `AI_GUIDELINES.md` pitfall 11.

### Per-Message Encryption/Decryption

```typescript
// Nonce: 8-byte little-endian seqnum + 16 zero bytes
function makeNonce(seqnum: bigint): Uint8Array {
  const nonce = new Uint8Array(24);
  new DataView(nonce.buffer).setBigUint64(0, seqnum, true);
  return nonce;
}

// CRITICAL: use PRE-increment — first message uses seqnum=1, not 0
// This matches Rust's `self.seq += 1; nonce = get_nonce(self.seq)`

let sendSeq = 0n;
function encryptMessage(plaintext: Uint8Array, key: Uint8Array): Uint8Array {
  return nacl.secretbox(plaintext, makeNonce(++sendSeq), key);
}

let recvSeq = 0n;
function decryptMessage(ciphertext: Uint8Array, key: Uint8Array): Uint8Array | null {
  return nacl.secretbox.open(ciphertext, makeNonce(++recvSeq), key);
}
```

**DO NOT use post-increment** (`seqnum++`) — that uses 0 for the first message which is wrong and will fail to decrypt every message.

**Both counters reset to 0** immediately after storing the symmetric key (before any encrypted messages arrive).

---

## Video Frames

### Proto structure
```proto
message VideoFrame {
  oneof union {
    EncodedVideoFrames vp9s  = 6;
    RGB rgb                  = 7;   // raw, not used by this gateway
    YUV yuv                  = 8;   // raw, not used by this gateway
    EncodedVideoFrames h264s = 10;
    EncodedVideoFrames h265s = 11;
    EncodedVideoFrames vp8s  = 12;
    EncodedVideoFrames av1s  = 13;
  }
  int32 display = 14;
}

message EncodedVideoFrames {
  repeated EncodedVideoFrame frames = 1;
}

message EncodedVideoFrame {
  bytes data = 1;   // raw codec bitstream
  bool  key  = 2;   // true = keyframe / IDR
  int64 pts  = 3;   // presentation timestamp (microseconds)
}
```

### Codec bitstream formats
| Codec | Format | WebCodecs codec string used by this client (`web/src/video/decoder.ts`) |
|---|---|---|
| H264 | Annex B NAL units | `"avc1.640028"` |
| VP9 | Raw VP9 bitstream | `"vp09.00.10.08"` |
| VP8 | Raw VP8 bitstream | `"vp8"` |
| AV1 | OBU format | `"av01.0.04M.08"` |

The decoder is configured with `optimizeForLatency: true`.

### Binary frame format sent to browser
The gateway strips the protobuf wrapper and sends raw payload data to the browser:
```
Byte 0:    codec ID   (1=H264, 2=VP9, 3=VP8, 4=AV1, 5=Opus audio)
Byte 1:    flags      (bit 0 = isKeyframe; always 0 for audio)
Bytes 2+:  raw payload (e.g. H264 Annex B NAL units, or one raw Opus packet)
```

The browser routes any frame starting with `5` to the audio player and everything else to the video decoder (`RemoteScreen.tsx`).

---

## Audio Frames

Audio is carried in `Message { audio_frame: AudioFrame { bytes data } }` — one raw Opus packet per message (RFC 6716, no Ogg container). The host also announces its format in `Misc { audio_format: AudioFormat { sample_rate, channels } }`.

The gateway forwards the packet as marker byte `5` + one unused flag byte + the Opus packet, and forwards the format as JSON `{type:"audio_format", sampleRate, channels}`. The browser feeds the packet to WebCodecs `AudioDecoder` (codec `"opus"`) and schedules the decoded buffers on the Web Audio clock. `AudioDecoder` only supports 1–2 channels, and the player ignores formats outside that range.

Audio can be switched off per session at login: `OptionMessage.disable_audio` is a `BoolOption` (`NotSet=0`, `No=1`, `Yes=2`) where the gateway sends `No` (1) — i.e. *do not disable audio*, which is what makes the host stream it. `Yes` (2) would turn audio off.

---

## Input Events

### Mouse Event
```proto
message MouseEvent {
  int32 mask = 1;
  // mask = (button << 3) | event_type, as the gateway builds it in RemoteScreen.tsx:
  // event_type: 0 = move, 1 = down, 2 = up, 3 = wheel
  // button bits: 0x01 = left, 0x02 = right, 0x04 = middle
  
  sint32 x = 2;   // absolute x in remote screen pixels (0 for wheel events)
  sint32 y = 3;   // absolute y; for wheel events: -1 = scroll down, +1 = scroll up
  repeated ControlKey modifiers = 4;
}
```

Common mask values (as sent by this client):
- `0` — mouse move
- `0x09` — left button down (1<<3 | 1)
- `0x0A` — left button up (1<<3 | 2)
- `0x11` — right button down (2<<3 | 1)
- `0x12` — right button up (2<<3 | 2)
- `3` — wheel (`MOUSE_TYPE_WHEEL`), with `y` carrying the direction

### Key Event
```proto
message KeyEvent {
  bool down  = 1;   // true=keydown, false=keyup
  bool press = 2;   // true=instant press (down+up)
  oneof union {
    ControlKey control_key = 3;  // special keys
    uint32     chr         = 4;  // position scan code
    uint32     unicode     = 5;  // unicode codepoint
    string     seq         = 6;  // key sequence
  }
  repeated ControlKey modifiers = 8;
  KeyboardMode mode = 9;  // use Legacy (0) — what this gateway sends
}
```

Note on `chr`: the comment above says "position scan code", which describes
**Map** mode. In **Legacy** mode (what we send) upstream treats the value as a
character: `legacy_keyboard_mode` → `process_chr` → `char_value_to_key` →
`Key::Layout(char)`. The scancode conversion (`translate_process_code`,
`code >> 16` → `vk_to_scancode`) is only reachable in Translate mode. So a
Ctrl+letter shortcut sends the code point of the letter, not its virtual key.
See [`docs/SHORTCUTS.md`](./SHORTCUTS.md) for the evidence.

Key `ControlKey` enum values (from `gateway/src/proto/message.proto` — note `Unknown=0`, so values start at 1):
```
Alt=1, Backspace=2, CapsLock=3, Control=4, Delete=5, DownArrow=6,
End=7, Escape=8, F1=9, F10=10, F11=11, F12=12, F2=13..F9=20,
Home=21, LeftArrow=22, Meta=23, PageDown=25, PageUp=26, Return=27,
RightArrow=28, Shift=29, Space=30, Tab=31, UpArrow=32
```

### What this client actually sends (`gateway/src/utils/keymap.ts`)

| Input | Encoding |
|---|---|
| Named/control keys (arrows, Enter, Tab, F1–F12, …) | `control_key` + `modifiers`, `mode: 0` |
| Printable characters, no Ctrl/Alt | `unicode` = `key.charCodeAt(0)`, sent on **keydown only** |
| Printable characters with Ctrl or Alt | `chr` = code point of the typed character (`c` → 99, `C` → 67), down and up | 
| Dead / Unidentified / multi-character keys | nothing (payload is `null`, the gateway skips it) |

Modifiers map `ctrl→4`, `alt→1`, `shift→29`, `meta→23`.

---

## Codec Negotiation Summary

The remote machine encodes video with a codec both sides support. The gateway declares VP8, VP9, H264 and AV1 and sets `prefer: 2` (H264), which is the best fit for browser compatibility and hardware decode.

If the host cannot encode H264 it may choose another declared codec (for example VP9 in software). The browser decoder is configured from the binary frame's codec byte, so all four declared codecs are decodable.

Caveat: `session.ts` reports `codec: "h264"` to the browser in the `connected` message regardless of what the host picked — useful to know when debugging a codec mismatch (see KI-003).
