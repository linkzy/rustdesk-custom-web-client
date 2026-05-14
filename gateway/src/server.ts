import WebSocket, { WebSocketServer } from 'ws';
import path from 'path';
import * as dotenv from 'dotenv';
import { Session } from './session';
import { buildKeyPayload } from './utils/keymap';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const GATEWAY_PORT = parseInt(process.env.GATEWAY_PORT ?? '4000', 10);
const wss = new WebSocketServer({ port: GATEWAY_PORT });

console.log(`[gateway] Listening on ws://0.0.0.0:${GATEWAY_PORT}`);

wss.on('connection', (ws: WebSocket) => {
  console.log('[gateway] Browser connected');
  let session: Session | null = null;

  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === 'connect') {
        if (session) {
          session.disconnect();
        }
        session = new Session({
          targetId: msg.targetId,
          password: msg.password ?? '',
          browserWs: ws,
        });
        try {
          await session.connect();
        } catch (e: any) {
          console.error('[gateway] Session connect error:', e.message);
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'error', message: e.message }));
          }
          session = null;
        }
      } else if (msg.type === 'mouse') {
        session?.sendMessage({
          mouse_event: {
            mask: msg.mask ?? 0,
            x: msg.x ?? 0,
            y: msg.y ?? 0,
            modifiers: [],
          },
        });
      } else if (msg.type === 'key') {
        if (session) {
          const payload = buildKeyPayload({
            down: msg.down ?? true,
            key: msg.key ?? '',
            keyCode: msg.keyCode ?? 0,
            modifiers: msg.modifiers ?? [],
          });
          session.sendMessage(payload);
        }
      } else if (msg.type === 'disconnect') {
        session?.disconnect();
        session = null;
        ws.send(JSON.stringify({ type: 'disconnected' }));
      }
    } catch (e) {
      console.error('[gateway] Message error:', e);
    }
  });

  ws.on('close', () => {
    console.log('[gateway] Browser disconnected');
    session?.disconnect();
    session = null;
  });

  ws.on('error', (err) => {
    console.error('[gateway] WebSocket error:', err);
  });
});
