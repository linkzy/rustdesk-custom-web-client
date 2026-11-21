import { describe, it, expect, afterEach } from 'vitest';
import { startFakeHost, type FakeHost } from './index';

let host: FakeHost | null = null;

afterEach(async () => {
  await host?.stop();
  host = null;
});

describe('ephemeral ports', () => {
  it('binds every listener on port 0 and reports the real ports', async () => {
    host = await startFakeHost({ hbbsPort: 0, hbbrPort: 0, controlPort: 0 });

    const hbbs = host.hbbsPort();
    const hbbr = host.hbbrPort();
    const control = host.actualControlPort();

    for (const port of [hbbs, hbbr, control]) {
      expect(port).toBeGreaterThan(0);
      expect(port).toBeLessThan(65536);
    }
    // Three independent listeners, so three different ports.
    expect(new Set([hbbs, hbbr, control]).size).toBe(3);
  }, 20000);

  it('serves the control API on the port it reports, and frees it on stop', async () => {
    host = await startFakeHost({ hbbsPort: 0, hbbrPort: 0, controlPort: 0 });
    const port = host.actualControlPort();

    const res = await fetch(`http://127.0.0.1:${port}/fake/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const stoppedPort = port;
    await host.stop();
    host = null;

    // After stop the port must refuse connections, or the next run collides.
    await expect(fetch(`http://127.0.0.1:${stoppedPort}/fake/health`)).rejects.toThrow();
  }, 20000);

  it('two instances can run side by side without colliding', async () => {
    const first = await startFakeHost({ hbbsPort: 0, hbbrPort: 0, controlPort: 0, id: '111111111' });
    host = await startFakeHost({ hbbsPort: 0, hbbrPort: 0, controlPort: 0, id: '222222222' });

    try {
      expect(first.actualControlPort()).not.toBe(host.actualControlPort());
      expect(first.hbbsPort()).not.toBe(host.hbbsPort());

      const a = await (await fetch(`http://127.0.0.1:${first.actualControlPort()}/fake/state`)).json() as any;
      const b = await (await fetch(`http://127.0.0.1:${host.actualControlPort()}/fake/state`)).json() as any;
      expect(a.id).toBe('111111111');
      expect(b.id).toBe('222222222');
    } finally {
      await first.stop();
    }
  }, 30000);
});
