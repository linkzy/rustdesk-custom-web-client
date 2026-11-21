// Drives real Chrome over the DevTools protocol to prove the actual web UI
// renders frames from the fake host through the real gateway.
//
//   node gateway/test/fake-host/browser-check.mjs <screenshot.png>
//
// Needs: fake host (21118/21119/8081), gateway (4000), web dev server (5173),
// and a Chrome/Edge binary. No Playwright: CDP over ws is enough.

import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const WebSocket = require('ws');

const out = process.argv[2] ?? 'frame.png';
const APP = process.env.APP_URL ?? 'http://localhost:5173/';
const ID = process.env.FAKE_HOST_ID ?? '123456789';
const PASSWORD = process.env.FAKE_HOST_PASSWORD ?? 'demo';

const browsers = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];
const exe = browsers.find((p) => fs.existsSync(p));
if (!exe) {
  console.error('no Chrome/Edge found');
  process.exit(1);
}

const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rclient-cdp-'));
const port = 9333;

const chrome = spawn(exe, [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profileDir}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-gpu',
  '--window-size=1280,900',
  '--autoplay-policy=no-user-gesture-required',
  'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function findTarget() {
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page;
    } catch { /* not up yet */ }
    await sleep(200);
  }
  throw new Error('Chrome DevTools endpoint never appeared');
}

const page = await findTarget();
const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
await new Promise((resolve, reject) => {
  ws.once('open', resolve);
  ws.once('error', reject);
});

let nextId = 1;
const pending = new Map();
ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(msg.error.message));
    else resolve(msg.result);
  }
});

function send(method, params = {}) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression) {
  const res = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (res.exceptionDetails) {
    throw new Error(res.exceptionDetails.exception?.description ?? 'evaluate failed');
  }
  return res.result.value;
}

await send('Page.enable');
await send('Runtime.enable');

// Collect console output so a decoder error is visible rather than silent.
const logs = [];
ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.method === 'Runtime.consoleAPICalled') {
    const text = (msg.params.args ?? []).map((a) => a.value ?? a.description ?? '').join(' ');
    if (text) logs.push(text);
  }
});

await send('Page.navigate', { url: APP });
await sleep(2500);

// Fill the form and connect through the real UI.
const filled = await evaluate(`
  (() => {
    const setValue = (el, value) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const inputs = Array.from(document.querySelectorAll('input'));
    const idInput = inputs.find((i) => i.type === 'text');
    const pwInput = inputs.find((i) => i.type === 'password');
    if (!idInput || !pwInput) return 'form not found: ' + inputs.length + ' inputs';
    setValue(idInput, ${JSON.stringify(ID)});
    setValue(pwInput, ${JSON.stringify(PASSWORD)});
    const button = Array.from(document.querySelectorAll('button')).find((b) => /connect/i.test(b.textContent ?? ''));
    if (!button) return 'connect button not found';
    button.click();
    return 'submitted';
  })()
`);
console.log(`[browser] form: ${filled}`);

// Wait for a canvas that has actually painted non-uniform pixels.
let painted = null;
for (let i = 0; i < 120; i++) {
  await sleep(250);
  painted = await evaluate(`
    (() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return { canvas: false };
      const probe = document.createElement('canvas');
      probe.width = canvas.width;
      probe.height = canvas.height;
      const ctx = probe.getContext('2d');
      ctx.drawImage(canvas, 0, 0);
      const data = ctx.getImageData(0, 0, probe.width, probe.height).data;
      const colors = new Set();
      for (let i = 0; i < data.length; i += 4 * 97) {
        colors.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
      }
      return { canvas: true, width: canvas.width, height: canvas.height, distinctColors: colors.size };
    })()
  `);
  if (painted.canvas && painted.distinctColors > 3) break;
}

if (!painted?.canvas || painted.distinctColors <= 3) {
  console.error('[browser] FAILED: no painted video canvas', JSON.stringify(painted));
  console.error(logs.slice(-20).join('\n'));
  cleanup(1);
}

console.log(`[browser] canvas ${painted.width}x${painted.height}, ${painted.distinctColors} distinct sampled colours`);

await sleep(600);
const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
console.log(`[browser] screenshot → ${out}`);
console.log(`[browser] PASS`);
cleanup(0);

function cleanup(code) {
  try { ws.close(); } catch { /* ignore */ }
  chrome.kill();
  setTimeout(() => {
    try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch { /* ignore */ }
    process.exit(code);
  }, 500);
}
