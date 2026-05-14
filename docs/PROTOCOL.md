# RustDesk Protocol Reference

> This document summarizes the RustDesk protocol as it applies to the `rclient` gateway.
> Source: https://github.com/rustdesk/rustdesk (open source, MIT/AGPL)

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

Copy these into `gateway/src/proto/` and load with `protobufjs`.

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
    licence_key: "",
    conn_type: DEFAULT_CONN,
    force_relay: true        // ← always true for web gateway
  }
}
```

**Step 2 — hbbs → Client (two possible responses)**

_Option A: `relay_response` (newer hbbs, most common with `force_relay: true`)_
```proto
RendezvousMessage {
  relay_response: RelayResponse {
    uuid: "server-assigned-uuid",    // use this UUID — do NOT generate your own
    relay_server: "147.x.x.x",       // relay server address
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
    relay_server: "147.x.x.x",
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
    KeyEvent         key_event        = 15;  // client → peer (encrypted)
    TestDelay        test_delay       = 5;   // peer ↔ client: keepalive ping (encrypted)
    Misc             misc             = 19;  // display info, options, etc.
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
7. Peer → Client: `VideoFrame` stream (encrypted)
8. Peer ↔ Client: `TestDelay` keepalive every few seconds (encrypted, **must echo back**)

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
    username: "TARGET_PEER_ID",  // MUST be the target machine's RustDesk ID (e.g. "54372565")
                                  // Empty string → server returns "Offline" error!
    password: bytes,        // see hashing below
    my_id: "web-client",    // any string ID for the gateway
    my_name: "Web Browser",
    option: OptionMessage {
      supported_decoding: SupportedDecoding {
        ability_vp8:  1,
        ability_vp9:  1,
        ability_h264: 1,
        ability_av1:  1,
        prefer: H264        // prefer H264 for best browser support
      }
    },
    video_ack_required: true,  // enables flow control for web clients
    session_id: uint64,        // random uint64
    version: "1.2.4"
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

`LoginRequest.username` **must** be set to the **target machine's RustDesk ID** (e.g. `"54372565"`), not empty string. The server checks:
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

The server does NOT send a `public_key` reply. The very next message from the peer is already encrypted.

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
    EncodedVideoFrames vp8s  = 12;
    EncodedVideoFrames vp9s  = 6;
    EncodedVideoFrames h264s = 10;
    EncodedVideoFrames h265s = 11;
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
| Codec | Format | Browser WebCodecs codec string |
|---|---|---|
| H264 | Annex B NAL units | `"avc1.42E01E"` (baseline) or `"avc1.640028"` (high) |
| VP9 | Raw VP9 bitstream | `"vp09.00.10.08"` |
| VP8 | Raw VP8 bitstream | `"vp8"` |
| AV1 | OBU format | `"av01.0.04M.08"` |

### Binary frame format sent to browser
The gateway strips the protobuf wrapper and sends raw video data to the browser:
```
Byte 0:    codec ID   (1=H264, 2=VP9, 3=VP8, 4=AV1)
Byte 1:    flags      (bit 0 = isKeyframe)
Bytes 2+:  raw frame bitstream (e.g. H264 Annex B NAL units)
```

---

## Input Events

### Mouse Event
```proto
message MouseEvent {
  int32 mask = 1;
  // mask encoding:
  // bits 0-2: button (0=none, 1=left, 2=right, 3=middle)
  // bit  3:   down=1/up=0 (for button events)
  // bit  4:   scroll
  // bits 5-6: scroll direction/amount (when bit4=1)
  
  sint32 x = 2;   // absolute x in remote screen pixels
  sint32 y = 3;   // absolute y
  repeated ControlKey modifiers = 4;
}
```

Common mask values:
- `0` — mouse move (no buttons)
- `1` — left button down
- `9` — left button up (1 | 8)
- `2` — right button down
- `10` — right button up (2 | 8)
- `0x11` — scroll down
- `0x12` — scroll up (approximately)

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
  KeyboardMode mode = 9;  // use MAP (1) for most cases
}
```

Key `ControlKey` enum values (partial — see proto for full list):
```
Alt=0, Backspace=1, CapsLock=2, Control=3, Delete=4, DownArrow=5,
End=6, Escape=7, F1=8..F12=19, Home=20, LeftArrow=22, Meta=23,
PageDown=24, PageUp=25, Return=26, RightArrow=27, Shift=28,
Space=29, Tab=30, UpArrow=31
```

---

## Codec Negotiation Summary

The remote machine will encode video using the **best codec** that all connected clients support. If the gateway declares H264 support, the remote will use H264 (hardware-encoded if GPU is available). This is the best option for browser compatibility.

If the remote machine does **not** have H264 hardware encoding, it will fall back to VP9 (software). Both are handled by WebCodecs.

**Gateway should always declare**: VP8=1, VP9=1, H264=1, AV1=1 in `SupportedDecoding`.
