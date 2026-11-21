// What error does the gateway actually send for an unknown ID?
// Headless: drives the gateway WebSocket directly and prints the raw message,
// so the e2e assertion can match reality instead of a guess.
//
//   node e2e/offline-probe.mjs

import WebSocket from '../gateway/node_modules/ws/index.js';
import { startStack } from './stack.mjs';

let stack = null;
try {
  stack = await startStack({ startWeb: false, log: () => {} });

  const ws = new WebSocket(`${stack.gatewayUrl.replace('http', 'ws')}/ws`);
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });

  const messages = [];
  ws.on('message', (data, isBinary) => {
    if (isBinary) return;
    try { messages.push(JSON.parse(data.toString())); } catch { /* ignore */ }
  });

  const started = Date.now();
  ws.send(JSON.stringify({ type: 'connect', targetId: '999999999', password: 'whatever' }));

  while (!messages.some((m) => m.type === 'error') && Date.now() - started < 40_000) {
    await new Promise((r) => setTimeout(r, 100));
  }

  const elapsed = Date.now() - started;
  const error = messages.find((m) => m.type === 'error');
  console.log(`[offline-probe] first error after ${elapsed}ms`);
  console.log(`[offline-probe] message: ${JSON.stringify(error?.message)}`);
  console.log(`[offline-probe] all messages: ${JSON.stringify(messages.map((m) => m.type))}`);

  const text = error?.message ?? '';
  const matchesOfflineRule = /offline|id_not_exist|not available/i.test(text);
  console.log(`[offline-probe] errors.ts offline rule matches: ${matchesOfflineRule}`);
  console.log(`[offline-probe] expected title: ${matchesOfflineRule ? 'That machine is offline' : '(generic)'}`);

  ws.close();
  process.exit(matchesOfflineRule && elapsed < 15_000 ? 0 : 1);
} catch (e) {
  console.error(`[offline-probe] FAILED: ${e.message}`);
  process.exit(1);
} finally {
  await stack?.stop();
}
