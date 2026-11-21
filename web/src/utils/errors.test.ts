import { describe, it, expect } from 'vitest';
import { friendlyError } from './errors';
import { catalogueFor, translate } from '../i18n';
import { AVAILABLE_LOCALES } from '../i18n';

// friendlyError returns message keys (the UI translates them), so these assert
// the key and then that every catalogue can actually render it.
describe('friendlyError', () => {
  it('maps a wrong password to a title key and a next-step key', () => {
    const e = friendlyError('Wrong password');
    expect(e.title).toBe('error.wrongPassword.title');
    expect(e.hint).toBe('error.wrongPassword.hint');
    expect(translate('en', e.hint)).toMatch(/rustdesk/i);
  });

  it('accepts the other capitalisation RustDesk uses', () => {
    expect(friendlyError('Wrong Password').title).toBe('error.wrongPassword.title');
  });

  it('reads the gateway offline hint', () => {
    const e = friendlyError(
      'Peer not available: OFFLINE — make sure the RustDesk app is running and connected to your server',
    );
    expect(e.title).toBe('error.offline.title');
  });

  it('separates a relay timeout from a refused connection', () => {
    expect(friendlyError('[rendezvous] Timeout').title).toBe('error.relayTimeout.title');
    expect(friendlyError('connect ECONNREFUSED 10.0.0.1:21118').title).toBe('error.relayUnreachable.title');
  });

  it('covers the browser-side failures', () => {
    expect(friendlyError('WebSocket connection failed').title).toBe('error.gateway.title');
    expect(friendlyError('Secure handshake failed').title).toBe('error.handshake.title');
  });

  it('falls back without inventing a cause', () => {
    for (const raw of ['', null, undefined, 'some unexpected gateway text']) {
      const e = friendlyError(raw);
      expect(e.title).toBe('error.generic.title');
      expect(e.hint).toBe('error.generic.hint');
    }
  });

  it('every error key it can return exists in every catalogue', () => {
    const titles = [
      'Wrong password',
      'captcha',
      'OFFLINE',
      'Timeout',
      'ECONNREFUSED',
      'Host closed',
      'WebSocket error',
      'Secure handshake failed',
      '',
    ];
    for (const raw of titles) {
      const e = friendlyError(raw);
      for (const locale of AVAILABLE_LOCALES) {
        const cat = catalogueFor(locale) as Record<string, string>;
        expect(cat[e.title], `${locale} ${e.title}`).toBeTruthy();
        expect(cat[e.hint], `${locale} ${e.hint}`).toBeTruthy();
      }
    }
  });
});
