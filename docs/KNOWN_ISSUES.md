# Known Issues

> This document tracks confirmed bugs and limitations. Updated as issues are discovered.  
> Each entry includes the status, the symptoms, and — where known — the root cause and the fix applied.

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
  bool   from_client  = 2;   // server sends false; client echoes false
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
  // Echo only host-originated pings, with from_client: false — the host then
  // treats it as a delay response and drives VIDEO_QOS FPS from the RTT.
  // time is decoded as string by protobufjs (longs: String) — convert to number for re-encoding.
  if (!msg.test_delay.from_client) {
    const echoTime = Number(msg.test_delay.time) || 0;
    this.sendMessage({ test_delay: { time: echoTime, from_client: false, last_delay: 0 } });
  }
}
```

Confirmed working: sessions now hold indefinitely.

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

**Status:** Open (under investigation)  
**Severity:** Medium — expected improvement not seen

### Symptoms
- Latency and frame rate similar to public RustDesk relay servers despite using a self-hosted VPS relay

### Likely Causes
1. **Codec choice** — the gateway declares VP8/VP9/H264/AV1 and prefers H264, but the codec the host actually picks is not surfaced in the UI (`connected.codec` is hardcoded to `"h264"` in `session.ts`)
2. **Adaptive bitrate** — the gateway logs `TestDelay.target_bitrate` but does not act on it
3. **WebCodecs decode overhead** — browser-side decoding may add latency not present in the native app
4. **Single-threaded gateway** — all sessions share one Node.js event loop

### Next Steps
- Report the real codec from `PeerInfo` instead of the hardcoded value
- Act on `target_bitrate` and log the adaptive FPS the host reports (`auto_adjust_fps`)
- Profile browser-side WebCodecs pipeline

---

## KI-004 — Mouse Scroll Wheel Direction Inverted

**Status:** ✅ Fixed (v0.1.1, commit `7c75213`)  
**Severity:** Low — was usable but unintuitive  
**Affected component:** `web/src/components/RemoteScreen.tsx`

### Symptoms
- Scrolling down in the browser scrolled **up** on the remote machine, and vice versa

### Root Cause
The `deltaY` sign was mapped straight to the RustDesk wheel protocol. On Windows the host uses the y value directly; browser `deltaY` is positive when scrolling down, while Windows `MOUSEEVENTF_WHEEL` uses a positive value for scrolling up.

### Fix Applied
In `RemoteScreen.tsx`, the wheel handler inverts the direction and sends the wheel event type (`mask = 3`):

```typescript
const scrollY = e.deltaY > 0 ? -1 : 1;
controlsRef.current.sendMouse(0, scrollY, MOUSE_TYPE_WHEEL, getMods(e));
```

Verify on a Linux/macOS host if you touch this again — those targets may map the sign differently.

---

## KI-005 — Keyboard Input: Apparent Caps Lock and Language Mismatch

**Status:** ✅ Fixed (v0.1.1, commits `c78b528` and `543054c`)  
**Severity:** Medium — text input was unreliable, wrong characters appeared  
**Affected components:** `gateway/src/utils/keymap.ts`, `web/src/components/RemoteScreen.tsx`

### Symptoms
- Characters typed in the web client appeared as their **shifted/caps** equivalents on the remote machine (e.g. typing `a` produced `A`)
- Special characters and symbols did not match the key pressed — suggested keyboard layout mismatch
- Appeared as if Caps Lock was permanently on from the remote machine's perspective

### Root Cause
The gateway translated printable characters into RustDesk's `chr` (position/scan-code) field using the browser's `keyCode`, which is always the uppercase virtual-key value for letters (65–90). The host then inserted the character for that position, hence uppercase output and broken non-US layouts. Separately, the `unicode` field was sent on both keydown and keyup, and the host inserts a character for both — producing double characters.

### Fix Applied
In `keymap.ts`:

1. Printable characters are sent through the `unicode` field with the actual code point (`e.key.charCodeAt(0)`), so case and layout arrive correctly.
2. Only the keydown is sent for `unicode` events (`if (!msg.down) return null;`), which stops double-typing.
3. Ctrl/Alt combinations still use `chr` with `keyCode`, since those need the Windows virtual-key code to trigger shortcuts.

Control keys (arrows, Enter, Tab, etc.) keep using `control_key`.

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

*Last updated: 2026-11-19*
