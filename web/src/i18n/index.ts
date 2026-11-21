import { useCallback, useEffect, useState } from 'react';
import { en, label as enLabel } from './en';
import type { Catalogue, MessageKey } from './types';
import { ptBR, label as ptBRLabel } from './pt-BR';

/**
 * Every locale, in picker order. Each row is the whole registration: the BCP 47
 * tag `navigator.language` produces, its catalogue, and the language's own name.
 *
 * Adding a language is this one entry plus the catalogue file. No component
 * changes — that is the point of the shape (see docs/TRANSLATING.md).
 */
export const LOCALES = [
  { tag: 'en', catalogue: en, label: enLabel },
  { tag: 'pt-BR', catalogue: ptBR, label: ptBRLabel },
] as const;

const CATALOGUES: Record<string, Catalogue> = Object.fromEntries(
  LOCALES.map((l) => [l.tag, l.catalogue]),
);

/** The locales this build ships, as a literal union ('en' | 'pt-BR'). */
export type Locale = (typeof LOCALES)[number]['tag'];

/** What the language picker offers, in display order. */
export const AVAILABLE_LOCALES: readonly Locale[] = LOCALES.map((l) => l.tag);

/** The label to show for a locale in the picker. */
export function localeLabel(tag: Locale): string {
  return LOCALES.find((l) => l.tag === tag)?.label ?? tag;
}

export const LOCALE_STORAGE_KEY = 'rclient_locale';

/**
 * Stored choice, else the browser's preferred language, else English.
 *
 * `navigator.language` is `pt-BR`, `de-DE`, `en-US`… so an exact match is tried
 * first and then the base tag (`de-DE` → `de`). A read that throws (blocked
 * storage, as in a sandboxed iframe) falls back to detection rather than
 * blanking the page — the same reasoning as readThemePreference.
 */
export function detectLocale(): Locale {
  return pickLocale(navigatorLanguages());
}

export function pickLocale(languages: readonly string[]): Locale {
  for (const tag of languages) {
    if (isLocale(tag)) return tag;
    const base = tag.split('-')[0];
    const match = AVAILABLE_LOCALES.find((l) => l === base || l.split('-')[0] === base);
    if (match) return match;
  }
  return 'en';
}

function isLocale(tag: string): tag is Locale {
  return (AVAILABLE_LOCALES as readonly string[]).includes(tag);
}

function navigatorLanguages(): readonly string[] {
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  if (!nav) return [];
  return nav.languages?.length ? nav.languages : [nav.language].filter(Boolean);
}

/** Stored preference; anything unknown or missing means "detect". */
export function readStoredLocale(storage?: Pick<Storage, 'getItem'>): Locale | null {
  let raw: string | null;
  try {
    raw = (storage ?? localStorage).getItem(LOCALE_STORAGE_KEY);
  } catch {
    return null;
  }
  return raw && isLocale(raw) ? raw : null;
}

export function writeStoredLocale(locale: Locale, storage?: Pick<Storage, 'setItem'>): void {
  try {
    (storage ?? localStorage).setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Blocked storage: the choice still applies to this page, it just will not
    // survive a reload. Throwing here would break the language picker.
  }
}

/**
 * Look a message up, substituting `{placeholder}`s.
 *
 * A key missing from a catalogue (a translation that fell behind) falls back to
 * English and warns in development rather than rendering the raw key or throwing.
 */
export function translate(
  locale: Locale,
  key: MessageKey,
  vars?: Record<string, string | number>,
  onMissing?: (key: MessageKey, locale: Locale) => void,
): string {
  let template = CATALOGUES[locale]?.[key];
  if (template === undefined) {
    onMissing?.(key, locale);
    template = en[key];
  }
  if (template === undefined) return key;
  return vars ? template.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m)) : template;
}

/** The catalogue for a locale, for tests and for the "add a language" guide. */
export function catalogueFor(locale: Locale): Catalogue {
  return CATALOGUES[locale] ?? en;
}

/** Sets <html lang> so screen readers and browsers agree with the UI. */
export function applyLocale(locale: Locale): void {
  document.documentElement.lang = locale;
}

/**
 * Owns the language choice: detects it once, persists an explicit pick, keeps
 * <html lang> in step, and returns a `t()` bound to the current locale.
 */
export function useI18n(): { locale: Locale; setLocale: (l: Locale) => void; t: TFunction } {
  const [locale, setLocaleState] = useState<Locale>(() => readStoredLocale() ?? detectLocale());

  useEffect(() => {
    applyLocale(locale);
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    writeStoredLocale(next);
    setLocaleState(next);
  }, []);

  const t = useCallback<TFunction>(
    (key, vars) => translate(locale, key, vars, warnIfMissing),
    [locale],
  );

  return { locale, setLocale, t };
}

export type TFunction = (key: MessageKey, vars?: Record<string, string | number>) => string;

function warnIfMissing(key: MessageKey, locale: Locale): void {
  // import.meta.env is Vite's; the guard keeps this module usable under vitest.
  const dev = typeof import.meta !== 'undefined' && (import.meta as { env?: { DEV?: boolean } }).env?.DEV;
  if (dev) console.warn(`[i18n] missing "${key}" in "${locale}", using English`);
}
