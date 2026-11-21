import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startFakeHost, type FakeHost } from './index';
import { performRendezvous } from '../../src/rendezvous';

/**
 * Regression test for a bug the e2e suite found: on an OFFLINE reply the retry
 * path closed the hbbs socket before retrying, so the close handler rejected
 * with "hbbs closed connection unexpectedly (code=1005)". The user saw a generic
 * error instead of the friendly offline message, and the documented retry never
 * ran.
 *
 * performRendezvous is the real code the gateway uses; the fake hbbs answers
 * OFFLINE for any ID except its own, exactly like a real server.
 */

let host: FakeHost;

beforeAll(async () => {
  host = await startFakeHost({ id: '700000001', hbbsPort: 0, hbbrPort: 0, controlPort: 0 });
}, 30000);

afterAll(async () => {
  await host?.stop();
});

describe('rendezvous failure reporting', () => {
  it('reports an unknown peer as OFFLINE, not as a dropped connection', async () => {
    const serverConfig = {
      hbbsHost: `127.0.0.1:${host.hbbsPort()}`,
      hbbrHost: `127.0.0.1:${host.hbbrPort()}`,
    };

    // The retry runs up to 3 attempts with 2s between them, so allow for it.
    await expect(
      performRendezvous('999999999', 1, serverConfig),
    ).rejects.toThrow(/Peer not available: OFFLINE/);
  }, 30000);

  it('does not surface the socket-closed message for that case', async () => {
    const serverConfig = {
      hbbsHost: `127.0.0.1:${host.hbbsPort()}`,
      hbbrHost: `127.0.0.1:${host.hbbrPort()}`,
    };

    let message = '';
    try {
      await performRendezvous('999999999', 1, serverConfig);
    } catch (e) {
      message = (e as Error).message;
    }

    expect(message).not.toMatch(/closed connection unexpectedly/i);
    expect(message).toMatch(/offline|id_not_exist|not available/i);
  }, 30000);
});
