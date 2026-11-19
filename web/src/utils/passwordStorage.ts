// Browser-side persistence for the RustDesk connection password.
//
// The password is only written to localStorage when the user ticked
// "Remember password" and the connection actually succeeded. Every other path
// (default state, opt-out, or a failed attempt) leaves no password behind.

const LS_PW_KEY       = 'rclient_password';
const LS_REMEMBER_KEY = 'rclient_remember_password';

/** The password of the connection attempt in flight, kept in memory only. */
let pendingPassword: string | null = null;

/** Whether the user opted in to remembering the password (default: no). */
export function isRememberPasswordEnabled(): boolean {
  return localStorage.getItem(LS_REMEMBER_KEY) === 'true';
}

/**
 * Initial state of the connect form: the checkbox reflects the remembered
 * preference, and the field only gets a value when the preference is on *and*
 * a password was actually saved. An opt-in with nothing saved behind it (for
 * example after a failed attempt) is reset, so the form never shows a ticked
 * box that would silently save a password later.
 */
export function loadPasswordState(): { remember: boolean; password: string } {
  const remember = isRememberPasswordEnabled();
  const password = remember ? (localStorage.getItem(LS_PW_KEY) ?? '') : '';
  if (remember && password === '') {
    localStorage.setItem(LS_REMEMBER_KEY, 'false');
    return { remember: false, password: '' };
  }
  return { remember, password };
}

/**
 * Stores the opt-in preference. Turning it off also forgets any saved password
 * immediately; turning it on takes effect on the next successful connection.
 */
export function setRememberPasswordEnabled(enabled: boolean): void {
  localStorage.setItem(LS_REMEMBER_KEY, String(enabled));
  if (!enabled) localStorage.removeItem(LS_PW_KEY);
}

/** Keeps the password of the current attempt in memory until it succeeds. */
export function stagePasswordAttempt(password: string): void {
  pendingPassword = password;
}

/** Called when a connection succeeds: keep the password only if opted in. */
export function commitPasswordAfterConnect(): void {
  if (pendingPassword === null) return;
  if (isRememberPasswordEnabled() && pendingPassword !== '') {
    localStorage.setItem(LS_PW_KEY, pendingPassword);
  } else {
    localStorage.removeItem(LS_PW_KEY);
  }
  pendingPassword = null;
}

/** Called when an attempt fails: nothing is persisted. */
export function discardPasswordAttempt(): void {
  pendingPassword = null;
  if (!isRememberPasswordEnabled()) localStorage.removeItem(LS_PW_KEY);
}

/** Removes a password left behind by an earlier visit that did not opt in. */
export function dropPasswordIfNotOptedIn(): void {
  if (!isRememberPasswordEnabled()) localStorage.removeItem(LS_PW_KEY);
}
