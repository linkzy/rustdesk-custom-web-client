# Keyboard shortcuts (KI-006)

What our client sends when you press a shortcut, what a RustDesk host does with
it, and which parts of this are measured rather than reasoned.

Two questions were conflated in the original bug report, so they are answered
separately below: **which shortcuts reach the page at all** (browser side), and
**what we put on the wire** (protocol side).

---

## 1. What we send (measured, and now fixed)

`buildKeyPayload` (`gateway/src/utils/keymap.ts`) sends a modifier+character
combination as `chr`, `mode: 0` (Legacy), with the pressed modifiers.

**It used to send the browser `keyCode`** — for Ctrl+C, `chr = 67`. That is the
Windows *virtual-key* value for C, and it is also the character code for
uppercase `C`. What the user actually typed is lowercase `c` (99), and a host
reads `chr` as a **character**, not a virtual key. That mismatch is the bug.

Measured through the real app against the fake host (`e2e/shortcut-matrix.mjs`),
after the fix:

| pressed | page receives | we send |
|---|---|---|
| Ctrl+C | `key="c"`, `code=KeyC`, `keyCode=67`, ctrl | `chr=99` (`c`), modifiers `[4]` |
| Ctrl+V | `key="v"`, `code=KeyV`, `keyCode=86`, ctrl | `chr=118` (`v`), modifiers `[4]` |
| Ctrl+A | `key="a"`, `code=KeyA`, `keyCode=65`, ctrl | `chr=97` (`a`), modifiers `[4]` |
| Ctrl+Shift+T | `key="T"`, ctrl+shift | `chr=84` (`T`), modifiers `[4, 29]` |
| Ctrl+/ | `key="/"`, ctrl | `chr=47` (`/`), modifiers `[4]` |

`msg.key` is already the character the user typed — layout- and case-aware — so
its code point is exactly what the host wants. The unit tests pin this, and each
one fails if the old `keyCode` behaviour comes back.

### Why `chr` is a character and not a scancode or virtual key

Read from upstream `rustdesk/src/server/input_service.rs` (master), along the
Legacy path we actually use:

```rust
// dispatch
match evt.mode.enum_value() {
    Ok(KeyboardMode::Map) => map_keyboard_mode(evt),
    Ok(KeyboardMode::Translate) => translate_keyboard_mode(evt),
    _ => legacy_keyboard_mode(evt),          // <- mode: 0 lands here
}

// legacy_keyboard_mode
Some(key_event::Union::Chr(chr)) => process_chr(&mut en, chr, down, has_hotkey_modifiers(evt)),

// process_chr
let key = char_value_to_key(chr);

// char_value_to_key
Key::Layout(std::char::from_u32(value).unwrap_or('\0'))
```

So `chr` is a Unicode scalar. The function that treats a value as a virtual key
(`translate_process_code`, which does `code >> 16` to get the VK and calls
`vk_to_scancode`) is reachable only from `Translate` mode, never from `Legacy`.

The `message.proto` comment says *"position key code. win: scancode"* — that
describes `Map` mode. In Legacy mode the field carries the character. Both
readings are consistent with the source; only one applies to what we send.

**A hypothesis I had to discard:** that the host expects a scancode in Legacy
mode and `chr=67` was the wrong *kind* of number. The source contradicts it —
there is no scancode conversion on the Legacy path at all.

---

## 2. Which shortcuts reach the page (partly measured, partly not)

### The method, and why the obvious one is wrong

Playwright's `page.keyboard.press()` sends CDP `Input.dispatchKeyEvent`, which is
injected **below the browser UI layer**. `e2e/shortcut-method-check.mjs`
demonstrates this: an injected Ctrl+W does **not** close the tab, in a browser
where a real Ctrl+W does.

So a matrix built that way reports "Ctrl+W reaches the page" — which is false for
a real user. The script says so in its own output rather than pretending.

### What is measured

`e2e/shortcut-matrix.mjs` runs the app against the fake host in Chromium and
records, for each combination, what the page's keydown listener received and
what payload we sent. That part is real: it is our code reacting to real events.

Result: **30/30 combinations are delivered to the page listener when injected**,
with the `key`/`code`/`keyCode` values listed above, and the app calls
`preventDefault()` on **30/30** of them (measured in the bubble phase, after the
app's own handler). This tells us our encoder handles every key an event can
carry, and that we are not deliberately letting the browser take any of them.

### What is NOT measured

Which combinations a **real** keyboard delivers. That is decided by the OS and
the browser chrome, and no page can observe it. The table below separates the
two, and the "reaches the page" column stays honest about which rows were tested:

| group | shortcuts | status |
|---|---|---|
| Ordinary editing keys | Ctrl+C, V, X, A, Z, Y, S, P, F, D, L, +, -, 0 | **expected available** — no browser chrome binding; delivered in the harness with the values above |
| Escape | Escape | delivered in the harness; no browser chrome binding |
| Browser chrome (documented) | F5, F11, Ctrl+W, Ctrl+T, Ctrl+N, Ctrl+Shift+T/N/W, Ctrl+Tab, Ctrl+Shift+Tab, Ctrl+PageUp/Down, Ctrl+Shift+I/J/C, F12 | **contested, unmeasured** — these are browser bindings; a page can only receive them if the browser hands them over. F5 in particular reloads the page in a real browser unless something calls `preventDefault()` first |
| OS-level | Alt+Tab, Alt+F4, Meta+L, Ctrl+Alt+Delete | **unmeasured** — the window manager usually consumes these before the browser sees them |

Rows 3 and 4 are marked from **documented browser behaviour**, not from a
measurement on this machine. Confirming them needs a human pressing keys in a
real window, which is why they are listed as unknown rather than "works".

### With Shift held

Ctrl+Shift+Z sends `chr=90` (`Z`), not `chr=122` (`z`). That is correct and
deliberate: Ctrl+Z and Ctrl+Shift+Z are different shortcuts, and the character
code distinguishes them.

---

## 3. What still needs a real host

The fake host records what we send; it does not run a Windows input layer. So
these are **proven**:

- the payload we put on the wire for every shortcut (unit tests + e2e),
- that the character code matches what the user typed,
- that ordinary typing (KI-005) is unchanged: `unicode`, keydown-only.

These are **not proven**, and need a real RustDesk host to confirm:

- that Windows applications act on `chr=99` + Ctrl by copying, pasting, undoing…
- that the browser hands over the contested shortcuts listed above,
- clipboard delivery itself: copy/paste **content** needs the clipboard channel
  (R-10), which is not implemented. Ctrl+C can reach the host, but the host has
  nothing to copy *from* our side without that channel.

The last point matters for expectations: even with the encoding fixed, Ctrl+C /
Ctrl+V on a remote desktop will not move clipboard content until the clipboard
channel exists. This task fixes the *keystroke*, not the clipboard.

---

## Reproducing

```bash
# What the app receives and sends, per shortcut (headless, no host):
node e2e/shortcut-matrix.mjs

# Proof that CDP injection cannot measure browser-reserved shortcuts:
node e2e/shortcut-method-check.mjs

# The unit tests that pin the encoding:
cd gateway && npx vitest run src/utils/keymap.test.ts

# The end-to-end assertion (Ctrl+C -> chr=99 with ctrl in modifiers):
npm run test:e2e -- --grep "Ctrl shortcut"
```
