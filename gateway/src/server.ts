import http from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import path from 'path';
import * as dotenv from 'dotenv';
import { Session } from './session';
import { buildKeyPayload, MODIFIER_MAP } from './utils/keymap';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const GATEWAY_PORT      = parseInt(process.env.GATEWAY_PORT ?? '4000', 10);
const CAPTCHA_ENABLED   = process.env.CAPTCHA_ENABLED === 'true';
const HCAPTCHA_SECRET   = process.env.HCAPTCHA_SECRET_KEY ?? '';
const HCAPTCHA_SITE_KEY = process.env.HCAPTCHA_SITE_KEY ?? '';

// Verify an hCaptcha token against the hCaptcha API
async function verifyCaptcha(token: string): Promise<boolean> {
  try {
    const body = new URLSearchParams({ secret: HCAPTCHA_SECRET, response: token });
    const res = await fetch('https://api.hcaptcha.com/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const json = await res.json() as { success: boolean };
    return json.success === true;
  } catch (e) {
    console.error('[gateway] hCaptcha verification error:', e);
    return false;
  }
}

// Shared HTTP server — handles both /config (HTTP) and /ws (WebSocket upgrade)
const httpServer = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/config') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(JSON.stringify({
      captchaEnabled: CAPTCHA_ENABLED,
      hcaptchaSiteKey: CAPTCHA_ENABLED ? HCAPTCHA_SITE_KEY : '',
    }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server: httpServer });
httpServer.listen(GATEWAY_PORT, () => {
  console.log(`[gateway] Listening on port ${GATEWAY_PORT} (captcha=${CAPTCHA_ENABLED})`);
});

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
        // If captcha is enabled, verify token before allowing connection
        if (CAPTCHA_ENABLED) {
          const token = msg.captchaToken ?? '';
          if (!token) {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'error', message: 'CAPTCHA required' }));
            }
            return;
          }
          const valid = await verifyCaptcha(token);
          if (!valid) {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'error', message: 'CAPTCHA verification failed' }));
            }
            return;
          }
        }
        if (session) session.disconnect();
        session = new Session({
          targetId: msg.targetId,
          password: msg.password ?? '',
          browserWs: ws,
          serverConfig: msg.serverConfig,
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
          if (!payload) return; // Dead / Unidentified / unsupported key — skip
          // Disabled: verbose keystroke log (was sendLog). Restore for debugging keyboard input issues / shortcuts.
          // sendLog(`key down=${msg.down} key="${msg.key}" → ${JSON.stringify(payload.key_event)}`);
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
