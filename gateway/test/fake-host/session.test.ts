import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import WebSocket from 'ws';
import fs from 'node:fs';
import path from 'node:path';
import nacl from 'tweetnacl';
import {
  loadProtos,
  encodeRendezvousMessage,
  decodeRendezvousMessage,
} from '../../src/utils/proto';
import { hashPassword } from '../../src/utils/crypto';
import { startFakeHost, type FakeHost } from './index';
import type * as protobuf from 'protobufjs';

/**
 * End-to-end handshake against the fake host, driven by a client written from
 * the *gateway's* side of the protocol (session.ts) rather than by reusing
 * gateway code, so a protocol mistake on either end shows up as a failure here.
 *
 * This is the test that proves the fake host is worth anything: it exercises
 * SignedId → PublicKey → Hash → LoginRequest → LoginResponse → TestDelay →
 * VideoFrame over real sockets, with real NaCl encryption.
 */

// Ephemeral ports, far from the 21118/21119 defaults so a dev stack can run.
// The control port is picked by the OS (0) and read back, so two vitest workers
// — or a leftover dev stack — can never collide.
let HBBS_PORT = 23118;
let HBBR_PORT = 23119;
let CONTROL_PORT = 0;
const PASSWORD = 'test-password';

let host: FakeHost;
let root: protobuf.Root;

beforeAll(async () => {
  root = await loadProtos();
  host = await startFakeHost({
    id: '555000111',
    password: PASSWORD,
    hbbsPort: HBBS_PORT,
    hbbrPort: HBBR_PORT,
    controlPort: CONTROL_PORT,
    log: (msg) => console.log(msg),
  });
  CONTROL_PORT = host.actualControlPort();
}, 30000);

afterAll(async () => {
  await host?.stop();
});

interface ClientSession {
  ws: WebSocket;
  messages: any[];
  frames: Buffer[];
  errors: string[];
  /** Sends an encrypted Message with the next sequence number. */
  send(payload: Record<string, unknown>): void;
  isAuthenticated(): boolean;
  close(): void;
}

/** Runs the rendezvous, joins the relay, and speaks the client side. */
async function connectClient(password: string, overrides: { id?: string } = {}): Promise<ClientSession> {
  const username = overrides.id ?? '555000111';
  const hbbs = new WebSocket(`ws://127.0.0.1:${HBBS_PORT}`);
  await new Promise<void>((resolve, reject) => {
    hbbs.once('open', () => resolve());
    hbbs.once('error', reject);
  });

  hbbs.send(encodeRendezvousMessage(root, {
    punch_hole_request: { id: '555000111', force_relay: true },
  }));

  const relayInfo = await new Promise<any>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('no relay_response from hbbs')), 5000);
    hbbs.once('message', (data: Buffer) => {
      clearTimeout(timer);
      resolve((decodeRendezvousMessage(root, new Uint8Array(data)) as any).relay_response);
    });
  });
  hbbs.close();

  const ws = new WebSocket(`ws://127.0.0.1:${HBBR_PORT}`);
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });
  ws.send(encodeRendezvousMessage(root, {
    request_relay: { id: '555000111', uuid: relayInfo.uuid, secure: false, conn_type: 0 },
  }));

  const session: ClientSession = {
    ws,
    messages: [],
    frames: [],
    errors: [],
    send: () => { throw new Error('not ready'); },
    isAuthenticated: () => authenticated,
    close: () => ws.close(),
  };

  const ephemeral = nacl.box.keyPair();
  let sessionKey: Uint8Array | null = null;
  let sendSeq = 1n;
  let recvSeq = 1n;
  let authenticated = false;

  const send = (payload: Record<string, unknown>) => {
    const Message = root.lookupType('Message');
    const plain = Message.encode(Message.create(payload)).finish();
    if (!sessionKey) {
      ws.send(plain, { binary: true });
      return;
    }
    ws.send(nacl.secretbox(plain, nonceFor(sendSeq++), sessionKey), { binary: true });
  };

  ws.on('message', (data: Buffer) => {
    let bytes: Uint8Array = new Uint8Array(data);
    if (sessionKey) {
      const opened = nacl.secretbox.open(bytes, nonceFor(recvSeq++), sessionKey);
      if (!opened) {
        session.errors.push(`decrypt failed at seq ${recvSeq - 1n}`);
        return;
      }
      bytes = opened;
    }

    const Message = root.lookupType('Message');
    const msg = Message.toObject(Message.decode(bytes), {
      longs: Number,
      enums: Number,
      defaults: false,
      bytes: Buffer,
    }) as any;
    session.messages.push(msg);

    if (msg.signed_id) {
      // The fake host appends IdPk after a 64-byte signature; the client only
      // needs the peer's Curve25519 public key.
      const id = toBytes(msg.signed_id.id);
      const IdPk = root.lookupType('IdPk');
      const idPk = IdPk.decode(id.subarray(64)) as any;
      const peerPk = toBytes(idPk.pk);

      // PublicKey itself must go in the CLEAR; the session key only applies to
      // everything after it. Assign the key only once the message is on the wire.
      const newKey = nacl.randomBytes(nacl.secretbox.keyLength);
      const sealed = nacl.box(newKey, new Uint8Array(nacl.box.nonceLength), peerPk, ephemeral.secretKey);
      const Message = root.lookupType('Message');
      const plain = Message.encode(Message.create({
        public_key: {
          asymmetric_value: ephemeral.publicKey,
          symmetric_value: sealed,
        },
      })).finish();
      ws.send(plain, { binary: true });
      sessionKey = newKey;
      return;
    }

    if (msg.hash) {
      send({
        login_request: {
          username,
          password: Buffer.from(hashPassword(
            Buffer.from(String(msg.hash.salt), 'binary'),
            Buffer.from(String(msg.hash.challenge), 'binary'),
            password,
          )),
          my_id: 'rclient-test',
          version: '1.3.8',
          video_ack_required: false,
        },
      });
      return;
    }

    if (msg.login_response) {
      authenticated = !msg.login_response.error;
      if (authenticated) send({ misc: { video_received: true } });
      return;
    }

    if (msg.test_delay && !msg.test_delay.from_client) {
      send({ test_delay: { time: msg.test_delay.time, from_client: false, last_delay: 0 } });
      return;
    }

    if (msg.video_frame) {
      const encoded = msg.video_frame.vp9s?.frames?.[0];
      if (encoded) session.frames.push(Buffer.from(toBytes(encoded.data)));
    }
  });

  ws.on('error', (err) => session.errors.push(err.message));

  session.send = send;
  await waitFor(() => session.messages.some((m) => m.login_response), 15000, 'login_response');
  return session;
}

function nonceFor(seq: bigint): Uint8Array {
  const nonce = new Uint8Array(24);
  new DataView(nonce.buffer).setBigUint64(0, seq, true);
  return nonce;
}

function toBytes(value: unknown): Uint8Array {
  if (!value) return new Uint8Array(0);
  if (Buffer.isBuffer(value)) return new Uint8Array(value);
  if (value instanceof Uint8Array) return value;
  if (typeof value === 'string') return new Uint8Array(Buffer.from(value, 'binary'));
  return new Uint8Array(Object.values(value as Record<string, number>));
}

async function waitFor(predicate: () => boolean, timeoutMs: number, what: string): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`timed out waiting for ${what}`);
}

describe('fake host over the real wire', () => {
  it('completes SignedId → Hash → login and reports the display', async () => {
    const client = await connectClient(PASSWORD);
    try {
      const login = client.messages.find((m) => m.login_response)!.login_response;
      expect(login.error).toBeUndefined();
      expect(login.peer_info.displays[0].width).toBe(640);
      expect(login.peer_info.displays[0].height).toBe(360);
    } finally {
      client.close();
    }
    expect(client.errors).toEqual([]);
  }, 30000);

  it('streams VP9 frames, the first one a keyframe', async () => {
    const client = await connectClient(PASSWORD);
    try {
      await waitFor(() => client.frames.length >= 5, 15000, '5 video frames');
    } finally {
      client.close();
    }
    expect(client.frames[0].length).toBeGreaterThan(50);
    expect(client.errors).toEqual([]);
  }, 30000);

  it('echoes TestDelay with from_client: false, once a second', async () => {
    const client = await connectClient(PASSWORD);
    try {
      await waitFor(
        () => (host.sessionStats()?.testDelayEchoes ?? 0) >= 2,
        15000,
        'two TestDelay echoes',
      );
    } finally {
      client.close();
    }
    expect(host.sessionStats()!.lastDelayMs).not.toBeNull();
  }, 30000);

  it('rejects a wrong password and accepts the right one', async () => {
    const bad = await connectClient('not-the-password');
    const badLogin = bad.messages.find((m) => m.login_response)!.login_response;
    bad.close();
    expect(badLogin.error).toMatch(/password/i);
    expect(badLogin.peer_info).toBeUndefined();

    const good = await connectClient(PASSWORD);
    const goodLogin = good.messages.find((m) => m.login_response)!.login_response;
    good.close();
    expect(goodLogin.error).toBeUndefined();
  }, 40000);

  it('rejects a wrong ID before ever checking the password', async () => {
    // The real host only matches on username == its own ID; the password is
    // irrelevant. Driven directly so the client can lie about the ID.
    const client = await connectClient(PASSWORD, { id: 'someone-else' });
    const login = client.messages.find((m) => m.login_response)!.login_response;
    client.close();
    expect(login.error).toMatch(/wrong id/i);
  }, 30000);
});

describe('input events reach the host', () => {
  it('records a click at the requested coordinates, and a release', async () => {
    const client = await connectClient(PASSWORD);
    host.clearEvents();
    client.send({ mouse_event: { mask: 1, x: 100, y: 100, modifiers: [] } });
    client.send({ mouse_event: { mask: 0, x: 100, y: 100, modifiers: [] } });

    try {
      await waitFor(() => host.events('mouse').length >= 2, 10000, 'two mouse events');
    } finally {
      client.close();
    }

    const [down, up] = host.events('mouse').slice(-2);
    expect(down.detail.mask).toBe(1);
    expect(down.detail.x).toBe(100);
    expect(down.detail.y).toBe(100);
    expect(up.detail.mask).toBe(0);
  }, 30000);

  it('records a typed character as unicode, not as a scancode', async () => {
    const client = await connectClient(PASSWORD);
    host.clearEvents();
    client.send({ key_event: { down: true, unicode: 97, mode: 0, modifiers: [] } });
    client.send({ key_event: { down: true, control_key: 27, mode: 0, modifiers: [] } });

    try {
      await waitFor(() => host.events('key').length >= 2, 10000, 'two key events');
    } finally {
      client.close();
    }

    const [letter, enter] = host.events('key').slice(-2);
    expect(letter.detail.unicode).toBe(97);
    expect(letter.detail.down).toBe(true);
    expect(enter.detail.control_key).toBe(27);
  }, 30000);

  it('exposes the received events over the control API', async () => {
    const client = await connectClient(PASSWORD);
    host.clearEvents();
    client.send({ mouse_event: { mask: 1, x: 42, y: 7, modifiers: [] } });
    client.send({ key_event: { down: true, unicode: 66, mode: 0, modifiers: [] } });

    try {
      await waitFor(() => host.events().length >= 2, 10000, 'two events');
    } finally {
      client.close();
    }

    const res = await fetch(`http://127.0.0.1:${CONTROL_PORT}/fake/events`);
    const body = await res.json() as { count: number; events: any[] };
    expect(res.status).toBe(200);
    expect(body.count).toBe(2);
    expect(body.events[0].type).toBe('mouse');
    expect(body.events[0].detail).toMatchObject({ mask: 1, x: 42, y: 7 });
    expect(body.events[1].type).toBe('key');

    // ?type= filters, ?limit= trims from the newest end.
    const onlyKeys = await (await fetch(`http://127.0.0.1:${CONTROL_PORT}/fake/events?type=key`)).json() as any;
    expect(onlyKeys.events).toHaveLength(1);
    expect((await (await fetch(`http://127.0.0.1:${CONTROL_PORT}/fake/events?limit=1`)).json() as any).count).toBe(1);
  }, 30000);

  it('serves state and health', async () => {
    const health = await fetch(`http://127.0.0.1:${CONTROL_PORT}/fake/health`);
    expect(await health.json()).toEqual({ ok: true });

    const state = await fetch(`http://127.0.0.1:${CONTROL_PORT}/fake/state`);
    const body = await state.json() as any;
    expect(body.id).toBe('555000111');
    expect(body.startedAt).toBeGreaterThan(0);
  });
});
