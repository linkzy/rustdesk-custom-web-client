import { describe, it, expect } from 'vitest';
import {
  LS_ID_KEY,
  LS_HBBS_KEY,
  LS_HBBR_KEY,
  LS_SRVKEY_KEY,
  LS_ADV_KEY,
  LS_DEBUG_KEY,
  normalizeServerConfig,
} from './connectForm';

describe('localStorage keys', () => {
  it('keeps the rclient_* names stable (they are persisted user data)', () => {
    expect(LS_ID_KEY).toBe('rclient_target_id');
    expect(LS_HBBS_KEY).toBe('rclient_hbbs_host');
    expect(LS_HBBR_KEY).toBe('rclient_hbbr_host');
    expect(LS_SRVKEY_KEY).toBe('rclient_server_key');
    expect(LS_ADV_KEY).toBe('rclient_advanced_open');
    expect(LS_DEBUG_KEY).toBe('rclient_debug_visible');

    const keys = [LS_ID_KEY, LS_HBBS_KEY, LS_HBBR_KEY, LS_SRVKEY_KEY, LS_ADV_KEY, LS_DEBUG_KEY];
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('normalizeServerConfig', () => {
  it('returns undefined when every field is blank (gateway defaults apply)', () => {
    expect(normalizeServerConfig({})).toBeUndefined();
    expect(normalizeServerConfig({ hbbsHost: '', hbbrHost: '', serverKey: '' })).toBeUndefined();
    expect(normalizeServerConfig({ hbbsHost: '   ', hbbrHost: '\t', serverKey: '\n' })).toBeUndefined();
  });

  it('trims the values it keeps', () => {
    expect(
      normalizeServerConfig({
        hbbsHost: '  hbbs.example.com:21118 ',
        hbbrHost: ' hbbr.example.com:21119\t',
        serverKey: ' abc123 ',
      }),
    ).toEqual({
      hbbsHost: 'hbbs.example.com:21118',
      hbbrHost: 'hbbr.example.com:21119',
      serverKey: 'abc123',
    });
  });

  it('drops blank fields, keeps the filled-in ones and invents nothing else', () => {
    const cfg = normalizeServerConfig({ hbbsHost: 'only-hbbs.example.com', hbbrHost: '  ', serverKey: '' })!;
    expect(cfg).toEqual({ hbbsHost: 'only-hbbs.example.com' });
    expect(Object.keys(cfg)).toEqual(['hbbsHost']);
  });
});
