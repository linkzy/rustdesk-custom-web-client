import http from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import {
  loadProtos,
  encodeRendezvousMessage,
  decodeRendezvousMessage,
} from '../../src/utils/proto';
import type * as protobuf from 'protobufjs';

export interface FakeServersOptions {
  /** RustDesk ID the fake host answers to. */
  id: string;
  hbbsPort: number;
  hbbrPort: number;
  /** Deterministic public key advertised in relay_response. */
  peerPk: Uint8Array;
  log: (msg: string) => void;
}

export interface RelayPair {
  uuid: string;
  /** Relay-side socket for the peer; it *receives* what the peer sends. */
  peer: WebSocket;
  /** Relay-side socket for the gateway; it *receives* what the gateway sends. */
  gateway: WebSocket;
  /**
   * The peer's own client socket (the one `connectPeer` opened). This is the
   * socket the fake host must speak on: writing to the relay-side `peer` socket
   * would send bytes *to* the host instead of forwarding them to the gateway.
   */
  peerClient: WebSocket | null;
}

/**
 * Test-only marker in RequestRelay.token that tells the fake relay which side
 * of a UUID is the host. A real hbbr knows this from its own registration
 * table; the fake host has no such table, and pairing by arrival order would
 * silently attach the "host" to the gateway's own socket whenever the gateway
 * connects first. The gateway never sets `token`, so this cannot collide.
 */
export const PEER_TOKEN = 'fake-host-peer';

interface WaitingSlot {
  peer: WebSocket | null;
  gateway: WebSocket | null;
}

/**
 * Fake hbbs + hbbr in one process.
 *
 * - hbbs (rendezvous): answers a PunchHoleRequest with a relay_response, the
 *   same message a current RustDesk server sends when force_relay is set.
 * - hbbr (relay): pairs two WebSocket clients by the UUID from their
 *   RequestRelay and then forwards raw bytes between them. It never decodes
 *   those bytes: after the handshake they are NaCl-secretbox encrypted, exactly
 *   as with the real relay.
 *
 * The fake host side connects to hbbr in-process right after hbbs allocates the
 * UUID, which mimics "hbbs already told the peer to connect to hbbr".
 */
export class FakeServers {
  private readonly opts: FakeServersOptions;
  private root: protobuf.Root | null = null;

  private hbbsServer: http.Server | null = null;
  private hbbrServer: http.Server | null = null;
  private hbbsWss: WebSocketServer | null = null;
  private hbbrWss: WebSocketServer | null = null;

  /** uuid → the connections waiting for their partner. */
  private readonly waiting = new Map<string, WaitingSlot>();
  /** The peer's own client socket for a UUID, once it has joined the relay. */
  private readonly peerClients = new Map<string, WebSocket>();

  private sessionCounter = 0;

  /** Called when hbbs has allocated a UUID; the host connects to hbbr with it. */
  onRelayAssigned: ((uuid: string, relayServer: string) => void) | null = null;
  /** Called once both sides of a UUID are connected to hbbr. */
  onPaired: ((pair: RelayPair) => void) | null = null;

  constructor(opts: FakeServersOptions) {
    this.opts = opts;
  }

  async start(): Promise<void> {
    this.root = await loadProtos();
    await Promise.all([this.startHbbs(), this.startHbbr()]);
  }

  /** Port hbbs actually bound (resolved when configured as 0). */
  hbbsPort(): number {
    return boundPort(this.hbbsServer, this.opts.hbbsPort);
  }

  /** Port hbbr actually bound (resolved when configured as 0). */
  hbbrPort(): number {
    return boundPort(this.hbbrServer, this.opts.hbbrPort);
  }

  private async startHbbs(): Promise<void> {
    const server = http.createServer((_req, res) => {
      res.writeHead(404);
      res.end();
    });
    this.hbbsServer = server;
    const wss = new WebSocketServer({ server });
    this.hbbsWss = wss;

    wss.on('connection', (ws: WebSocket) => {
      this.opts.log('[hbbs] connection from rendezvous client');
      ws.on('message', (data: Buffer) => {
        try {
          const msg = decodeRendezvousMessage(this.root!, new Uint8Array(data)) as any;

          if (msg.punch_hole_request) {
            const req = msg.punch_hole_request;
            this.opts.log(`[hbbs] PunchHoleRequest id=${req.id} force_relay=${req.force_relay}`);

            if (String(req.id) !== this.opts.id) {
              // A real hbbs reports a peer that is not registered as OFFLINE
              // (enum Failure.OFFLINE = 2). Numeric, because RendezvousMessage
              // .verify() rejects the enum *name*.
              ws.send(this.encode({
                punch_hole_response: { failure: 2, other_failure: `unknown id ${req.id}` },
              }));
              this.opts.log(`[hbbs] unknown peer ${req.id} → OFFLINE`);
              return;
            }

            const uuid = `fake-session-${++this.sessionCounter}`;
            const relayServer = `127.0.0.1:${this.hbbrPort()}`;
            ws.send(this.encode({
              relay_response: {
                uuid,
                relay_server: relayServer,
                pk: Buffer.from(this.opts.peerPk),
              },
            }));
            this.opts.log(`[hbbs] relay_response uuid=${uuid} relay=${relayServer}`);

            // In a real deployment hbbs notifies the peer; here the peer lives
            // in this process, so we ask it to join the relay with that UUID.
            this.onRelayAssigned?.(uuid, relayServer);
            return;
          }

          if (msg.request_relay) {
            // The older hbbs flow: the client reports back which relay it uses.
            this.opts.log(`[hbbs] RequestRelay uuid=${msg.request_relay.uuid} (ignored)`);
          }
        } catch (e) {
          this.opts.log(`[hbbs] decode error: ${(e as Error).message}`);
        }
      });
    });

    await listen(server, this.opts.hbbsPort);
    this.opts.log(`[hbbs] listening on ws://127.0.0.1:${this.opts.hbbsPort}`);
  }

  private async startHbbr(): Promise<void> {
    const server = http.createServer((_req, res) => {
      res.writeHead(404);
      res.end();
    });
    this.hbbrServer = server;
    const wss = new WebSocketServer({ server });
    this.hbbrWss = wss;

    wss.on('connection', (ws: WebSocket) => {
      let uuid: string | null = null;

      // The first frame is the plaintext RequestRelay; everything after it is
      // opaque session traffic and is forwarded untouched.
      const onFirst = (data: Buffer) => {
        try {
          const msg = decodeRendezvousMessage(this.root!, new Uint8Array(data)) as any;
          if (!msg.request_relay) {
            this.opts.log('[hbbr] first message was not RequestRelay');
            ws.close();
            return;
          }
          uuid = String(msg.request_relay.uuid);
          const isPeer = String(msg.request_relay.token ?? '') === PEER_TOKEN;
          ws.off('message', onFirst);
          this.opts.log(`[hbbr] RequestRelay uuid=${uuid} id=${msg.request_relay.id} side=${isPeer ? 'peer' : 'gateway'}`);

          const slot = this.waiting.get(uuid) ?? { peer: null, gateway: null };
          if (isPeer) slot.peer = ws;
          else slot.gateway = ws;

          const onWaitingClose = () => {
            const current = this.waiting.get(uuid!);
            if (!current) return;
            if (current.peer === ws) current.peer = null;
            if (current.gateway === ws) current.gateway = null;
            if (!current.peer && !current.gateway) this.waiting.delete(uuid!);
          };
          ws.on('close', onWaitingClose);

          if (!slot.peer || !slot.gateway) {
            this.waiting.set(uuid, slot);
            return;
          }

          // Both sides are here: stop tracking them as waiting and forwards.
          this.waiting.delete(uuid);
          const paired = pairUp(uuid, slot.peer, slot.gateway);
          this.opts.log(`[hbbr] paired uuid=${uuid}`);
          this.onPaired?.({ ...paired, peerClient: this.peerClients.get(uuid) ?? null });
        } catch (e) {
          this.opts.log(`[hbbr] decode error: ${(e as Error).message}`);
          ws.close();
        }
      };
      ws.on('message', onFirst);

      ws.on('close', () => {
        if (uuid) {
          this.peerClients.delete(uuid);
          this.opts.log(`[hbbr] connection closed uuid=${uuid}`);
        }
      });
    });

    await listen(server, this.opts.hbbrPort);
    this.opts.log(`[hbbr] listening on ws://127.0.0.1:${this.hbbrPort()}`);
  }

  /** Opens the peer side of the relay connection for an allocated UUID. */
  connectPeer(uuid: string): Promise<WebSocket> {
    const url = `ws://127.0.0.1:${this.hbbrPort()}`;
    const ws = new WebSocket(url);
    this.peerClients.set(uuid, ws);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('[peer] timeout joining the relay'));
      }, 10000);

      ws.on('open', () => {
        ws.send(this.encode({
          request_relay: {
            id: this.opts.id,
            uuid,
            relay_server: `127.0.0.1:${this.hbbrPort()}`,
            secure: false,
            conn_type: 0,
            token: PEER_TOKEN,
          },
        }));
        clearTimeout(timeout);
        this.opts.log(`[peer] joined relay with uuid=${uuid}`);
        resolve(ws);
      });

      ws.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  private encode(payload: Record<string, unknown>): Uint8Array {
    return encodeRendezvousMessage(this.root!, payload);
  }

  async stop(): Promise<void> {
    for (const client of this.peerClients.values()) client.terminate();
    this.peerClients.clear();
    this.waiting.clear();

    const close = (wss: WebSocketServer | null) => new Promise<void>((resolve) => {
      if (!wss) return resolve();
      for (const client of wss.clients) client.terminate();
      wss.close(() => resolve());
    });
    await Promise.all([close(this.hbbsWss), close(this.hbbrWss)]);

    const closeHttp = (s: http.Server | null) => new Promise<void>((resolve) => {
      if (!s) return resolve();
      s.close(() => resolve());
    });
    await Promise.all([closeHttp(this.hbbsServer), closeHttp(this.hbbrServer)]);

    this.hbbsWss = null;
    this.hbbrWss = null;
    this.hbbsServer = null;
    this.hbbrServer = null;
  }
}

/** Wires two relay clients together and forwards every frame both ways. */
function pairUp(uuid: string, a: WebSocket, b: WebSocket): RelayPair {
  const forward = (to: WebSocket) => (data: Buffer) => {
    if (to.readyState === WebSocket.OPEN) to.send(data, { binary: true });
  };
  // Each side already has a 'message' listener: the relay's own onFirst was
  // removed when the RequestRelay arrived, and the live traffic handler (host
  // session or test client) is attached to the same socket. Forwarding must
  // therefore *add* a listener, not replace one.
  a.on('message', forward(b));
  b.on('message', forward(a));
  const onClose = () => {
    if (a.readyState === WebSocket.OPEN) a.close();
    if (b.readyState === WebSocket.OPEN) b.close();
  };
  a.on('close', onClose);
  b.on('close', onClose);

  return { uuid, peer: a, gateway: b, peerClient: null };
}

function listen(server: http.Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
}

/** The port a server actually bound; falls back to the configured one. */
function boundPort(server: http.Server | null, fallback: number): number {
  const address = server?.address();
  if (address && typeof address === 'object') return address.port;
  return fallback;
}
