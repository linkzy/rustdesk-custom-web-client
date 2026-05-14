# Known Issues

> This document tracks confirmed bugs and limitations. Updated as issues are discovered.  
> Each entry includes: symptoms, root cause (if known), reproduction steps, and log evidence.

---

## KI-001 — Session Disconnects After ~10 Seconds

**Status:** Known / Not yet fixed  
**Severity:** High — makes the web client unusable for sustained sessions  
**Affected component:** `gateway/src/session.ts`

### Symptoms
- Browser screen freezes on the last received video frame
- Reconnecting and re-entering credentials required to resume
- Consistently occurs 5–15 seconds after a successful connection
- No error displayed in the browser UI — session silently drops

### Root Cause
The RustDesk server (peer) sends periodic `TestDelay` keepalive messages (protobuf `Message.test_delay`, field 5) to verify the client is alive and measure round-trip latency. The server expects the client to echo the message back with `from_client = true`. 

Our gateway receives these `TestDelay` messages but falls into the unhandled `else` branch in `handleRelayMessage` and silently ignores them. After ~10 seconds without a `TestDelay` echo, the RustDesk server closes the relay connection.

**Proto definition** (`message.proto` line 701):
```protobuf
message TestDelay {
  int64  time         = 1;   // timestamp from server (echo back as-is)
  bool   from_client  = 2;   // server sends false; client must reply with true
  uint32 last_delay   = 3;
  uint32 target_bitrate = 4;
}
```

### Log Evidence
When the session is active, gateway logs show `test_delay` in the decoded fields for received messages before the relay closes:

```
[session] Decoded message fields: [ 'test_delay' ] | raw hex: 2a...
[relay] hbbr connection closed (code=1006, reason="")
[gateway] Session connect error: ...
```

The relay closure code `1006` (abnormal close / no close frame) indicates the **server** dropped the TCP connection — not the client or hbbr itself.

### Fix (Not Yet Implemented)
In `session.ts → handleRelayMessage`, add a handler:
```typescript
} else if (msg.test_delay) {
  // Echo back with from_client = true so the server knows we are alive
  this.sendMessage({
    test_delay: {
      time: msg.test_delay.time,
      from_client: true,
    },
  });
}
```
This is a one-liner fix — the `time` field must be echoed back exactly as received so the server can compute RTT.

---

## KI-002 — Input Testing Requires a Second Machine

**Status:** Known limitation / By design  
**Severity:** Low — only affects local development testing

### Symptoms
- Mouse and keyboard events appear to do nothing when the controlled machine is the same machine running the browser
- No way to confirm input events are reaching the remote machine from the same device

### Root Cause
This is a fundamental limitation of testing remote desktop software from the same machine that is both the controller and the controlled. The RustDesk desktop app (running as host) will receive input events, but those events are immediately overridden by the local user's own keyboard/mouse input.

### Workaround
Test input forwarding from a **second physical device** (phone browser, another laptop, etc.) connecting to the gateway.

---

## KI-003 — Performance Comparable to Public Relay Servers

**Status:** Under investigation  
**Severity:** Medium — expected improvement not seen

### Symptoms
- Latency and frame rate similar to public RustDesk relay servers despite using a self-hosted VPS relay

### Likely Causes
1. **Codec negotiation** — The gateway currently requests H264 but the actual codec chosen by the server is unknown and may not be optimal
2. **No adaptive bitrate** — The `TestDelay.target_bitrate` field (part of KI-001) is not being processed, so the server can't adapt to the connection quality
3. **WebCodecs decode overhead** — Browser-side decoding may add latency not present in the native app
4. **Single-threaded gateway** — All sessions share one Node.js event loop

### Next Steps
- Fix KI-001 first (TestDelay handler with `target_bitrate`)
- Add codec logging to confirm which codec is actually in use
- Profile browser-side WebCodecs pipeline

---

*Last updated: 2026-05-14*
