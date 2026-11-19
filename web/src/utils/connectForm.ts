// Pure helpers for the connect form: the localStorage keys the form persists
// to, and the normalisation of the advanced server settings before they are
// handed to the gateway.

export const LS_ID_KEY = 'rclient_target_id';
export const LS_HBBS_KEY = 'rclient_hbbs_host';
export const LS_HBBR_KEY = 'rclient_hbbr_host';
export const LS_SRVKEY_KEY = 'rclient_server_key';
export const LS_ADV_KEY = 'rclient_advanced_open';
export const LS_DEBUG_KEY = 'rclient_debug_visible';

export interface ServerConfig {
  hbbsHost?: string;
  hbbsPort?: string;
  hbbrHost?: string;
  hbbrPort?: string;
  serverKey?: string;
}

export interface ServerConfigInput {
  hbbsHost?: string;
  hbbrHost?: string;
  serverKey?: string;
}

/**
 * Builds the optional server config for a connection attempt: trim every
 * field, drop the blanks, and return `undefined` when nothing was overridden
 * (so the gateway falls back to its own defaults).
 */
export function normalizeServerConfig(input: ServerConfigInput): ServerConfig | undefined {
  const cfg: ServerConfig = {};
  const hbbs = input.hbbsHost?.trim();
  const hbbr = input.hbbrHost?.trim();
  const key = input.serverKey?.trim();
  if (hbbs) cfg.hbbsHost = hbbs;
  if (hbbr) cfg.hbbrHost = hbbr;
  if (key) cfg.serverKey = key;
  return Object.keys(cfg).length ? cfg : undefined;
}
