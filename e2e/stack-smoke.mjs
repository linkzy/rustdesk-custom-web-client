// Smoke-check for the e2e stack helper: no browser involved, just proves that
// the fake host, the gateway and the teardown behave.
//
//   node e2e/stack-smoke.mjs
//
// It starts the stack, drives the gateway's WebSocket exactly as the browser
// does, asserts a real session, then stops everything and checks that the
// ports are free again.

import WebSocket from '../gateway/node_modules/ws/index.js';
import { startStack } from './stack.mjs';
import net from 'node:net';

function fail(msg, extra) {
  console.error(`[stack-smoke] FAILED: ${msg}`);
  if (extra) console.error(extra);
  process.exit(1);
}

async function waitFor(predicate, ms, what) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`timed out waiting for ${what}`);
}

/** True when nothing is listening on the port. */
function portFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
  });
}

let stack = null;

try {
  stack = await startStack({ startWeb: false, log: (m) => console.log(m) });
  console.log(`[stack-smoke] gateway at ${stack.gatewayUrl}, fake host id ${stack.fakeHost.id}`);

  const frames = [];
  const messages = [];
  const ws = new WebSocket(`${stack.gatewayUrl.replace('http', 'ws')}/ws`);

  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });

  ws.on('message', (data, isBinary) => {
    if (isBinary) {
      const buf = Buffer.from(data);
      if (buf[0] !== 5) frames.push({ marker: buf[0], flag: buf[1], size: buf.length });
      return;
    }
    try {
      messages.push(JSON.parse(data.toString()));
    } catch { /* ignore */ }
  });

  ws.send(JSON.stringify({
    type: 'connect',
    targetId: stack.fakeHost.id,
    password: stack.fakeHost.password,
  }));

  await waitFor(() => messages.some((m) => m.type === 'connected'), 30_000, 'connected');
  const connected = messages.find((m) => m.type === 'connected');
  if (connected.width !== 640 || connected.height !== 360) {
    fail(`resolution ${connected.width}x${connected.height} != 640x360`);
  }

  await waitFor(() => frames.length >= 10, 30_000, '10 video frames');
  if (frames[0].marker !== 2) fail(`expected VP9 marker 2, got ${frames[0].marker}`);
  if (frames[0].flag !== 1) fail('first frame must be a keyframe');

  await stack.control.clearEvents();
  ws.send(JSON.stringify({ type: 'mouse', mask: 1, x: 321, y: 123 }));
  ws.send(JSON.stringify({ type: 'key', down: true, key: 'q', keyCode: 81 }));

  await waitFor(async () => (await stack.control.events()).length >= 2, 15_000, 'two input events');
  const events = await stack.control.events();
  const click = events.find((e) => e.type === 'mouse');
  if (click?.detail.x !== 321 || click?.detail.y !== 123) {
    fail(`click arrived as ${JSON.stringify(click)}`);
  }

  console.log(`[stack-smoke] connected ${connected.width}x${connected.height}, ${frames.length} frames, click at (${click.detail.x},${click.detail.y})`);
  ws.close();

  // Failure path: a wrong password must be refused by the host.
  const bad = new WebSocket(`${stack.gatewayUrl.replace('http', 'ws')}/ws`);
  const badError = await new Promise((resolve) => {
    bad.on('open', () => bad.send(JSON.stringify({
      type: 'connect', targetId: stack.fakeHost.id, password: 'wrong',
    })));
    bad.on('message', (data, isBinary) => {
      if (isBinary) return;
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'error') resolve(msg.message);
      } catch { /* ignore */ }
    });
    setTimeout(() => resolve(null), 20_000);
  });
  bad.close();
  if (!badError) fail('wrong password was not rejected');
  console.log(`[stack-smoke] wrong password rejected: "${badError}"`);

  const ports = [stack.fakeHost.hbbsPort, stack.fakeHost.hbbrPort, stack.fakeHost.controlPort];
  const gatewayPort = Number(new URL(stack.gatewayUrl).port);
  await stack.stop();
  stack = null;

  await new Promise((r) => setTimeout(r, 1500));
  for (const port of [...ports, gatewayPort]) {
    if (!(await portFree(port))) fail(`port ${port} still listening after stop()`);
  }
  console.log('[stack-smoke] teardown clean: every port is free');
  console.log('[stack-smoke] PASS');
  process.exit(0);
} catch (e) {
  console.error(`[stack-smoke] FAILED: ${e.message}`);
  if (stack) await stack.stop().catch(() => {});
  process.exit(1);
}
