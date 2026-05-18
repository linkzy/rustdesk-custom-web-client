// ControlKey enum values from message.proto (0 = Unknown, so values start at 1)
export const CONTROL_KEY_MAP: Record<string, number> = {
  'Alt':          1,
  'Backspace':    2,
  'CapsLock':     3,
  'Control':      4,
  'Delete':       5,
  'ArrowDown':    6,  // DownArrow
  'End':          7,
  'Escape':       8,
  'F1':           9,
  'F10':          10,
  'F11':          11,
  'F12':          12,
  'F2':           13,
  'F3':           14,
  'F4':           15,
  'F5':           16,
  'F6':           17,
  'F7':           18,
  'F8':           19,
  'F9':           20,
  'Home':         21,
  'ArrowLeft':    22, // LeftArrow
  'Meta':         23,
  'PageDown':     25,
  'PageUp':       26,
  'Enter':        27, // Return
  'ArrowRight':   28, // RightArrow
  'Shift':        29,
  ' ':            30, // Space
  'Tab':          31,
  'ArrowUp':      32, // UpArrow
  'Insert':       58,
  'ScrollLock':   62,
  'NumLock':      63,
};

// Modifier key → ControlKey enum value (same enum, correct values)
export const MODIFIER_MAP: Record<string, number> = {
  'ctrl':  4,  // Control = 4
  'alt':   1,  // Alt = 1
  'shift': 29, // Shift = 29
  'meta':  23, // Meta = 23
};

export interface KeyPayload extends Record<string, unknown> {
  key_event: {
    down?: boolean;
    control_key?: number;
    chr?: number;
    unicode?: number;
    modifiers: number[];
    mode: number; // 0 = Legacy
  };
}

export function buildKeyPayload(msg: {
  down: boolean;
  key: string;
  keyCode: number;
  modifiers?: string[];
}): KeyPayload | null {
  const modifiers = (msg.modifiers ?? [])
    .map((m) => MODIFIER_MAP[m])
    .filter((v): v is number => v !== undefined);

  // Special/control key → use control_key field
  const controlKey = CONTROL_KEY_MAP[msg.key];
  if (controlKey !== undefined) {
    return {
      key_event: {
        down: msg.down,
        control_key: controlKey,
        modifiers,
        mode: 0,
      },
    };
  }

  // Skip non-printable keys (Dead, Process, Unidentified, etc.)
  if (msg.key.length !== 1) return null;

  // For Ctrl/Alt keyboard shortcuts (e.g. Ctrl+C, Alt+F4), send chr with the
  // browser keyCode which maps to Windows VK codes (C=67, V=86, etc.).
  // This lets the host fire the correct shortcut action.
  const isShortcut = modifiers.some(
    (m) => m === MODIFIER_MAP['ctrl'] || m === MODIFIER_MAP['alt'],
  );
  if (isShortcut) {
    return {
      key_event: {
        down: msg.down,
        chr: msg.keyCode,
        modifiers,
        mode: 0,
      },
    };
  }

  // Regular printable character → send the actual Unicode code point via the
  // `unicode` field (proto field 5). This is correct for ALL layouts and cases:
  //   'a' → unicode=97,  'A' → unicode=65,  '@' → unicode=64
  // Previously we used `chr` (position/scancode field) with keyCode (always the
  // uppercase VK value 65–90 for letters), which caused everything to come out
  // uppercase and broke non-US keyboard layouts.
  return {
    key_event: {
      down: msg.down,
      unicode: msg.key.charCodeAt(0),
      modifiers,
      mode: 0,
    },
  };
}
