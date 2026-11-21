import { describe, it, expect, afterEach } from 'vitest';
import WebSocket from 'ws';
import { FakeServers, PEER_TOKEN, type FakeServersOptions } from './servers';
import { loadProtos, encodeRendezvousMessage, decodeRendezvousMessage } from '../../src/utils/proto';
import { deterministicKeypair } from './config';

let servers: FakeServers | null = null;

afterEach(async () => {
  await servers?.stop();
  servers = null;
});

function pick(port: number): FakeServersOptions {
  return {
    id: '900001',
    hbbsPort: port,
    hbbrPort: port + 1,
    peerPk: deterministicKeypair(1).publicKey,
    log: () => {},
  };
}

function open(url: string): Promise<WebSocket> {
  const ws = new WebSocket(url);
  return new Promise((resolve, reject) => {
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}

function nextMessage(ws: WebSocket, timeoutMs = 5000): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out waiting for a message')), timeoutMs);
    ws.once('message', (data: Buffer) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

describe('fake hbbs', () => {
  it('answers a known PunchHoleRequest with relay_response + the peer public key', async () => {
    const opts = pick(22118);
    servers = new FakeServers(opts);
    await servers.start();

    const root = await loadProtos();
    const ws = await open(`ws://127.0.0.1:${opts.hbbsPort}`);
    ws.send(encodeRendezvousMessage(root, {
      punch_hole_request: { id: opts.id, force_relay: true },
    }));

    const decoded = decodeRendezvousMessage(root, new Uint8Array(await nextMessage(ws))) as any;
    ws.close();

    expect(decoded.relay_response).toBeTruthy();
    expect(decoded.relay_response.uuid).toBe('fake-session-1');
    expect(decoded.relay_response.relay_server).toBe(`127.0.0.1:${opts.hbbrPort}`);
    // bytes come back as a binary string: it must be the 32-byte Curve25519 key.
    expect(Buffer.from(decoded.relay_response.pk, 'binary')).toHaveLength(32);
  });

  it('reports an unknown ID as OFFLINE, like a real hbbs', async () => {
    const opts = pick(22120);
    servers = new FakeServers(opts);
    await servers.start();

    const root = await loadProtos();
    const ws = await open(`ws://127.0.0.1:${opts.hbbsPort}`);
    ws.send(encodeRendezvousMessage(root, {
      punch_hole_request: { id: 'some-other-machine', force_relay: true },
    }));

    const decoded = decodeRendezvousMessage(root, new Uint8Array(await nextMessage(ws))) as any;
    ws.close();

    expect(decoded.punch_hole_response.failure).toBe('OFFLINE');
    expect(decoded.punch_hole_response.other_failure).toContain('some-other-machine');
    expect(decoded.relay_response).toBeUndefined();
  });
});

describe('fake hbbr', () => {
  it('pairs two clients by UUID and forwards bytes in both directions', async () => {
    const opts = pick(22122);
    servers = new FakeServers(opts);
    await servers.start();

    const root = await loadProtos();
    // The peer side goes first on purpose: pairing must not depend on order.
    const peer = await open(`ws://127.0.0.1:${opts.hbbrPort}`);
    peer.send(encodeRendezvousMessage(root, {
      request_relay: { uuid: 'pair-test', id: opts.id, token: PEER_TOKEN },
    }));
    const gateway = await open(`ws://127.0.0.1:${opts.hbbrPort}`);
    gateway.send(encodeRendezvousMessage(root, {
      request_relay: { uuid: 'pair-test', id: opts.id },
    }));

    await new Promise((r) => setTimeout(r, 200));

    peer.send(Buffer.from('hello from the fake host'));
    const toGateway = await nextMessage(gateway);
    expect(toGateway.toString()).toBe('hello from the fake host');

    gateway.send(Buffer.from('hello from the gateway'));
    const toPeer = await nextMessage(peer);
    expect(toPeer.toString()).toBe('hello from the gateway');

    peer.close();
    gateway.close();
  });

  it('keeps different UUIDs apart', async () => {
    const opts = pick(22124);
    servers = new FakeServers(opts);
    await servers.start();

    const root = await loadProtos();
    const peerA = await open(`ws://127.0.0.1:${opts.hbbrPort}`);
    peerA.send(encodeRendezvousMessage(root, { request_relay: { uuid: 'a', token: PEER_TOKEN } }));
    const gatewayA = await open(`ws://127.0.0.1:${opts.hbbrPort}`);
    gatewayA.send(encodeRendezvousMessage(root, { request_relay: { uuid: 'a' } }));

    const peerB = await open(`ws://127.0.0.1:${opts.hbbrPort}`);
    peerB.send(encodeRendezvousMessage(root, { request_relay: { uuid: 'b', token: PEER_TOKEN } }));
    const gatewayB = await open(`ws://127.0.0.1:${opts.hbbrPort}`);
    gatewayB.send(encodeRendezvousMessage(root, { request_relay: { uuid: 'b' } }));

    await new Promise((r) => setTimeout(r, 200));

    peerA.send(Buffer.from('for A'));
    expect((await nextMessage(gatewayA)).toString()).toBe('for A');

    peerB.send(Buffer.from('for B'));
    expect((await nextMessage(gatewayB)).toString()).toBe('for B');

    peerA.close();
    peerB.close();
    gatewayA.close();
    gatewayB.close();
  });

  it('pairs in either arrival order (gateway first, then peer)', async () => {
    const opts = pick(22126);
    servers = new FakeServers(opts);
    await servers.start();

    const root = await loadProtos();
    const gateway = await open(`ws://127.0.0.1:${opts.hbbrPort}`);
    gateway.send(encodeRendezvousMessage(root, { request_relay: { uuid: 'reverse' } }));

    const peer = await open(`ws://127.0.0.1:${opts.hbbrPort}`);
    peer.send(encodeRendezvousMessage(root, { request_relay: { uuid: 'reverse', token: PEER_TOKEN } }));

    await new Promise((r) => setTimeout(r, 200));

    peer.send(Buffer.from('peer first'));
    expect((await nextMessage(gateway)).toString()).toBe('peer first');

    gateway.close();
    peer.close();
  });
});
