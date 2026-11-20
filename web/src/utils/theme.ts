import { useCallback, useEffect, useState } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'rclient_theme';
const PREFERENCES: readonly ThemePreference[] = ['light', 'dark', 'system'];
const DARK_QUERY = '(prefers-color-scheme: dark)';

/**
 * Stored preference; anything unknown or missing means `system`.
 *
 * The read is wrapped because main.tsx calls this before the first paint: a
 * browser that blocks storage (a sandboxed iframe, or one that disables
 * localStorage) throws on the `localStorage` access itself, not only on
 * `getItem`. An uncaught throw there is a blank page instead of the connect
 * form, so the default `localStorage` is resolved inside the try as well.
 * Falling back to `system` also matches the CSS default (dark palette).
 */
export function readThemePreference(storage?: Pick<Storage, 'getItem'>): ThemePreference {
  let raw: string | null;
  try {
    raw = (storage ?? localStorage).getItem(THEME_STORAGE_KEY);
  } catch {
    return 'system';
  }
  return (PREFERENCES as readonly string[]).includes(raw ?? '') ? (raw as ThemePreference) : 'system';
}

export function writeThemePreference(pref: ThemePreference, storage: Pick<Storage, 'setItem'> = localStorage): void {
  storage.setItem(THEME_STORAGE_KEY, pref);
}

export function resolveTheme(pref: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  if (pref === 'system') return systemPrefersDark ? 'dark' : 'light';
  return pref;
}

/** Without matchMedia (e.g. old engines) fall back to the original dark look. */
export function systemPrefersDark(): boolean {
  return typeof window.matchMedia === 'function' ? window.matchMedia(DARK_QUERY).matches : true;
}

export function applyTheme(theme: ResolvedTheme): void {
  document.documentElement.dataset.theme = theme;
}

/**
 * Owns the theme choice: persists it, follows the OS setting live while the
 * preference is `system`, and keeps <html data-theme> in step.
 */
export function useTheme(): { preference: ThemePreference; resolved: ResolvedTheme; setPreference: (p: ThemePreference) => void } {
  const [preference, setPref] = useState<ThemePreference>(readThemePreference);
  const [prefersDark, setPrefersDark] = useState<boolean>(systemPrefersDark);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(DARK_QUERY);
    const onChange = (e: MediaQueryListEvent) => setPrefersDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const resolved = resolveTheme(preference, prefersDark);

  useEffect(() => {
    applyTheme(resolved);
  }, [resolved]);

  const setPreference = useCallback((next: ThemePreference) => {
    writeThemePreference(next);
    setPref(next);
  }, []);

  return { preference, resolved, setPreference };
}
