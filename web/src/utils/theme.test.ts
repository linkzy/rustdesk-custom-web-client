import { describe, it, expect, beforeEach } from 'vitest';
// index.css is read from disk: vitest stubs CSS imports (even ?raw/?inline), and
// the web package has no Node type definitions, so the module name is kept
// out of the static type graph.
const NODE_FS = 'node:fs';
type NodeFs = { readFileSync(path: string, encoding: 'utf8'): string };
type NodeProcess = { cwd(): string };
const { readFileSync } = (await import(/* @vite-ignore */ NODE_FS)) as NodeFs;
const cwd = (globalThis as unknown as { process: NodeProcess }).process.cwd();
const indexCss = readFileSync(`${cwd}/src/index.css`, 'utf8');
import {
  THEME_STORAGE_KEY,
  readThemePreference,
  writeThemePreference,
  resolveTheme,
} from './theme';

describe('theme preference storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to system when nothing is stored', () => {
    expect(readThemePreference()).toBe('system');
  });

  it('round-trips light, dark and system under rclient_theme', () => {
    for (const pref of ['light', 'dark', 'system'] as const) {
      writeThemePreference(pref);
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe(pref);
      expect(readThemePreference()).toBe(pref);
    }
  });

  it('treats an unknown stored value as system', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'sepia');
    expect(readThemePreference()).toBe('system');
  });

  // main.tsx reads the preference before the first paint, so a storage that
  // throws must degrade to the default rather than blank the page.
  it('falls back to system when getItem throws', () => {
    const throwing = {
      getItem(): string | null {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      },
    };
    expect(readThemePreference(throwing)).toBe('system');
  });

  it('falls back to system when even accessing localStorage throws', () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('Access is denied for this document.', 'SecurityError');
      },
    });
    try {
      expect(readThemePreference()).toBe('system');
    } finally {
      if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
      else delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });
});

describe('resolveTheme', () => {
  it('follows the OS only for system', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });

  it('ignores the OS for an explicit choice', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});

// WCAG 2.x contrast from the palette in index.css, so a colour change that
// drops text below AA fails here rather than in a review.
function parseBlock(css: string, selector: string): Record<string, string> {
  const m = css.match(new RegExp(`${selector}\\s*\\{([^}]*)\\}`));
  if (!m) throw new Error(`block ${selector} not found`);
  const vars: Record<string, string> = {};
  for (const d of m[1].matchAll(/--color-([\w-]+):\s*(#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6})\s*;/g)) {
    const hex = d[2].length === 4 ? '#' + [...d[2].slice(1)].map((c) => c + c).join('') : d[2];
    vars[d[1]] = hex;
  }
  return vars;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const palettes = {
  dark: parseBlock(indexCss, ':root'),
  light: parseBlock(indexCss, '\\[data-theme="light"\\]'),
};

// [text token, background token] pairs that carry readable text on screen.
const TEXT_PAIRS: Array<[string, string]> = [
  ['body-text', 'body-bg'],
  ['text', 'page'],
  ['text', 'surface'],
  ['text', 'surface-alt'],
  ['text-muted', 'page'],
  ['text-muted', 'surface'],
  ['text-subtle', 'page'],
  ['text-subtle', 'surface'],
  ['text-subtle', 'surface-alt'],
  ['text-soft', 'surface'],
  ['text-soft', 'surface-alt'],
  ['control-text', 'control'],
  ['control-text', 'control-hover'],
  ['on-primary', 'primary'],
  ['on-primary', 'primary-hover'],
  ['on-primary', 'primary-active'],
  ['on-primary', 'danger'],
  ['on-primary', 'danger-hover'],
  ['danger-text', 'surface'],
  ['warn-text', 'surface'],
  ['ok-text', 'surface'],
];

describe('palette contrast (WCAG AA, 4.5:1 for text)', () => {
  for (const theme of ['dark', 'light'] as const) {
    for (const [fg, bg] of TEXT_PAIRS) {
      it(`${theme}: ${fg} on ${bg}`, () => {
        const vars = palettes[theme];
        const ratio = contrast(vars[fg], vars[bg]);
        expect(ratio, `${fg} ${vars[fg]} on ${bg} ${vars[bg]}`).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});
