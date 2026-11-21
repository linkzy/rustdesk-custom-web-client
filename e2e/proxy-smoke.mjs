// Proves the e2e serving path without a browser: builds nothing, launches no
// page, and drives the gateway WebSocket through e2e/serve.mjs exactly as the
// app would. This is the check that would have caught the proxy target being
// aimed at the wrong port before any Chromium was started.
//
//   node e2e/proxy-smoke.mjs

import WebSocket from '../gateway/node_modules/ws/index.js';
import { startStack } from './stack.mjs';

function fail(msg, extra) {
  console.error(`[proxy-smoke] FAILED: ${msg}`);
  if (extra) console.error(extra);
  process.exit(1);
}

async function waitFor(fn, ms, what) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`timed out waiting for ${what}`);
}

let stack = null;
try {
  stack = await startStack({ startWeb: true, log: (m) => console.log(m) });

  // 1. The built app is served from the stack's own port.
  const index = await fetch(`${stack.appUrl}/`);
  if (!index.ok) fail(`app root returned HTTP ${index.status}`);
  const html = await index.text();
  if (!/<div id="root"|<script/i.test(html)) fail('app root does not look like the built index.html');

  // 2. /config is proxied to the gateway, not answered by the static server.
  const config = await fetch(`${stack.appUrl}/config`);
  if (!config.ok) fail(`/config returned HTTP ${config.status}`);
  const cfg = await config.json();
  if (typeof cfg.captchaEnabled !== 'boolean') fail(`/config body looks wrong: ${JSON.stringify(cfg)}`);

  // 3. /ws is proxied end to end: a real session through the app's own origin.
  const ws = new WebSocket(`${stack.appUrl.replace('http', 'ws')}/ws`);
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });

  const messages = [];
  const frames = [];
  ws.on('message', (data, isBinary) => {
    if (isBinary) {
      const buf = Buffer.from(data);
      if (buf[0] !== 5) frames.push(buf[0]);
      return;
    }
    try { messages.push(JSON.parse(data.toString())); } catch { /* ignore */ }
  });

  ws.send(JSON.stringify({
    type: 'connect',
    targetId: stack.fakeHost.id,
    password: stack.fakeHost.password,
  }));

  await waitFor(() => messages.some((m) => m.type === 'connected'), 30_000, 'connected via the proxy');
  await waitFor(() => frames.length >= 10, 30_000, '10 frames via the proxy');

  const connected = messages.find((m) => m.type === 'connected');
  console.log(`[proxy-smoke] /ws proxy works: ${connected.width}x${connected.height}, ${frames.length} frames, markers ${[...new Set(frames)].join(',')}`);
  ws.close();

  console.log('[proxy-smoke] PASS');
  process.exit(0);
} catch (e) {
  console.error(`[proxy-smoke] FAILED: ${e.message}`);
  process.exit(1);
} finally {
  await stack?.stop();
}
