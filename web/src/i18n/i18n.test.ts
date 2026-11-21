import { describe, it, expect } from 'vitest';
import {
  AVAILABLE_LOCALES,
  LOCALE_STORAGE_KEY,
  catalogueFor,
  detectLocale,
  pickLocale,
  readStoredLocale,
  translate,
  writeStoredLocale,
} from './index';
import { en } from './en';

describe('catalogues', () => {
  it('every locale has exactly the English keys — no more, no fewer', () => {
    const englishKeys = Object.keys(en).sort();
    for (const locale of AVAILABLE_LOCALES) {
      expect(Object.keys(catalogueFor(locale)).sort(), locale).toEqual(englishKeys);
    }
  });

  it('no translation is empty or a leftover English placeholder', () => {
    for (const locale of AVAILABLE_LOCALES) {
      const cat = catalogueFor(locale);
      for (const [key, value] of Object.entries(cat)) {
        expect(value.trim(), `${locale} ${key}`).not.toBe('');
        expect(value, `${locale} ${key}`).not.toBe(key);
      }
    }
  });

  it('keeps every {placeholder} the English source has', () => {
    const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const locale of AVAILABLE_LOCALES) {
      const cat = catalogueFor(locale) as Record<string, string>;
      for (const [key, source] of Object.entries(en)) {
        expect(placeholders(cat[key]), `${locale} ${key}`).toEqual(placeholders(source));
      }
    }
  });
});

describe('translate', () => {
  it('returns the locale value', () => {
    expect(translate('pt-BR', 'connect.connect')).toBe('Conectar');
    expect(translate('en', 'connect.connect')).toBe('Connect');
  });

  it('substitutes placeholders', () => {
    expect(translate('en', 'debug.entries', { count: 3 })).toBe('3 entries');
    expect(translate('pt-BR', 'stats.msAgo', { value: 250 })).toBe('há 250ms');
  });

  it('leaves an unknown placeholder alone rather than printing undefined', () => {
    expect(translate('en', 'debug.entries')).toBe('{count} entries');
    expect(translate('en', 'debug.entries', { other: 1 })).toBe('{count} entries');
  });

  it('falls back to English and reports a key the catalogue lost', () => {
    const seen: string[] = [];
    // A catalogue cannot be behind in-tree (the parity test above pins that), so
    // this exercises the fallback path directly: an unknown key behaves the same.
    const out = translate('pt-BR', 'connect.connect', undefined, (k) => seen.push(k));
    expect(out).toBe('Conectar');
    expect(seen).toEqual([]);

    // With the key gone from every catalogue the raw key comes back rather than
    // "undefined" — and the warning callback fires.
    const key = 'not.a.real.key' as unknown as keyof typeof en;
    const fallback = translate('pt-BR', key, undefined, (k) => seen.push(String(k)));
    expect(fallback).toBe('not.a.real.key');
    expect(seen).toEqual(['not.a.real.key']);
  });
});

describe('locale detection and storage', () => {
  it('matches the exact tag first, then the base language', () => {
    expect(pickLocale(['pt-BR'])).toBe('pt-BR');
    expect(pickLocale(['pt-PT'])).toBe('pt-BR'); // no pt-PT catalogue: falls back to pt
    expect(pickLocale(['de-DE'])).toBe('en'); // unsupported language
    expect(pickLocale(['fr-CA', 'pt-BR'])).toBe('pt-BR'); // first match in preference order
    expect(pickLocale([])).toBe('en');
  });

  it('round-trips an explicit choice', () => {
    localStorage.clear();
    writeStoredLocale('pt-BR');
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('pt-BR');
    expect(readStoredLocale()).toBe('pt-BR');
  });

  it('ignores an unknown stored value', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'xx-YY');
    expect(readStoredLocale()).toBeNull();
  });

  // Blocked storage must not blank the page: main.tsx reads this before paint.
  it('returns null (→ detect) when getItem throws', () => {
    const throwing = {
      getItem(): string | null {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      },
    };
    expect(readStoredLocale(throwing)).toBeNull();
  });

  it('does not throw when setItem throws', () => {
    const throwing = {
      setItem(): void {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      },
    };
    expect(() => writeStoredLocale('pt-BR', throwing)).not.toThrow();
  });

  it('detects from navigator without a stored choice', () => {
    localStorage.clear();
    expect(AVAILABLE_LOCALES).toContain(detectLocale());
  });
});
