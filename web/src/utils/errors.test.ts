import { describe, it, expect } from 'vitest';
import { friendlyError } from './errors';

describe('friendlyError', () => {
  it('maps a wrong password to a title and a next step', () => {
    const e = friendlyError('Wrong password');
    expect(e.title).toBe('Wrong password');
    expect(e.hint).toMatch(/rustdesk/i);
  });

  it('accepts the other capitalisation RustDesk uses', () => {
    expect(friendlyError('Wrong Password').title).toBe('Wrong password');
  });

  it('reads the gateway offline hint', () => {
    const e = friendlyError(
      'Peer not available: OFFLINE — make sure the RustDesk app is running and connected to your server',
    );
    expect(e.title).toMatch(/offline/i);
  });

  it('separates a relay timeout from a refused connection', () => {
    expect(friendlyError('[rendezvous] Timeout').title).toMatch(/did not answer/i);
    expect(friendlyError('connect ECONNREFUSED 10.0.0.1:21118').title).toMatch(/could not reach the relay/i);
  });

  it('covers the browser-side failures', () => {
    expect(friendlyError('WebSocket connection failed').title).toMatch(/gateway/i);
    expect(friendlyError('Secure handshake failed').title).toMatch(/handshake/i);
  });

  it('falls back without inventing a cause', () => {
    for (const raw of ['', null, undefined, 'some unexpected gateway text']) {
      const e = friendlyError(raw);
      expect(e.title).toBe('Connection failed');
      expect(e.hint.length).toBeGreaterThan(0);
    }
  });
});
