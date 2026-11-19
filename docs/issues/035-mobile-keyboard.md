# R-13b: mobile keyboard input

**Labels:** `help wanted`, `area:web` · **Milestone:** v0.3.0 — Everyday remote desktop

**Context.** Mouse/touch works on Android (R-13), but there is no way to type from a
phone: no hardware keyboard, and the canvas captures no text input. A remote desktop
you cannot type into is half usable.

**Do.** A hidden `<textarea>`/contenteditable focused on canvas tap for touch
devices; forward `beforeinput`/`input`/`compositionend` as `unicode` key events the
way `keymap.ts` already handles printable characters. Send Enter, Backspace and Tab
as `control_key`. Only send the final composed string for IME (Android,
Japanese/Chinese). Add a "keyboard" toolbar button for devices without one.

**Where.** `web/src/components/RemoteScreen.tsx`; `gateway/src/utils/keymap.ts` if a
new field is unavoidable (prefer reusing `unicode`); `App.tsx` for the button.

**Accept.** Tapping the canvas on a phone opens the keyboard and characters land on
the remote machine; Enter/Backspace/Tab behave; IME emits no garbage; desktop
behaviour unchanged (no focus stealing); `npm run build` passes.

**Test without a host.** A fake gateway that echoes received `key` messages into the
Debug Panel lets you type on a phone and see exactly what would be sent.

**Note.** Mobile browsers differ a lot; say which one you tested.
