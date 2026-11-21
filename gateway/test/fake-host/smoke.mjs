// Drives the real gateway exactly as the browser does, against the fake host.
//
//   node gateway/test/fake-host/smoke.mjs
//
// Requires: the fake host on 21118/21119/8081 and the gateway on 4000.
// Exits non-zero if the session never reaches video, if the first frame lacks a
// video marker, or if a click does not arrive at the host.

import WebSocket from 'ws';

const GATEWAY = process.env.GATEWAY_WS ?? 'ws://127.0.0.1:4000/ws';
const CONTROL = process.env.FAKE_CONTROL ?? 'http://127.0.0.1:8081';
const ID = process.env.FAKE_HOST_ID ?? '123456789';
const PASSWORD = process.env.FAKE_HOST_PASSWORD ?? 'demo';

const timeoutMs = 45000;
const deadline = Date.now() + timeoutMs;

function log(msg) {
  console.log(`[smoke] ${msg}`);
}

function fail(msg) {
  console.error(`[smoke] FAILED: ${msg}`);
  process.exit(1);
}

async function control(path, init) {
  const res = await fetch(`${CONTROL}${path}`, init);
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return res.json();
}

const ws = new WebSocket(GATEWAY);

const result = {
  connected: null,
  firstFrame: null,
  videoFrames: 0,
  keyframes: 0,
  audioFrames: 0,
  gwStats: [],
  errors: [],
};

ws.on('open', () => {
  log(`browser socket open → ${GATEWAY}`);
  ws.send(JSON.stringify({ type: 'connect', targetId: ID, password: PASSWORD }));
});

ws.on('message', async (data, isBinary) => {
  if (isBinary) {
    const buf = Buffer.from(data);
    const marker = buf[0];
    if (marker === 5) {
      result.audioFrames += 1;
      return;
    }
    if (result.firstFrame === null) {
      result.firstFrame = { marker, flag: buf[1], payloadBytes: buf.length - 2 };
      log(`first video packet: marker=${marker} keyframeFlag=${buf[1]} payload=${buf.length - 2} bytes`);
    }
    if (marker < 1 || marker > 4) fail(`unexpected frame marker ${marker}`);
    if (buf.length <= 2) fail('video frame has no payload');
    result.videoFrames += 1;
    if ((buf[1] & 1) === 1) result.keyframes += 1;
    return;
  }

  let msg;
  try {
    msg = JSON.parse(data.toString());
  } catch {
    return;
  }

  if (msg.type === 'connected') {
    result.connected = msg;
    log(`connected: ${msg.width}x${msg.height} codec=${msg.codec}`);
  } else if (msg.type === 'gw_stats') {
    result.gwStats.push(msg.gwFps);
  } else if (msg.type === 'error') {
    result.errors.push(msg.message);
    fail(`gateway error: ${msg.message}`);
  }
});

ws.on('error', (err) => fail(`browser socket error: ${err.message}`));

async function main() {
  // 1. Wait for the gateway to report the session as connected.
  while (!result.connected && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100));
    if (result.errors.length) fail(result.errors[0]);
  }
  if (!result.connected) fail('no "connected" message from the gateway');
  if (result.connected.width !== 640 || result.connected.height !== 360) {
    fail(`PeerInfo display ${result.connected.width}x${result.connected.height} != 640x360`);
  }

  // 2. Wait for a stream of video frames.
  while (result.videoFrames < 20 && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100));
  }
  if (result.videoFrames < 20) fail(`only ${result.videoFrames} video frames arrived`);
  if (!result.firstFrame) fail('no first frame recorded');
  if (result.firstFrame.marker !== 2) fail(`expected a VP9 marker (2), got ${result.firstFrame.marker}`);
  if (result.firstFrame.flag !== 1) fail('the first VP9 frame of the clip must be a keyframe');
  log(`received ${result.videoFrames} frames (${result.keyframes} keyframes)`);

  // 3. The host must have echoed our TestDelay (the gateway does that) so the
  //    gateway's delay estimate is live rather than 0.
  await new Promise((r) => setTimeout(r, 1500));
  const state = await control('/fake/state');
  if (state.session?.testDelayEchoes < 1) fail('the host never received a TestDelay echo');
  if (!state.session?.peerInfoSent) fail('the host never sent PeerInfo');
  log(`host state: passwordAccepted=${state.session.passwordAccepted} echoes=${state.session.testDelayEchoes} delay=${state.session.lastDelayMs}ms`);

  // 4. Send a click and prove it reached the host with the right coordinates.
  await control('/fake/events', { method: 'POST' });
  ws.send(JSON.stringify({ type: 'mouse', mask: 1, x: 100, y: 100 }));
  ws.send(JSON.stringify({ type: 'mouse', mask: 0, x: 100, y: 100 }));
  ws.send(JSON.stringify({ type: 'key', down: true, key: 'a', keyCode: 65 }));

  let events = [];
  while (events.length < 3 && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100));
    events = (await control('/fake/events')).events;
  }
  const mouseDown = events.find((e) => e.type === 'mouse' && e.detail.mask === 1);
  const mouseUp = events.find((e) => e.type === 'mouse' && e.detail.mask === 0);
  const key = events.find((e) => e.type === 'key');
  if (!mouseDown || mouseDown.detail.x !== 100 || mouseDown.detail.y !== 100) {
    fail(`click did not arrive with x=100 y=100: ${JSON.stringify(events)}`);
  }
  if (!mouseUp) fail('mouse release did not arrive');
  if (!key || key.detail.unicode !== 97) fail(`key 'a' did not arrive as unicode 97: ${JSON.stringify(key)}`);
  log(`host received ${events.length} input events; click at (${mouseDown.detail.x},${mouseDown.detail.y}), key unicode=${key.detail.unicode}`);

  // 5. Wrong password must be rejected by the host and surfaced by the gateway.
  ws.send(JSON.stringify({ type: 'disconnect' }));
  await new Promise((r) => setTimeout(r, 300));

  const bad = new WebSocket(GATEWAY);
  const badResult = await new Promise((resolve) => {
    const seen = { error: null };
    bad.on('open', () => bad.send(JSON.stringify({ type: 'connect', targetId: ID, password: 'wrong-password' })));
    bad.on('message', (data, isBinary) => {
      if (isBinary) return;
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'error') { seen.error = msg.message; resolve(seen); }
      } catch { /* ignore */ }
    });
    setTimeout(() => resolve(seen), 15000);
  });
  bad.close();
  if (!badResult.error) fail('a wrong password was not rejected');
  log(`wrong password rejected: "${badResult.error}"`);

  console.log('');
  console.log('[smoke] PASS');
  console.log(JSON.stringify({
    resolution: `${result.connected.width}x${result.connected.height}`,
    codec: result.connected.codec,
    videoFrames: result.videoFrames,
    keyframes: result.keyframes,
    audioFrames: result.audioFrames,
    gwFpsSamples: result.gwStats,
    hostDelayMs: state.session.lastDelayMs,
    inputEvents: events.length,
    wrongPasswordError: badResult.error,
  }, null, 2));
  ws.close();
  process.exit(0);
}

main().catch((e) => fail(e.message));
