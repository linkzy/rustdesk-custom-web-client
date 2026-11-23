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

**Status:** Open (encoding fixed; two parts remain, see "What is left")  
**Severity:** Medium — copy/paste and common shortcuts don't work  
**Affected component:** `gateway/src/utils/keymap.ts`, `web/src/components/RemoteScreen.tsx`  
**Detail:** [`docs/SHORTCUTS.md`](./SHORTCUTS.md) — measured matrix, encoding evidence, and what is still unproven

### Symptoms
- Pressing Ctrl+C, Ctrl+V, Ctrl+A, Ctrl+Z and similar shortcuts in the remote screen does nothing
- Text cannot be copied from or pasted into the remote session with standard shortcuts

### What was wrong (fixed)

Two independent problems, previously blurred together.

**Encoding.** `buildKeyPayload` sent Ctrl/Alt+character as `chr = keyCode`, the
browser's virtual-key value — Ctrl+C sent **67**, which is the character `C`.
Upstream RustDesk's Legacy path (`src/server/input_service.rs`:
`legacy_keyboard_mode` → `process_chr` → `char_value_to_key` →
`Key::Layout(char)`) reads `chr` as a **character code**, so the host was asked
to press `C` while the user pressed `c` (99). The `vk_to_scancode` path
(`translate_process_code`, `code >> 16`) is only reachable in `Translate` mode,
never in the `Legacy` mode we send.

Now `chr` is the code point of `msg.key` — the character the user actually
typed, layout- and case-aware (`c` → 99, `C` with Shift → 67, `/` → 47). Unit
tests fail if the old behaviour returns, and an e2e test asserts Ctrl+C produces
`chr=99` with `ctrl` in `modifiers`.

**Normal typing is unaffected:** KI-005 (unicode field, keydown-only) still holds,
covered by the same tests.

### What is left

1. **Browser-reserved shortcuts cannot be recovered.** Ctrl+W, Ctrl+T, Ctrl+N,
   Ctrl+Shift+T/N, Ctrl+Tab and the OS-level Alt+Tab / Alt+F4 / Meta+L /
   Ctrl+Alt+Delete are handled by the browser chrome or the window manager. A
   page can only receive them if the browser chooses to hand them over. The app
   does call `preventDefault()` on everything it receives (measured: 30/30), but
   that cannot reach events the browser never dispatches. Which of these a real
   keyboard actually delivers is **unmeasured** — Playwright's CDP key injection
   bypasses the browser UI layer, so it cannot answer that question. Confirming
   it needs a human pressing keys in a real window.
2. **Clipboard content still needs the clipboard channel (R-10).** Even with the
   keystroke correct, Ctrl+C can only tell the host to copy *its* selection. Moving
   text between the browser and the remote machine needs a clipboard channel that
   is not implemented.

### Not proven without a real host

The fake host records what we send; it does not run a Windows input layer. So it
is proven that we now send `chr=99` + Ctrl for Ctrl+C, and that ordinary typing is
unchanged. It is **not** proven that a Windows application acts on it. That needs
a session against a real RustDesk host.

### Next steps
- Confirm the remaining shortcuts against a real host (one session is enough)
- Clipboard sync (R-10) is a prerequisite for real copy/paste
- The verbose keystroke log in `gateway/src/server.ts` is commented out (R-15) —
  restore it temporarily when debugging; do not commit it back on

---

*Last updated: 2026-11-23*
