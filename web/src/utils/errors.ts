// Turns the raw error text that reaches the browser (from the gateway, from
// RustDesk through it, or from the WebSocket itself) into a message key pair the
// UI can translate. The technical text stays in the Debug Panel — callers keep
// logging the raw string and only render the friendly pair.
//
// Matching is deliberately loose: the gateway relays RustDesk's own wording in
// several spellings ("Wrong password" / "Wrong Password", "Peer not available:
// OFFLINE", "connect error: …"), so a substring match against what we have seen.

import type { MessageKey } from '../i18n/en';

export interface FriendlyError {
  title: MessageKey;
  hint: MessageKey;
}

const RULES: Array<{ test: RegExp; title: MessageKey; hint: MessageKey }> = [
  {
    test: /wrong password|wrong_password/i,
    title: 'error.wrongPassword.title',
    hint: 'error.wrongPassword.hint',
  },
  {
    test: /captcha/i,
    title: 'error.captcha.title',
    hint: 'error.captcha.hint',
  },
  {
    test: /offline|id_not_exist|not available/i,
    title: 'error.offline.title',
    hint: 'error.offline.hint',
  },
  {
    test: /timeout|timed out|etimedout/i,
    title: 'error.relayTimeout.title',
    hint: 'error.relayTimeout.hint',
  },
  {
    test: /refused|econnrefused|enotfound|econnreset/i,
    title: 'error.relayUnreachable.title',
    hint: 'error.relayUnreachable.hint',
  },
  {
    test: /host closed|close_reason/i,
    title: 'error.hostClosed.title',
    hint: 'error.hostClosed.hint',
  },
  {
    test: /websocket connection failed|ws error|websocket/i,
    title: 'error.gateway.title',
    hint: 'error.gateway.hint',
  },
  {
    test: /secure handshake failed|decrypt/i,
    title: 'error.handshake.title',
    hint: 'error.handshake.hint',
  },
];

/**
 * Map a raw error to a title key and a next-step key.
 *
 * Unknown errors fall back to the generic pair; the raw text is always still
 * available in the Debug Panel.
 */
export function friendlyError(raw: string | null | undefined): FriendlyError {
  const text = (raw ?? '').trim();
  if (text === '') {
    return { title: 'error.generic.title', hint: 'error.generic.hint' };
  }
  for (const rule of RULES) {
    if (rule.test.test(text)) return { title: rule.title, hint: rule.hint };
  }
  return { title: 'error.generic.title', hint: 'error.generic.hint' };
}
