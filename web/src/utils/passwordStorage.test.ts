import { describe, it, expect, beforeEach, vi } from 'vitest';

const LS_PW_KEY = 'rclient_password';
const LS_REMEMBER_KEY = 'rclient_remember_password';

/**
 * The module keeps the staged password in module-level memory, so each test
 * gets a fresh copy of it via resetModules() + dynamic import.
 */
async function loadModule() {
  vi.resetModules();
  return import('./passwordStorage');
}

describe('passwordStorage — default state (no opt-in)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('never stores a password when the user did not opt in, even after a success', async () => {
    const mod = await loadModule();
    mod.stagePasswordAttempt('secret');
    mod.commitPasswordAfterConnect();

    expect(localStorage.getItem(LS_PW_KEY)).toBeNull();
    expect(localStorage.getItem(LS_REMEMBER_KEY)).toBeNull();
    expect(mod.loadPasswordState()).toEqual({ remember: false, password: '' });
  });

  it('leaves no password behind after a failed attempt', async () => {
    const mod = await loadModule();
    mod.setRememberPasswordEnabled(true);
    mod.stagePasswordAttempt('secret');
    mod.discardPasswordAttempt();

    expect(localStorage.getItem(LS_PW_KEY)).toBeNull();
  });

  it('drops a password left over from an earlier visit when not opted in', async () => {
    localStorage.setItem(LS_PW_KEY, 'stale');
    const mod = await loadModule();
    mod.dropPasswordIfNotOptedIn();

    expect(localStorage.getItem(LS_PW_KEY)).toBeNull();
  });
});

describe('passwordStorage — remember password opt-in', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('stores the password only once the connection has succeeded', async () => {
    const mod = await loadModule();
    mod.setRememberPasswordEnabled(true);
    mod.stagePasswordAttempt('correct-horse');

    // Staged in memory, not yet persisted.
    expect(localStorage.getItem(LS_PW_KEY)).toBeNull();

    mod.commitPasswordAfterConnect();
    expect(localStorage.getItem(LS_PW_KEY)).toBe('correct-horse');
    expect(mod.loadPasswordState()).toEqual({ remember: true, password: 'correct-horse' });
  });

  it('forgets a saved password as soon as the opt-in is turned off', async () => {
    const mod = await loadModule();
    mod.setRememberPasswordEnabled(true);
    mod.stagePasswordAttempt('secret');
    mod.commitPasswordAfterConnect();
    expect(localStorage.getItem(LS_PW_KEY)).toBe('secret');

    mod.setRememberPasswordEnabled(false);
    expect(localStorage.getItem(LS_PW_KEY)).toBeNull();
    expect(localStorage.getItem(LS_REMEMBER_KEY)).toBe('false');
  });

  it('resets an opt-in that has no password behind it', async () => {
    localStorage.setItem(LS_REMEMBER_KEY, 'true');
    const mod = await loadModule();

    expect(mod.loadPasswordState()).toEqual({ remember: false, password: '' });
    expect(localStorage.getItem(LS_REMEMBER_KEY)).toBe('false');
  });

  it('does not save an empty password even when opted in', async () => {
    const mod = await loadModule();
    mod.setRememberPasswordEnabled(true);
    mod.stagePasswordAttempt('');
    mod.commitPasswordAfterConnect();

    expect(localStorage.getItem(LS_PW_KEY)).toBeNull();
  });
});
