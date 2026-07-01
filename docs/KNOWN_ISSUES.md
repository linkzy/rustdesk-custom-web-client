# Known Issues

> This document tracks confirmed bugs and limitations. Updated as issues are discovered.  
> Each entry includes: symptoms, root cause (if known), reproduction steps, and log evidence.

---

## KI-001 — Session Disconnects After ~10 Seconds

**Status:** ✅ Fixed  
**Severity:** High — was making the web client unusable for sustained sessions  
**Affected component:** `gateway/src/session.ts`

### Symptoms
- Browser screen freezes on the last received video frame
- Reconnecting and re-entering credentials required to resume
- Consistently occurs 5–15 seconds after a successful connection
- No error displayed in the browser UI — session silently drops

### Root Cause (Two-Layer Bug)

**Layer 1**: The handler for `test_delay` was missing — messages fell into the unhandled `else` branch and were silently ignored.

**Layer 2** (the real blocker): After adding the handler, it still didn't work because protobufjs decodes `int64` fields as JavaScript strings when using `toObject({ longs: String })`. Re-encoding that string value calls `verify()` which throws `"integer|Long expected"`. The throw was caught by the outer try/catch and silently swallowed — the echo was never sent.

**Proto definition** (`message.proto`):
```protobuf
message TestDelay {
  int64  time         = 1;   // timestamp from server (echo back as-is)
  bool   from_client  = 2;   // server sends false; client must reply with true
  uint32 last_delay   = 3;
  uint32 target_bitrate = 4;
}
```

**Key lesson**: Any `int64`/`uint64` field decoded with `longs: String` must be converted with `Number(value)` before re-encoding. The `number` type is accepted by `verify()` for int64 fields (JS numbers cover up to 2^53, sufficient for timestamps).

### Log Evidence
When the session is active, gateway logs show `test_delay` in the decoded fields for received messages before the relay closes:

```
[session] Decoded message fields: [ 'test_delay' ] | raw hex: 2a...
[relay] hbbr connection closed (code=1006, reason="")
[gateway] Session connect error: ...
```

The relay closure code `1006` (abnormal close / no close frame) indicates the **server** dropped the TCP connection — not the client or hbbr itself.

### Fix Applied
In `session.ts → handleRelayMessage`:
```typescript
} else if (msg.test_delay) {
  // time is decoded as string by protobufjs (longs: String) — convert to number for re-encoding
  const echoTime = Number(msg.test_delay.time) || 0;
  this.sendMessage({ test_delay: { time: echoTime, from_client: true } });
  console.log('[session] Echoed TestDelay time=' + echoTime);
}
```

Confirmed working: sessions now hold indefinitely. Log shows `[session] Echoed TestDelay time=0` every few seconds.

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

## KI-004 — Mouse Scroll Wheel Direction Inverted

**Status:** Open  
**Severity:** Low — usable but unintuitive  
**Affected component:** `web/src/components/RemoteScreen.tsx`

### Symptoms
- Scrolling down in the browser scrolls **up** on the remote machine, and vice versa

### Root Cause
The `deltaY` sign mapping to the RustDesk wheel protocol may be inverted. In `RemoteScreen.tsx` the wheel handler sends `y = e.deltaY > 0 ? 1 : -1`. On the host side (`input_service.rs`) the y value is used directly on Windows (`y = evt.y`) but inverted on non-Windows (`y = -y`). The correct direction for the Windows target needs to be verified.

### Fix
In `RemoteScreen.tsx`, invert the scroll direction:
```typescript
const scrollY = e.deltaY > 0 ? -1 : 1;
```
If the host is Linux/macOS the logic may differ — test on both targets.

---

## KI-005 — Keyboard Input: Apparent Caps Lock and Language Mismatch

**Status:** Open  
**Severity:** Medium — text input is unreliable, wrong characters appear  
**Affected component:** `gateway/src/session.ts`, `web/src/components/RemoteScreen.tsx`

### Symptoms
- Characters typed in the web client appear as their **shifted/caps** equivalents on the remote machine (e.g. typing `a` produces `A`)
- Special characters and symbols don't match the key pressed — suggests keyboard layout mismatch
- Appears as if Caps Lock is permanently on from the remote machine's perspective
- The remote machine's own Caps Lock state has no effect on the behaviour

### Likely Root Cause
The key event translation layer in the gateway maps browser `KeyboardEvent` properties to RustDesk's `KeyEvent` protobuf incorrectly. Two likely sub-causes:

1. **Modifier state bleeding** — Shift or Caps Lock modifiers may be included in the `modifiers` array when they should not be, or not cleared after key-up events
2. **`chr` vs `control_key` selection** — The gateway may be sending `chr` (Unicode codepoint) with the wrong casing, or using uppercase `keyCode` values instead of the raw character code

### Next Steps
- Audit the key event handler in `RemoteScreen.tsx` and the gateway's key translation
- Log the exact `chr` and `modifiers` values sent to the host alongside what the user actually typed
- Compare with RustDesk's native `KeyEvent` serialisation for the same keystrokes

---

## KI-006 — Common Keyboard Shortcuts Not Working (Ctrl+C, Ctrl+V, etc.)

**Status:** Open  
**Severity:** Medium — copy/paste and common shortcuts don't work  
**Affected component:** `gateway/src/session.ts`, `web/src/components/RemoteScreen.tsx`

### Symptoms
- Pressing Ctrl+C, Ctrl+V, Ctrl+A, Ctrl+Z, and similar browser-native shortcuts in the remote screen do nothing or trigger the browser's own action instead of being forwarded to the remote machine
- Text cannot be copied from or pasted into the remote session using standard shortcuts

### Likely Root Cause
Browser keyboard events for common shortcuts (Ctrl+C, Ctrl+V, etc.) are intercepted by the browser before reaching the JavaScript event handlers, or the gateway's key event builder doesn't properly encode modifier+key combinations as RustDesk `KeyEvent` messages. The `buildKeyPayload` function in `session.ts` may be dropping or mis-encoding these combinations.

### Next Steps
- Audit `buildKeyPayload` for modifier handling with common shortcut keys
- Log the raw `KeyboardEvent` and the resulting `KeyEvent` payload for Ctrl+C
- Consider using `preventDefault()` on the canvas for known shortcut combinations
- Compare with native RustDesk `KeyEvent` output for the same keystroke

---

*Last updated: 2026-07-01*
