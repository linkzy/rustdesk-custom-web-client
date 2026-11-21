import { describe, it, expect } from 'vitest';
import {
  AVAILABLE_LOCALES,
  LOCALES,
  LOCALE_STORAGE_KEY,
  catalogueFor,
  detectLocale,
  localeLabel,
  pickLocale,
  readStoredLocale,
  translate,
  writeStoredLocale,
} from './index';
import { en } from './en';

describe('locale registry', () => {
  it('every registered locale has a catalogue and a name of its own', () => {
    for (const { tag, catalogue, label } of LOCALES) {
      expect(catalogue, `${tag} catalogue`).toBeTruthy();
      expect(label.trim(), `${tag} label`).not.toBe('');
      // A label is the language's endonym: it is shown untranslated in the
      // picker, so it must never be a message key.
      expect(label, `${tag} label`).not.toMatch(/^[a-z]+\.[a-zA-Z]/);
    }
    expect(AVAILABLE_LOCALES).toEqual(LOCALES.map((l) => l.tag));
  });

  it('localeLabel returns the registered name and falls back to the tag', () => {
    expect(localeLabel('pt-BR')).toBe('Português (Brasil)');
    expect(localeLabel('en')).toBe('English');
    expect(localeLabel('xx-YY' as (typeof AVAILABLE_LOCALES)[number])).toBe('xx-YY');
  });
});

describe('catalogues', () => {
  it('a translation cannot be missing a key the English catalogue has', () => {
    const englishKeys = Object.keys(en).sort();
    for (const locale of AVAILABLE_LOCALES) {
      const keys = Object.keys(catalogueFor(locale)).sort();
      // Set equality both ways: a missing key fails here, an invented one too.
      expect(keys.filter((k) => !englishKeys.includes(k)), `${locale} must not invent keys`).toEqual([]);
      expect(englishKeys.filter((k) => !keys.includes(k)), `${locale} must not miss keys`).toEqual([]);
    }
  });

  it('a translation cannot invent a key English does not have', () => {
    for (const locale of AVAILABLE_LOCALES) {
      const extra = Object.keys(catalogueFor(locale)).filter((k) => !(k in en));
      expect(extra, `${locale} has keys that are not in en.ts`).toEqual([]);
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
    expect(pickLocale(['fr-CA', 'pt-BR'])).toBe('pt-BR'); // first match in preference order
    expect(pickLocale([])).toBe('en');
  });

  it('falls back to English for a language this build does not ship', () => {
    // Derived, not hard-coded: adding a language must not break this test.
    const unsupported = ['zz-ZZ', 'xx', 'qq-QQ'].find((tag) => !AVAILABLE_LOCALES.some((l) => l.split('-')[0] === tag.split('-')[0]));
    expect(unsupported, 'pick a tag no catalogue covers').toBeTruthy();
    expect(pickLocale([unsupported!])).toBe('en');
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
