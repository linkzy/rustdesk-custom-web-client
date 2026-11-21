import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useTheme, THEME_STORAGE_KEY } from './theme';
import { useI18n } from '../i18n';
import { ThemeSelect } from '../components/ThemeSelect';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Listener = (e: { matches: boolean }) => void;

// Minimal matchMedia stand-in: lets a test flip the OS theme and fire `change`.
function installMatchMedia(initialDark: boolean) {
  let matches = initialDark;
  const listeners = new Set<Listener>();
  const mq = {
    get matches() {
      return matches;
    },
    addEventListener: (_: string, fn: Listener) => listeners.add(fn),
    removeEventListener: (_: string, fn: Listener) => listeners.delete(fn),
  };
  window.matchMedia = vi.fn(() => mq) as unknown as typeof window.matchMedia;
  return {
    setDark(next: boolean) {
      matches = next;
      listeners.forEach((fn) => fn({ matches: next }));
    },
  };
}

let host: HTMLDivElement;
let root: Root;

// Renders the select plus a marker carrying the resolved theme, so tests read the DOM.
function Probe() {
  const { preference, resolved, setPreference } = useTheme();
  const { t } = useI18n();
  return createElement(
    'div',
    null,
    createElement(ThemeSelect, { value: preference, onChange: setPreference, t }),
    createElement('span', { 'data-testid': 'resolved' }, resolved),
  );
}

function mount() {
  act(() => {
    root.render(createElement(Probe));
  });
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  delete (window as { matchMedia?: unknown }).matchMedia;
});

describe('useTheme and ThemeSelect', () => {
  it('applies the resolved theme to <html> on mount (system + dark OS)', () => {
    installMatchMedia(true);
    mount();
    expect(host.querySelector('select')?.value).toBe('system');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('follows a live OS change while the preference is system', () => {
    const os = installMatchMedia(true);
    mount();
    act(() => os.setDark(false));
    expect(host.querySelector('[data-testid=resolved]')?.textContent).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('ignores a live OS change once an explicit theme is chosen', () => {
    const os = installMatchMedia(true);
    mount();
    const select = host.querySelector('select') as HTMLSelectElement;
    act(() => {
      select.value = 'dark';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    act(() => os.setDark(false));
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('persists the choice chosen in the select and restores it on remount', () => {
    installMatchMedia(false);
    mount();
    const select = host.querySelector('select') as HTMLSelectElement;
    expect(select.value).toBe('system');
    act(() => {
      select.value = 'light';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');

    // Simulate a reload: fresh root reads the stored preference.
    act(() => root.unmount());
    root = createRoot(host);
    mount();
    expect((host.querySelector('select') as HTMLSelectElement).value).toBe('light');
  });

  it('falls back to dark when matchMedia is unavailable', () => {
    delete (window as { matchMedia?: unknown }).matchMedia;
    mount();
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
