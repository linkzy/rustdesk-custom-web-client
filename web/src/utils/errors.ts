// Turns the raw error text that reaches the browser (from the gateway, from
// RustDesk through it, or from the WebSocket itself) into a short sentence plus a
// next step. The technical text stays in the Debug Panel — callers keep logging
// the raw string and only render the friendly pair.
//
// Matching is deliberately loose: the gateway relays RustDesk's own wording in
// several spellings ("Wrong password" / "Wrong Password", "Peer not available:
// OFFLINE", "connect error: …"), so a substring match against what we have seen.

export interface FriendlyError {
  title: string;
  hint: string;
}

const RULES: Array<{ test: RegExp; title: string; hint: string }> = [
  {
    test: /wrong password|wrong_password/i,
    title: 'Wrong password',
    hint: 'Check the password in RustDesk on the remote machine and try again.',
  },
  {
    test: /captcha/i,
    title: 'Captcha check failed',
    hint: 'Complete the captcha again and retry.',
  },
  {
    test: /offline|id_not_exist|not available/i,
    title: 'That machine is offline',
    hint: 'Make sure RustDesk is running on the remote machine and connected to your relay.',
  },
  {
    test: /timeout|timed out|etimedout/i,
    title: 'The relay did not answer',
    hint: 'Check that your relay server is online and the address in Advanced options is right.',
  },
  {
    test: /refused|econnrefused|enotfound|econnreset/i,
    title: 'Could not reach the relay',
    hint: 'Check the relay host and port, and that it accepts WebSocket connections.',
  },
  {
    test: /host closed|close_reason/i,
    title: 'The remote machine ended the session',
    hint: 'It may have been locked, disconnected, or someone closed the session there.',
  },
  {
    test: /websocket connection failed|ws error|websocket/i,
    title: 'Could not reach the rclient gateway',
    hint: 'The gateway may be down. Reload the page and try again.',
  },
  {
    test: /secure handshake failed|decrypt/i,
    title: 'Encryption handshake failed',
    hint: 'Reconnect. If it keeps happening, your server key may be wrong.',
  },
];

/**
 * Map a raw error to a short title and a next step.
 *
 * Unknown errors fall back to the generic pair; the raw text is always still
 * available in the Debug Panel.
 */
export function friendlyError(raw: string | null | undefined): FriendlyError {
  const text = (raw ?? '').trim();
  if (text === '') {
    return { title: 'Connection failed', hint: 'Check the details in the Debug Panel and try again.' };
  }
  for (const rule of RULES) {
    if (rule.test.test(text)) return { title: rule.title, hint: rule.hint };
  }
  return {
    title: 'Connection failed',
    hint: 'The Debug Panel has the technical details. Check the machine ID, password and relay settings.',
  };
}
