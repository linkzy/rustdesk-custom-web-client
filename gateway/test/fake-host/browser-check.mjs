// Drives real Chrome over the DevTools protocol to prove the actual web UI
// renders frames from the fake host through the real gateway.
//
//   node gateway/test/fake-host/browser-check.mjs <screenshot.png>
//
// Needs: fake host (21118/21119/8081), gateway (4000), web dev server (5173),
// and a Chrome/Edge binary. No Playwright: CDP over ws is enough.
//
// The browser is owned by main() and closed in a `finally`, so every exit path
// — success, a thrown step, a rejected evaluate, or Ctrl-C — brings it down.
// Exit is deferred until the browser's process has actually gone, so the script
// never reports "done" while Chromium is still holding memory.

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

const BROWSERS = [
  process.env.BROWSER_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** State the teardown needs, filled in as the script progresses. */
const session = {
  child: null,
  ws: null,
  profileDir: null,
  closing: false,
};

/**
 * Closes the browser and removes its profile. Idempotent, and safe to call from
 * a signal handler or from the finally in main().
 */
async function closeBrowser() {
  if (session.closing) return;
  session.closing = true;

  // Ask the browser to exit through its own DevTools command first: kill() only
  // signals the launcher, and a browser that ignores it keeps the machine
  // pinned long after the check finished.
  try {
    if (session.ws && session.ws.readyState === 1) {
      session.ws.send(JSON.stringify({ id: 9999, method: 'Browser.close' }));
      await sleep(400);
    }
  } catch { /* already gone */ }

  try { session.ws?.close(); } catch { /* ignore */ }

  if (session.child && session.child.exitCode === null && session.child.signalCode === null) {
    session.child.kill('SIGTERM');
    // Wait for the process to actually go, rather than exiting underneath it.
    for (let i = 0; i < 30 && session.child.exitCode === null; i++) await sleep(100);
    if (session.child.exitCode === null && session.child.signalCode === null) {
      session.child.kill('SIGKILL');
      await sleep(200);
    }
  }

  if (session.profileDir) {
    try { fs.rmSync(session.profileDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

// Signals bypass a finally, so handle them by closing the browser and exiting.
for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143]]) {
  process.on(signal, () => {
    closeBrowser().finally(() => process.exit(code));
  });
}

function findBrowser() {
  const exe = BROWSERS.find((p) => fs.existsSync(p));
  if (!exe) throw new Error('no Chrome/Edge found; set BROWSER_PATH to a Chromium binary');
  return exe;
}

async function main() {
  const exe = findBrowser();

  session.profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rclient-cdp-'));

  // Port 0 lets the browser pick a free one; we read it back from
  // DevToolsActivePort. A fixed port would collide with (and silently attach
  // to) a browser left over from an earlier run, which is how stray Chromium
  // processes pile up in the first place.
  session.child = spawn(exe, [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${session.profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--window-size=1280,900',
    '--autoplay-policy=no-user-gesture-required',
    'about:blank',
  ], { stdio: 'ignore' });

  const devtoolsPort = await resolvePort(session.profileDir);
  const target = await findTarget(devtoolsPort);

  session.ws = new WebSocket(target.webSocketDebuggerUrl, { perMessageDeflate: false });
  await new Promise((resolve, reject) => {
    session.ws.once('open', resolve);
    session.ws.once('error', reject);
  });

  let nextId = 1;
  const pending = new Map();
  session.ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    }
  });

  const send = (method, params = {}) => {
    const id = nextId++;
    session.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  };

  const evaluate = async (expression) => {
    const res = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description ?? 'evaluate failed');
    }
    return res.result.value;
  };

  await send('Page.enable');
  await send('Runtime.enable');

  // Collect console output so a decoder error is visible rather than silent.
  const logs = [];
  session.ws.on('message', (raw) => {
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
    throw new Error('no painted video canvas');
  }

  console.log(`[browser] canvas ${painted.width}x${painted.height}, ${painted.distinctColors} distinct sampled colours`);

  await sleep(600);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
  console.log(`[browser] screenshot → ${out}`);
  console.log('[browser] PASS');
}

/** Reads the port the browser actually bound when we passed 0. */
async function resolvePort(profileDir) {
  const file = path.join(profileDir, 'DevToolsActivePort');
  for (let i = 0; i < 150; i++) {
    try {
      // The file can appear before it is written: require both lines (port and
      // websocket path) before trusting the number, or we read a truncated port.
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      const value = Number(lines[0]);
      if (lines.length >= 2 && value > 0) return value;
    } catch { /* not written yet */ }
    await sleep(200);
  }
  throw new Error('browser never wrote DevToolsActivePort');
}

async function findTarget(devtoolsPort) {
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${devtoolsPort}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page;
    } catch { /* not up yet */ }
    await sleep(200);
  }
  throw new Error('Chrome DevTools endpoint never appeared');
}

let exitCode = 0;
try {
  await main();
} catch (e) {
  console.error(`[browser] FAILED: ${e.message}`);
  exitCode = 1;
} finally {
  // Every path lands here: success, a thrown step, or a rejected evaluate.
  await closeBrowser();
}
process.exit(exitCode);
