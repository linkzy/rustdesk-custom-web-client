import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startStack } from './stack.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, '..');

const args = process.argv.slice(2);
const outBase = args.includes('--out')
  ? path.resolve(args[args.indexOf('--out') + 1])
  : path.join(REPO_ROOT, 'docs', 'assets', 'demo');

const FPS = 15;
const FRAMES_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rclient-demo-frames-'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => console.log(`[record] ${m}`);

function findBrowser() {
  for (const c of [
    process.env.E2E_CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean)) if (fs.existsSync(c)) return c;
  throw new Error('no Chrome/Edge found; set E2E_CHROME_PATH');
}

function findFfmpeg() {
  const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['ffmpeg'], { encoding: 'utf8' });
  if (which.status === 0) return which.stdout.split('\n')[0].trim();
  const pw = path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright');
  if (fs.existsSync(pw)) {
    for (const d of fs.readdirSync(pw).filter((n) => n.startsWith('ffmpeg'))) {
      for (const name of ['ffmpeg.exe', 'ffmpeg']) {
        const p = path.join(pw, d, name);
        if (fs.existsSync(p)) return p;
      }
    }
  }
  throw new Error('ffmpeg not found on PATH');
}

async function main() {
  fs.mkdirSync(path.dirname(outBase), { recursive: true });
  log('starting stack (fake host + gateway + web)…');
  const stack = await startStack({ startWeb: true, log: (m) => console.log('   ' + m) });

  const { createRequire } = await import('node:module');
  const req = createRequire(path.join(REPO_ROOT, 'gateway', 'package.json'));
  const WebSocket = req('ws');

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'rclient-demo-profile-'));
  const child = spawn(findBrowser(), [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--no-sandbox',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--window-size=1280,800',
    'about:blank',
  ].filter(Boolean), { stdio: 'ignore' });

  let port = 0;
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 150 && !port; i++) {
    try { port = Number(fs.readFileSync(portFile, 'utf8').split('\n')[0]); } catch { /* not yet */ }
    if (!port) await sleep(100);
  }
  if (!port) throw new Error('browser never wrote DevToolsActivePort');

  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl, { perMessageDeflate: false });
  await new Promise((r) => ws.once('open', r));

  let id = 1;
  const pending = new Map();
  let onEvent = () => {};
  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.id && pending.has(m.id)) {
      const done = pending.get(m.id);
      pending.delete(m.id);
      m.error ? done(m.error) : done(m.result);
    } else if (m.method) onEvent(m);
  });
  const send = (method, params = {}) => new Promise((res) => {
    const i = id++;
    pending.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  const evaluate = async (fn, ...a) => (await send('Runtime.evaluate', {
    expression: `(${fn})(${a.map((x) => JSON.stringify(x)).join(',')})`,
    returnByValue: true,
    awaitPromise: true,
  }))?.result?.value;
  const type = async (text) => {
    for (const ch of text) {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', text: ch, key: ch });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch });
    }
  };

  try {
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });

    log('loading the connect form…');
    await send('Page.navigate', { url: stack.appUrl });
    await sleep(1800);
    await evaluate(() => { localStorage.clear(); return true; });
    await send('Page.reload');
    await sleep(1800);
    if (!(await evaluate(() => !!document.getElementById('rclient-device-id')))) {
      throw new Error('connect form did not render');
    }

    // A burnt-in caption, so a still from this clip can never be mistaken for a
    // real desktop. Re-added after every navigation because it lives in the DOM.
    const badge = async () => evaluate(() => {
      let el = document.getElementById('rclient-demo-badge');
      if (!el) {
        el = document.createElement('div');
        el.id = 'rclient-demo-badge';
        el.style.cssText = [
          'position:fixed', 'left:12px', 'bottom:12px', 'z-index:2147483647',
          'font:600 12px/1.35 system-ui,sans-serif', 'color:#fff',
          'background:rgba(15,23,42,.88)', 'border:1px solid #475569',
          'border-radius:8px', 'padding:7px 10px', 'pointer-events:none',
          'max-width:60vw', 'white-space:pre-line',
        ].join(';');
        document.body.appendChild(el);
      }
      el.textContent = 'Synthetic session — fake RustDesk host, not a real desktop';
      return true;
    });
    await badge();

    // --- recording starts here -------------------------------------------
    let seq = 0;
    onEvent = (m) => {
      if (m.method === 'Page.screencastFrame') {
        fs.writeFileSync(path.join(FRAMES_DIR, `${String(seq++).padStart(5, '0')}.png`), Buffer.from(m.params.data, 'base64'));
        send('Page.screencastFrameAck', { sessionId: m.params.sessionId }).catch(() => {});
      }
    };
    await send('Page.startScreencast', { format: 'png', everyNthFrame: 1 });
    log('recording…');

    // 1. Connect form, readable.
    await sleep(1500);

    // 2. Fill ID, then type the password visibly, then Connect.
    await evaluate((idv) => {
      const el = document.getElementById('rclient-device-id');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, idv);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('input[type="password"]').focus();
      return true;
    }, stack.fakeHost.id);
    await type(stack.fakeHost.password);
    await sleep(400);
    await evaluate(() => {
      Array.from(document.querySelectorAll('button'))
        .find((b) => /^connect$/i.test((b.textContent ?? '').trim())).click();
      return true;
    });
    log('connecting…');

    // 3. Wait for the canvas, then let the synthetic screen animate.
    const deadline = Date.now() + 15_000;
    let box = null;
    while (Date.now() < deadline && !box) {
      box = await evaluate(() => {
        const c = document.querySelector('canvas');
        if (!c || !c.width) return null;
        const r = c.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      });
      if (!box) await sleep(150);
    }
    if (!box) throw new Error('canvas never appeared');
    await badge();
    await stack.control.waitForFrames(20);
    await sleep(1500);

    // 4. A visible mouse move across the canvas. The canvas itself does not draw
    //    a cursor (that is the browser's job and headless Chrome does not paint
    //    one), so the clip would show no feedback — see the overlay below.
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      await send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: Math.round(box.x + box.width * (0.25 + 0.5 * t)),
        y: Math.round(box.y + box.height * (0.4 + 0.2 * Math.sin(t * Math.PI))),
      });
      await sleep(28);
    }

    // 5. A short typing burst, then rest on the session + toolbar. The canvas
    //    paints nothing for input, so the badge reports what the fake host
    //    actually received — evidence the events arrived, not decoration.
    await evaluate(() => { document.querySelector('canvas').focus(); return true; });
    await type('hello from the browser');
    await sleep(400);

    const received = await stack.control.events();
    const typed = received.filter((e) => e.type === 'key').length;
    await evaluate((n) => {
      const el = document.getElementById('rclient-demo-badge');
      if (el) {
        el.textContent =
          'Synthetic session — fake RustDesk host, not a real desktop\n' +
          `${n} key events received by the host`;
      }
      return true;
    }, typed);
    log(`${typed} key events reached the fake host`);
    await sleep(1200);

    await send('Page.stopScreencast');
    log(`captured ${seq} frames`);

    // --- encode ------------------------------------------------------------
    const ffmpeg = findFfmpeg();
    const gifPath = `${outBase}.gif`;
    const poster = `${outBase}.png`;
    const last = fs.readdirSync(FRAMES_DIR).sort().pop();
    fs.copyFileSync(path.join(FRAMES_DIR, last), poster);

    const enc = spawnSync(ffmpeg, [
      '-y',
      '-framerate', String(FPS),
      '-i', path.join(FRAMES_DIR, '%05d.png'),
      '-vf', 'scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=192:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3',
      '-loop', '0',
      gifPath,
    ], { encoding: 'utf8' });
    if (enc.status !== 0) throw new Error('ffmpeg failed: ' + enc.stderr.slice(-500));

    const size = fs.statSync(gifPath).size;
    log(`wrote ${path.basename(gifPath)} (${(size / 1024 / 1024).toFixed(2)} MB) and ${path.basename(poster)}`);
  } finally {
    try { await send('Browser.close'); } catch { /* gone */ }
    await sleep(300);
    try { ws.close(); } catch { /* gone */ }
    if (child.exitCode === null) child.kill('SIGTERM');
    await sleep(200);
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    fs.rmSync(profile, { recursive: true, force: true });
    fs.rmSync(FRAMES_DIR, { recursive: true, force: true });
    await stack.stop();
  }
}

main().catch((e) => { console.error(`[record] FAILED: ${e.message}`); process.exit(1); });
