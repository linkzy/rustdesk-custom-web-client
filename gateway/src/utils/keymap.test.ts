import { describe, it, expect } from 'vitest';
import { buildKeyPayload, MODIFIER_MAP, CONTROL_KEY_MAP } from './keymap';

describe('MODIFIER_MAP', () => {
  it('maps the four browser modifier names to ControlKey enum values', () => {
    expect(MODIFIER_MAP['ctrl']).toBe(4);
    expect(MODIFIER_MAP['alt']).toBe(1);
    expect(MODIFIER_MAP['shift']).toBe(29);
    expect(MODIFIER_MAP['meta']).toBe(23);
  });
});

describe('buildKeyPayload — control keys', () => {
  it('sends special keys as control_key, not as characters (both directions)', () => {
    const enter = buildKeyPayload({ down: true, key: 'Enter', keyCode: 13 });
    expect(enter?.key_event).toEqual({
      down: true,
      control_key: CONTROL_KEY_MAP['Enter'],
      modifiers: [],
      mode: 0,
    });
    expect(enter?.key_event.control_key).toBe(27);
    expect(enter?.key_event).not.toHaveProperty('unicode');

    // Release events matter for control keys: the host needs the keyup.
    const esc = buildKeyPayload({ down: false, key: 'Escape', keyCode: 27 });
    expect(esc?.key_event.down).toBe(false);
    expect(esc?.key_event.control_key).toBe(8);
  });

  it('attaches known modifiers and drops unknown ones', () => {
    const payload = buildKeyPayload({
      down: true,
      key: 'Tab',
      keyCode: 9,
      modifiers: ['shift', 'hyper', 'ctrl'],
    });
    expect(payload?.key_event.modifiers).toEqual([29, 4]);
    expect(payload?.key_event.control_key).toBe(31);
  });
});

describe('buildKeyPayload — printable characters', () => {
  it('sends a lowercase letter as its unicode code point', () => {
    const payload = buildKeyPayload({ down: true, key: 'a', keyCode: 65 });
    expect(payload?.key_event).toEqual({
      down: true,
      unicode: 97,
      modifiers: [],
      mode: 0,
    });
    expect(payload?.key_event).not.toHaveProperty('chr');
  });

  it('keeps the case of an uppercase letter (does not use keyCode for plain typing)', () => {
    const payload = buildKeyPayload({ down: true, key: 'A', keyCode: 65 });
    expect(payload?.key_event.unicode).toBe(65);
  });

  it('sends symbols as their code point', () => {
    expect(buildKeyPayload({ down: true, key: '@', keyCode: 50 })?.key_event.unicode).toBe(64);
    expect(buildKeyPayload({ down: true, key: 'é', keyCode: 0 })?.key_event.unicode).toBe(233);
  });

  it('does not send a plain character on keyup (avoids double typing)', () => {
    expect(buildKeyPayload({ down: false, key: 'a', keyCode: 65 })).toBeNull();
  });

  it('sends Ctrl+<letter> as the CHARACTER code, not the Windows VK code', () => {
    // Upstream evidence (rustdesk/src/server/input_service.rs, master):
    //   legacy_keyboard_mode: Union::Chr(chr) => process_chr(en, chr, down, hotkey)
    //   process_chr:          let key = char_value_to_key(chr)  // Key::Layout(char)
    // So `chr` is a character code. For Ctrl+C the character is 'c' (99), not the
    // Windows virtual-key 67 — 67 would mean the character "C".
    for (const mod of ['ctrl', 'alt']) {
      const payload = buildKeyPayload({
        down: true,
        key: 'c',
        keyCode: 67,
        modifiers: [mod],
      });
      expect(payload?.key_event.chr).toBe('c'.codePointAt(0));
      expect(payload?.key_event).not.toHaveProperty('unicode');
      expect(payload?.key_event.mode).toBe(0); // Legacy, which is what upstream compares
    }
  });

  it('keeps Ctrl+Shift+<letter> uppercase (the character actually typed)', () => {
    // With Shift held the browser reports key: 'C'. The character code is then
    // 67 ("C"), which is correct — it is a different shortcut from Ctrl+C.
    const payload = buildKeyPayload({
      down: true,
      key: 'C',
      keyCode: 67,
      modifiers: ['ctrl', 'shift'],
    });
    expect(payload?.key_event.chr).toBe('C'.codePointAt(0));
  });

  it('sends a non-letter shortcut as its character (Ctrl+/)', () => {
    const payload = buildKeyPayload({
      down: true,
      key: '/',
      keyCode: 191,
      modifiers: ['ctrl'],
    });
    expect(payload?.key_event.chr).toBe('/'.codePointAt(0));
  });

  it('does not treat Shift as a shortcut modifier', () => {
    const payload = buildKeyPayload({
      down: true,
      key: 'C',
      keyCode: 67,
      modifiers: ['shift'],
    });
    expect(payload?.key_event.unicode).toBe(67);
    expect(payload?.key_event).not.toHaveProperty('chr');
  });

  it('skips non-printable keys with a multi-character name', () => {
    expect(buildKeyPayload({ down: true, key: 'Dead', keyCode: 0 })).toBeNull();
    expect(buildKeyPayload({ down: true, key: 'Unidentified', keyCode: 0 })).toBeNull();
    expect(buildKeyPayload({ down: true, key: 'MediaPlayPause', keyCode: 0 })).toBeNull();
  });
});
