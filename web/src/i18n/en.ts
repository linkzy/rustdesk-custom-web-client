/**
 * English catalogue — the source of truth.
 *
 * Every user-visible string in the app lives here and is read through `t()`.
 * Keys are the contract: a translation may change any value, but must keep the
 * same set of keys and the same `{placeholders}` (see docs/I18N.md).
 *
 * Not translated on purpose: log lines, protocol messages, RustDesk's own error
 * text, and index.html's title/description (crawlers read those statically).
 */
export const en = {
  // Connect screen
  'connect.subtitle': 'RustDesk Web Client',
  'connect.formLabel': 'Connect to a RustDesk machine',
  'connect.deviceId': 'Device ID',
  'connect.deviceIdPlaceholder': 'Enter RustDesk ID',
  'connect.password': 'Password',
  'connect.passwordPlaceholder': 'Connection password',
  'connect.rememberPassword': 'Remember password',
  'connect.rememberPasswordHint':
    "Saves the password in this browser's local storage. Leave it unticked on shared computers.",
  'connect.advanced': 'Advanced options',
  'connect.advancedHint': "Override the server defaults. Leave blank to use the gateway's built-in server.",
  'connect.hbbs': 'HBBS Host (rendezvous)',
  'connect.hbbsPlaceholder': 'e.g. myserver.com:21118',
  'connect.hbbr': 'HBBR Host (relay)',
  'connect.hbbrPlaceholder': 'e.g. myserver.com:21119',
  'connect.serverKey': 'Server Key',
  'connect.serverKeyPlaceholder': 'base64 public key',
  'connect.showDebug': 'Show debug info',
  'connect.connect': 'Connect',
  'connect.connecting': 'Connecting…',
  'connect.connected': 'Connected',
  'connect.disconnected': 'Disconnected',

  // Session toolbar
  'toolbar.label': 'Session controls',
  'toolbar.fit': 'Fit',
  'toolbar.native': '1:1',
  'toolbar.fitTitleOn': 'Switch to 1:1 (native resolution)',
  'toolbar.fitTitleOff': 'Switch to Fit (scale to window)',
  'toolbar.fitAriaOn': 'Fit to window, on',
  'toolbar.fitAriaOff': 'Fit to window, off',
  'toolbar.fullscreen': 'Fullscreen',
  'toolbar.enterFullscreen': 'Enter fullscreen',
  'toolbar.disconnect': 'Disconnect',

  // Theme and language pickers
  'theme.label': 'Colour theme',
  'theme.system': 'System',
  'theme.light': 'Light',
  'theme.dark': 'Dark',
  'language.label': 'Language',

  // Debug panel
  'debug.show': 'Debug logs',
  'debug.hide': 'Hide logs',
  'debug.copy': 'Copy all',
  'debug.copied': 'Copied!',
  'debug.entries': '{count} entries',

  // Stats overlay (technical labels; translated because they are on screen)
  'stats.gwFps': 'GW FPS',
  'stats.fps': 'FPS',
  'stats.frameDelta': 'Frame Δ',
  'stats.decode': 'Decode',
  'stats.ping': 'Ping',
  'stats.lastFrame': 'Last frame',
  'stats.msAgo': '{value}ms ago',
  'stats.noValue': '—',

  // Connection errors: a short title plus a next step. The raw gateway/RustDesk
  // text is never translated — it stays in the Debug Panel.
  'error.wrongPassword.title': 'Wrong password',
  'error.wrongPassword.hint': 'Check the password in RustDesk on the remote machine and try again.',
  'error.captcha.title': 'Captcha check failed',
  'error.captcha.hint': 'Complete the captcha again and retry.',
  'error.offline.title': 'That machine is offline',
  'error.offline.hint': 'Make sure RustDesk is running on the remote machine and connected to your relay.',
  'error.relayTimeout.title': 'The relay did not answer',
  'error.relayTimeout.hint': 'Check that your relay server is online and the address in Advanced options is right.',
  'error.relayUnreachable.title': 'Could not reach the relay',
  'error.relayUnreachable.hint': 'Check the relay host and port, and that it accepts WebSocket connections.',
  'error.hostClosed.title': 'The remote machine ended the session',
  'error.hostClosed.hint': 'It may have been locked, disconnected, or someone closed the session there.',
  'error.gateway.title': 'Could not reach the rclient gateway',
  'error.gateway.hint': 'The gateway may be down. Reload the page and try again.',
  'error.handshake.title': 'Encryption handshake failed',
  'error.handshake.hint': 'Reconnect. If it keeps happening, your server key may be wrong.',
  'error.generic.title': 'Connection failed',
  'error.generic.hint':
    'The Debug Panel has the technical details. Check the machine ID, password and relay settings.',
} as const;

export type MessageKey = keyof typeof en;
export type Catalogue = Record<MessageKey, string>;
