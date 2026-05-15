import WebSocket, { WebSocketServer } from 'ws';
import path from 'path';
import * as dotenv from 'dotenv';
import { Session } from './session';
import { buildKeyPayload, MODIFIER_MAP } from './utils/keymap';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const GATEWAY_PORT = parseInt(process.env.GATEWAY_PORT ?? '4000', 10);
const wss = new WebSocketServer({ port: GATEWAY_PORT });

console.log(`[gateway] Listening on ws://0.0.0.0:${GATEWAY_PORT}`);

wss.on('connection', (ws: WebSocket) => {
  console.log('[gateway] Browser connected');
  let session: Session | null = null;

  const sendLog = (msg: string) => {
    console.log('[gw->browser]', msg);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'log', message: msg }));
    }
  };

  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === 'ping') {
        // Immediately echo timestamp back so browser can compute round-trip time
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'pong', ts: msg.ts }));
        }
      } else if (msg.type === 'connect') {
        if (session) session.disconnect();
        session = new Session({
          targetId: msg.targetId,
          password: msg.password ?? '',
          browserWs: ws,
        });
        try {
          await session.connect();
        } catch (e: any) {
          console.error('[gateway] Session connect error:', e.message);
          sendLog(`connect error: ${e.message}`);
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'error', message: e.message }));
          }
          session = null;
        }
      } else if (msg.type === 'mouse') {
        if (!session) { sendLog('mouse: no session'); return; }
        try {
          const modifiers = ((msg.modifiers ?? []) as string[])
            .map((m) => MODIFIER_MAP[m])
            .filter((v): v is number => v !== undefined);
          session.sendMessage({
            mouse_event: {
              mask: msg.mask ?? 0,
              x: msg.x ?? 0,
              y: msg.y ?? 0,
              modifiers,
            },
          });
        } catch (e: any) {
          sendLog(`mouse encode error: ${e.message}`);
        }
      } else if (msg.type === 'key') {
        if (!session) { sendLog('key: no session'); return; }
        try {
          const payload = buildKeyPayload({
            down: msg.down ?? true,
            key: msg.key ?? '',
            keyCode: msg.keyCode ?? 0,
            modifiers: msg.modifiers ?? [],
          });
          sendLog(`key down=${msg.down} key="${msg.key}" → ${JSON.stringify(payload.key_event)}`);
          session.sendMessage(payload);
        } catch (e: any) {
          sendLog(`key encode error: ${e.message}`);
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
