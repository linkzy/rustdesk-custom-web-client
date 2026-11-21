// Full protocol run against the *real* gateway on protobufjs 8.x: starts the
// fake host + gateway, drives the browser WebSocket the way the app does, and
// asserts rendezvous, login, TestDelay echo, video frames, mouse and keyboard.
//
//   node test/fake-host/protocol-run.mjs
//
// This is the receipt for the 8.x bump: it proves the bumped encoder carries a
// whole session, not just that unit tests import cleanly.

import WebSocket from 'ws';
import { startStack } from '../../../e2e/stack.mjs';

function fail(msg) {
  console.error(`[proto-run] FAILED: ${msg}`);
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
  stack = await startStack({ startWeb: false, log: () => {} });
  console.log(`[proto-run] gateway ${stack.gatewayUrl}, fake host id ${stack.fakeHost.id}`);

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
      frames.push({ marker: buf[0], flag: buf[1], size: buf.length });
      return;
    }
    try { messages.push(JSON.parse(data.toString())); } catch { /* ignore */ }
  });

  // 1. Rendezvous + login: the gateway must report a connected session.
  ws.send(JSON.stringify({
    type: 'connect', targetId: stack.fakeHost.id, password: stack.fakeHost.password,
  }));
  await waitFor(() => messages.some((m) => m.type === 'connected'), 45_000, 'connected');
  const connected = messages.find((m) => m.type === 'connected');
  if (connected.width !== 640 || connected.height !== 360) {
    fail(`PeerInfo ${connected.width}x${connected.height}, expected 640x360`);
  }
  console.log(`[proto-run] rendezvous + login OK: ${connected.width}x${connected.height}`);

  // 2. TestDelay echo: the gateway must have echoed, which the fake host counts.
  await waitFor(async () => (await stack.control.state()).session?.testDelayEchoes >= 2, 20_000, 'TestDelay echoes');
  console.log('[proto-run] TestDelay echo OK (>= 2)');

  // 3. Video frames on the wire.
  await waitFor(() => frames.length >= 20, 30_000, '20 video frames');
  if (frames[0].marker !== 2) fail(`expected VP9 marker 2, got ${frames[0].marker}`);
  const keyframes = frames.filter((f) => (f.flag & 1) === 1).length;
  if (keyframes < 1) fail('no keyframe in the stream');
  console.log(`[proto-run] video OK: ${frames.length} frames, ${keyframes} keyframes, marker ${frames[0].marker}`);

  // 4. Mouse + keyboard must arrive at the host with the right payloads.
  await stack.control.clearEvents();
  ws.send(JSON.stringify({ type: 'mouse', mask: 9, x: 123, y: 234 }));
  ws.send(JSON.stringify({ type: 'key', down: true, key: 'a', keyCode: 65 }));
  ws.send(JSON.stringify({ type: 'key', down: true, key: 'Enter', keyCode: 13 }));

  await waitFor(async () => (await stack.control.events()).length >= 3, 20_000, '3 input events');
  const events = await stack.control.events();

  const mouse = events.find((e) => e.type === 'mouse');
  if (!mouse || mouse.detail.x !== 123 || mouse.detail.y !== 234 || mouse.detail.mask !== 9) {
    fail(`mouse event wrong: ${JSON.stringify(mouse)}`);
  }
  const keys = events.filter((e) => e.type === 'key');
  const letter = keys.find((k) => k.detail.unicode === 97);
  const enter = keys.find((k) => k.detail.control_key === 27);
  if (!letter) fail(`no unicode-97 key event: ${JSON.stringify(keys)}`);
  if (!enter) fail(`no control_key 27 key event: ${JSON.stringify(keys)}`);
  console.log(`[proto-run] input OK: mouse (${mouse.detail.x},${mouse.detail.y}) mask ${mouse.detail.mask}, unicode 97, control_key 27`);

  ws.close();

  const stats = (await stack.control.state()).session;
  console.log(`[proto-run] host saw ${stats.framesSent} frames, ${stats.testDelayEchoes} echoes, passwordAccepted=${stats.passwordAccepted}`);
  console.log('[proto-run] PASS');
  process.exit(0);
} catch (e) {
  console.error(`[proto-run] FAILED: ${e.message}`);
  process.exit(1);
} finally {
  await stack?.stop();
}
