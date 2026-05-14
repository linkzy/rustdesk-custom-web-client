import WebSocket from 'ws';
import { loadProtos, encodeRendezvousMessage } from './utils/proto';

export type MessageHandler = (data: Buffer) => void;

export class RelayConnection {
  private ws: WebSocket;
  private messageHandlers: MessageHandler[] = [];
  private pendingMessages: Buffer[] = [];

  constructor(ws: WebSocket) {
    this.ws = ws;
    this.ws.on('message', (data: Buffer) => {
      if (this.messageHandlers.length > 0) {
        this.messageHandlers.forEach((h) => h(data));
      } else {
        // Buffer messages until a handler is registered
        this.pendingMessages.push(data);
      }
    });
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandlers.push(handler);
    // Replay any buffered messages
    while (this.pendingMessages.length > 0) {
      handler(this.pendingMessages.shift()!);
    }
  }

  send(data: Uint8Array): void {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    } else {
      console.error('[relay] Cannot send: WebSocket not open');
    }
  }

  close(): void {
    this.ws.close();
  }
}

export async function connectRelay(
  targetId: string,
  relayServer: string,
  uuid: string
): Promise<RelayConnection> {
  // relayServer from hbbs is like "relay.example.com:21117"
  // Use WS port (21119) instead of TCP port (21117)
  const hbbr = process.env.HBBR_HOST ?? relayServer.split(':')[0];
  const hbbrPort = process.env.HBBR_WS_PORT ?? '21119';
  const url = `ws://${hbbr}:${hbbrPort}`;

  const root = await loadProtos();

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const relayConn = new RelayConnection(ws);

    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('[relay] Timeout connecting to hbbr'));
    }, 30000);

    ws.on('open', () => {
      console.log(`[relay] Connected to hbbr at ${url}`);

      // Send RequestRelay with the UUID coordinated through hbbs
      // hbbr will pair us with the peer when it also connects with the same UUID
      const payload = {
        request_relay: {
          uuid,
          id: targetId,
          relay_server: relayServer,
          secure: false,
          conn_type: 0,
        },
      };

      const encoded = encodeRendezvousMessage(root, payload);
      ws.send(encoded);
      console.log(`[relay] Sent RequestRelay uuid=${uuid} for peer=${targetId}`);

      clearTimeout(timeout);
      resolve(relayConn);
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`[relay] WebSocket error: ${err.message}`));
    });

    ws.on('close', (code, reason) => {
      console.log(`[relay] hbbr connection closed (code=${code}, reason="${reason.toString()}")`);
    });
  });
}
