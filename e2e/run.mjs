// End-to-end suite, driven with real Chrome/Edge over the DevTools protocol.
//
//   npm run test:e2e            (from the repo root, or from e2e/)
//
// The tool choice was settled on CDP over Playwright: it needs no new
// dependency (ws comes from gateway/), installs nothing beyond a browser the
// machine already has, and reuses the technique proven in
// gateway/test/fake-host/browser-check.mjs. This is the only harness in the
// repo — there is no Playwright variant to keep in sync.
//
// Every scenario asserts on what a user gets: a canvas that is painting and
// keeps changing, input that reached the machine, and the friendly error text.
// A failure writes the page state (screenshot + console) to .artifacts/.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { startStack, REPO_ROOT } from './stack.mjs';

const require = createRequire(path.join(REPO_ROOT, 'gateway', 'package.json'));
const WebSocket = require('ws');

const here = path.dirname(fileURLToPath(import.meta.url));
const ARTIFACTS = path.join(here, '.artifacts');
const HEADLESS = process.env.E2E_HEADED !== '1';

// ---------------------------------------------------------------------------
// Browser plumbing
// ---------------------------------------------------------------------------

const BROWSERS = [
  process.env.E2E_CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

function findBrowser() {
  for (const candidate of BROWSERS) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(
    'no Chrome/Edge found. Set E2E_CHROME_PATH to a Chromium binary.',
  );
}

/**
 * One browser instance. close() asks it to exit through DevTools and then
 * signals the process, so a failed scenario cannot leave Chromium pinning the
 * machine (the bug fixed in browser-check.mjs).
 */
class Browser {
  static async launch() {
    const exe = findBrowser();
    const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rclient-e2e-'));
    const child = spawn(exe, [
      HEADLESS ? '--headless=new' : '',
      '--remote-debugging-port=0', // OS picks; we read it back, so no stale attach
      `--user-data-dir=${profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--disable-dev-shm-usage', // CI containers have a tiny /dev/shm
      '--autoplay-policy=no-user-gesture-required',
      'about:blank',
    ].filter(Boolean), { stdio: 'ignore' });

    const browser = new Browser(child, profileDir);
    await browser.waitForPort();
    return browser;
  }

  constructor(child, profileDir) {
    this.child = child;
    this.profileDir = profileDir;
    this.closed = false;
  }

  async waitForPort() {
    const file = path.join(this.profileDir, 'DevToolsActivePort');
    for (let i = 0; i < 150; i++) {
      try {
        const lines = fs.readFileSync(file, 'utf8').split('\n');
        const port = Number(lines[0]);
        if (lines.length >= 2 && port > 0) {
          this.port = port;
          return;
        }
      } catch { /* not written yet */ }
      await sleep(100);
    }
    throw new Error('browser never wrote DevToolsActivePort');
  }

  async newPage() {
    const list = await (await fetch(`http://127.0.0.1:${this.port}/json/list`)).json();
    const target = list.find((t) => t.type === 'page');
    if (!target) throw new Error('browser has no page target');
    return new Page(target.webSocketDebuggerUrl);
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    try {
      const info = await (await fetch(`http://127.0.0.1:${this.port}/json/version`)).json();
      const ws = new WebSocket(info.webSocketDebuggerUrl, { perMessageDeflate: false });
      await new Promise((resolve) => { ws.once('open', resolve); ws.once('error', resolve); });
      ws.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
      await sleep(300);
      try { ws.close(); } catch { /* gone */ }
    } catch { /* already gone */ }

    if (this.child.exitCode === null) this.child.kill('SIGTERM');
    await sleep(300);
    if (this.child.exitCode === null && this.child.signalCode === null) this.child.kill('SIGKILL');
    try { fs.rmSync(this.profileDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

/** A single tab, driven over CDP. */
class Page {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.nextId = 1;
    this.pending = new Map();
    this.consoleLines = [];
  }

  async open() {
    this.ws = new WebSocket(this.wsUrl, { perMessageDeflate: false });
    await new Promise((resolve, reject) => {
      this.ws.once('open', resolve);
      this.ws.once('error', reject);
    });
    this.ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
        return;
      }
      if (msg.method === 'Runtime.consoleAPICalled') {
        const text = (msg.params.args ?? []).map((a) => a.value ?? a.description ?? '').join(' ');
        if (text) this.consoleLines.push(text);
      }
    });
    await this.send('Page.enable');
    await this.send('Runtime.enable');
    return this;
  }

  send(method, params = {}) {
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  async goto(url) {
    await this.send('Page.navigate', { url });
    // Wait for the app shell rather than a fixed sleep.
    for (let i = 0; i < 200; i++) {
      if (await this.evaluate(() => document.readyState === 'complete')) return;
      await sleep(100);
    }
    throw new Error(`page never finished loading ${url}`);
  }

  async evaluate(fn, ...args) {
    const expression = typeof fn === 'function'
      ? `(${fn.toString()})(${args.map((a) => JSON.stringify(a)).join(',')})`
      : fn;
    const res = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description ?? 'evaluate failed');
    }
    return res.result.value;
  }

  /** Fills the connect form the way a user does and clicks Connect. */
  async connect({ id, password }) {
    const result = await this.evaluate((deviceId, pw) => {
      const setValue = (el, value) => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(el, value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      };
      const idInput = document.getElementById('rclient-device-id')
        ?? document.querySelector('input[type="text"]');
      const pwInput = document.querySelector('input[type="password"]');
      if (!idInput || !pwInput) return 'form not found';
      setValue(idInput, deviceId);
      setValue(pwInput, pw);
      const button = Array.from(document.querySelectorAll('button'))
        .find((b) => /^connect$/i.test((b.textContent ?? '').trim()));
      if (!button) return 'connect button not found';
      button.click();
      return 'submitted';
    }, id, password);
    if (result !== 'submitted') throw new Error(result);
  }

  /** Visible text of the page, for message assertions. */
  async text() {
    return this.evaluate(() => document.body.innerText);
  }

  async hasCanvas() {
    return this.evaluate(() => document.querySelectorAll('canvas').length > 0);
  }

  /** Distinct colours sampled from the canvas; 0 when absent or blank. */
  async canvasColours() {
    return this.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas || !canvas.width || !canvas.height) return 0;
      const probe = document.createElement('canvas');
      probe.width = canvas.width;
      probe.height = canvas.height;
      const ctx = probe.getContext('2d');
      ctx.drawImage(canvas, 0, 0);
      const data = ctx.getImageData(0, 0, probe.width, probe.height).data;
      const colours = new Set();
      for (let i = 0; i < data.length; i += 4 * 97) {
        colours.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
      }
      return colours.size;
    });
  }

  /** Pixel fingerprint, to prove the picture is not a still image. */
  async canvasFingerprint() {
    return this.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas || !canvas.width) return '';
      const probe = document.createElement('canvas');
      probe.width = canvas.width;
      probe.height = canvas.height;
      probe.getContext('2d').drawImage(canvas, 0, 0);
      const data = probe.getContext('2d').getImageData(0, 0, probe.width, probe.height).data;
      let hash = 0;
      for (let i = 0; i < data.length; i += 4 * 13) hash = (hash * 31 + data[i]) | 0;
      return String(hash);
    });
  }

  async canvasBox() {
    return this.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return null;
      const r = canvas.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, pw: canvas.width, ph: canvas.height };
    });
  }

  async clickAt(x, y) {
    for (const type of ['mousePressed', 'mouseReleased']) {
      await this.send('Input.dispatchMouseEvent', {
        type,
        x,
        y,
        button: 'left',
        clickCount: 1,
        buttons: type === 'mousePressed' ? 1 : 0,
      });
    }
  }

  async type(text) {
    for (const ch of text) {
      await this.send('Input.dispatchKeyEvent', { type: 'keyDown', text: ch, key: ch });
      await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch });
    }
  }

  async screenshot(file) {
    const shot = await this.send('Page.captureScreenshot', { format: 'png' });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
    return file;
  }

  close() {
    try { this.ws?.close(); } catch { /* ignore */ }
  }
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Hard ceiling for one scenario, measured from the moment its page is opened.
 * The per-wait timeouts below are deliberately smaller than this: the cap is
 * the backstop that stops a stuck scenario from holding a browser indefinitely
 * on a small machine, not the mechanism a normal failure uses.
 */
const SCENARIO_TIMEOUT_MS = 20_000;

/**
 * Polls until `fn` returns a truthy value. Replaces arbitrary sleeps: the
 * predicate reads real state (the fake host's counters, the canvas) instead.
 */
async function waitFor(fn, { timeoutMs = 15_000, what = 'condition', intervalMs = 100 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await fn()) return true;
    await sleep(intervalMs);
  }
  throw new Error(`timed out after ${timeoutMs}ms waiting for ${what}`);
}

/** Races `promise` against the scenario ceiling. */
function withDeadline(promise, ms, what) {
  let timer;
  const guard = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`scenario exceeded its ${ms}ms limit (stuck waiting for ${what})`)),
      ms,
    );
  });
  return Promise.race([promise, guard]).finally(() => clearTimeout(timer));
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

const scenarios = [];
function scenario(name, fn) {
  scenarios.push({ name, fn });
}

scenario('connects and streams video that keeps changing', async ({ page, stack }) => {
  await page.connect({ id: stack.fakeHost.id, password: stack.fakeHost.password });

  await waitFor(() => page.hasCanvas(), { what: 'the remote screen to appear' });

  // The fake host's own counter, not a wall clock.
  await stack.control.waitForFrames(10);

  await waitFor(async () => (await page.canvasColours()) > 3, {
    what: 'the canvas to paint a decoded frame',
  });
  const colours = await page.canvasColours();

  // A still image would pass the colour check; two samples must differ.
  const first = await page.canvasFingerprint();
  await waitFor(async () => (await page.canvasFingerprint()) !== first, {
    what: 'the picture to change between frames',
  });

  const header = await page.text();
  const { width, height } = stack.fakeHost.screen;
  // App.tsx renders "640×360 · H264" with U+00D7, not ASCII 'x'.
  const expected = `${width}\u00d7${height}`;
  if (!header.includes(expected)) {
    throw new Error(`header does not report ${expected}; page says: ${header.slice(0, 200)}`);
  }
  return `${colours} colours, header ${expected}`;
});

scenario('a click reaches the machine at the coordinates clicked', async ({ page, stack }) => {
  await page.connect({ id: stack.fakeHost.id, password: stack.fakeHost.password });
  await stack.control.waitForFrames(10);

  await waitFor(async () => (await page.canvasBox()) !== null, { what: 'the canvas geometry' });
  const box = await page.canvasBox();
  await stack.control.clearEvents();

  // Pick a point inside the frame and translate it the way a user's click does.
  const clickX = Math.round(box.pw * 0.25);
  const clickY = Math.round(box.ph * 0.75);
  await page.clickAt(
    box.x + (clickX / box.pw) * box.width,
    box.y + (clickY / box.ph) * box.height,
  );

  await waitFor(async () => (await stack.control.events('mouse')).length > 0, {
    what: 'a mouse event at the fake host',
  });
  const events = await stack.control.events('mouse');

  // RustDesk encodes mask = (button << 3) | type, with button 0x01 = left and
  // type 1 = down, 2 = up (see RemoteScreen.tsx). A left press is therefore 9,
  // not 1 — asserting 1 would be testing an assumption, not the app.
  const MOUSE_LEFT_DOWN = 9;
  const down = events.find((e) => e.detail.mask === MOUSE_LEFT_DOWN);
  if (!down) throw new Error(`no left-button-down (mask ${MOUSE_LEFT_DOWN}) in ${JSON.stringify(events)}`);
  if (Math.abs(down.detail.x - clickX) > 2 || Math.abs(down.detail.y - clickY) > 2) {
    throw new Error(`click arrived at (${down.detail.x},${down.detail.y}), expected ~(${clickX},${clickY})`);
  }
  return `click at (${down.detail.x},${down.detail.y})`;
});

scenario('typing arrives as key events', async ({ page, stack }) => {
  await page.connect({ id: stack.fakeHost.id, password: stack.fakeHost.password });
  await stack.control.waitForFrames(10);

  await waitFor(async () => (await page.canvasBox()) !== null, { what: 'the canvas geometry' });
  const box = await page.canvasBox();

  // Focus the remote surface first: without focus the app ignores the keys.
  await page.clickAt(box.x + box.width / 2, box.y + box.height / 2);
  // The click itself is a mouse event; let the focus land before clearing.
  await waitFor(async () => (await stack.control.events('mouse')).length > 0, {
    what: 'the focusing click to arrive',
  });
  await stack.control.clearEvents();
  await page.type('ab');

  await waitFor(async () => (await stack.control.events('key')).length >= 2, {
    what: 'two key events at the fake host',
  });
  const keys = await stack.control.events('key');

  const unicodes = keys.map((k) => k.detail.unicode).filter((u) => typeof u === 'number');
  if (!unicodes.includes(97) || !unicodes.includes(98)) {
    throw new Error(`expected unicode 97 and 98, got ${JSON.stringify(unicodes)}`);
  }
  return `typed a,b as unicode ${unicodes.join(',')}`;
});

scenario('a wrong password shows the friendly message', async ({ page, stack }) => {
  await page.connect({ id: stack.fakeHost.id, password: 'definitely-not-the-password' });

  // web/src/utils/errors.ts maps the host's "Wrong password" to this title.
  await waitFor(async () => (await page.text()).includes('Wrong password'), {
    what: 'the friendly "Wrong password" message',
  });

  if (await page.hasCanvas()) throw new Error('a canvas appeared despite a failed login');
  return 'friendly wrong-password message shown';
});

scenario('an unknown ID says the machine is offline', async ({ page, stack }) => {
  await page.connect({ id: '999999999', password: 'whatever' });

  await waitFor(async () => (await page.text()).includes('That machine is offline'), {
    what: 'the friendly offline message',
  });

  if (await page.hasCanvas()) throw new Error('a canvas appeared for an unknown ID');
  return 'friendly offline message shown';
});

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function main() {
  const only = process.env.E2E_GREP;
  const selected = only ? scenarios.filter((s) => s.name.includes(only)) : scenarios;
  if (!selected.length) throw new Error(`no scenario matches E2E_GREP=${only}`);

  let stack = null;
  let browser = null;
  const results = [];

  try {
    stack = await startStack({ startWeb: true, log: (m) => console.log(m) });
    browser = await Browser.launch();
    console.log(`[e2e] browser on port ${browser.port}, app at ${stack.appUrl}`);
    console.log('');

    for (const { name, fn } of selected) {
      const started = Date.now();
      let page = null;
      try {
        page = await browser.newPage().then((p) => p.open());
        // The page load plus the scenario share one hard ceiling, so a stuck
        // step cannot hold the browser past SCENARIO_TIMEOUT_MS.
        await withDeadline(
          (async () => {
            await page.goto(stack.appUrl);
            return fn({ page, stack });
          })(),
          SCENARIO_TIMEOUT_MS,
          name,
        ).then((detail) => {
          const ms = Date.now() - started;
          console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''} (${ms}ms)`);
          results.push({ name, ok: true });
        });
      } catch (e) {
        const ms = Date.now() - started;
        console.log(`  ✗ ${name} (${ms}ms)`);
        console.log(`      ${e.message}`);

        // A failure must show the page, not just a stack trace.
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        try {
          const shot = await page?.screenshot(path.join(ARTIFACTS, `${slug}.png`));
          if (shot) console.log(`      screenshot: ${path.relative(process.cwd(), shot)}`);
          if (page?.consoleLines.length) {
            console.log('      console:');
            for (const line of page.consoleLines.slice(-10)) console.log(`        ${line}`);
          }
        } catch { /* the page may be gone; the message above still stands */ }

        results.push({ name, ok: false, error: e.message });
      } finally {
        page?.close();
      }
    }
  } finally {
    // Order matters: browser first so it stops streaming from a dead gateway.
    await browser?.close();
    await stack?.stop();
  }

  const failed = results.filter((r) => !r.ok);
  console.log('');
  if (failed.length) {
    console.log(`[e2e] FAILED: ${failed.length} of ${results.length} scenarios`);
    for (const f of failed) console.log(`  - ${f.name}: ${f.error}`);
    process.exit(1);
  }
  console.log(`[e2e] PASS: ${results.length}/${results.length} scenarios`);
  process.exit(0);
}

main().catch((e) => {
  console.error(`[e2e] FAILED: ${e.message}`);
  process.exit(1);
});
