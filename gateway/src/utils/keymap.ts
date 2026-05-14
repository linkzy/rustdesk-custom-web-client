// Map of browser key names → RustDesk ControlKey enum values
export const CONTROL_KEY_MAP: Record<string, number> = {
  'Alt':        0,
  'Backspace':  1,
  'CapsLock':   2,
  'Control':    3,
  'Delete':     4,
  'ArrowDown':  5,
  'End':        6,
  'Escape':     7,
  'F1':         8,
  'F2':         9,
  'F3':         10,
  'F4':         11,
  'F5':         12,
  'F6':         13,
  'F7':         14,
  'F8':         15,
  'F9':         16,
  'F10':        17,
  'F11':        18,
  'F12':        19,
  'Home':       20,
  'Insert':     21,
  'ArrowLeft':  22,
  'Meta':       23,
  'PageDown':   24,
  'PageUp':     25,
  'Enter':      26,
  'ArrowRight': 27,
  'Shift':      28,
  ' ':          29,  // Space
  'Tab':        30,
  'ArrowUp':    31,
};

// Map of modifier strings → ControlKey enum values
export const MODIFIER_MAP: Record<string, number> = {
  'ctrl':  3,  // Control
  'alt':   0,  // Alt
  'shift': 28, // Shift
  'meta':  23, // Meta/Win
};

export interface KeyPayload extends Record<string, unknown> {
  key_event: {
    down?: boolean;
    press?: boolean;
    control_key?: number;
    chr?: number;
    unicode?: number;
    modifiers: number[];
    mode: number; // 1 = MAP
  };
}

export function buildKeyPayload(msg: {
  down: boolean;
  key: string;
  keyCode: number;
  modifiers?: string[];
}): KeyPayload {
  const modifiers = (msg.modifiers ?? []).map((m) => MODIFIER_MAP[m]).filter((v) => v !== undefined);

  // Check if it's a special/control key
  const controlKey = CONTROL_KEY_MAP[msg.key];
  if (controlKey !== undefined) {
    return {
      key_event: {
        down: msg.down,
        control_key: controlKey,
        modifiers,
        mode: 1,
      },
    };
  }

  // For regular printable characters, use unicode codepoint
  if (msg.key.length === 1) {
    return {
      key_event: {
        down: msg.down,
        unicode: msg.key.codePointAt(0) ?? msg.keyCode,
        modifiers,
        mode: 1,
      },
    };
  }

  // Fallback: use keyCode as chr
  return {
    key_event: {
      down: msg.down,
      chr: msg.keyCode,
      modifiers,
      mode: 1,
    },
  };
}
