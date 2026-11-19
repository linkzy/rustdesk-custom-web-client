// Generates the static social/launch assets in web/public/:
//   og-image.png         1200x630  Open Graph / Twitter card
//   apple-touch-icon.png 180x180   iOS home-screen icon
//
// Both are drawn from plain HTML/CSS and an inline SVG mark — no screenshot of a
// session, nothing that claims a feature the app does not have. Re-run after
// changing the wording or the palette:
//
//   node scripts/generate-social-assets.mjs
//
// Playwright is NOT a project dependency. Install it where you run this
// (`npm i --no-save playwright && npx playwright install chromium`), or point
// NODE_PATH at a checkout that already has it. The images are committed, so a
// normal `npm run build` never needs this.

import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const out = (name) => path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', name);

const BG = '#0f172a';
const PANEL = '#1e293b';
const TEXT = '#e2e8f0';
const MUTED = '#94a3b8';
const ACCENT = '#3b82f6';

// A monitor: screen, stand, base. Stroked, so it scales cleanly at any size.
const mark = (size, stroke) => `
<svg width="${size}" height="${size}" viewBox="0 0 48 48" fill="none"
     xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <rect x="5" y="9" width="38" height="26" rx="3" stroke="${stroke}" stroke-width="2.6"/>
  <path d="M20 41h8M24 35v6" stroke="${stroke}" stroke-width="2.6" stroke-linecap="round"/>
  <path d="M11 15h12" stroke="${stroke}" stroke-width="2.2" stroke-linecap="round" opacity="0.55"/>
</svg>`;

const card = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html,body{margin:0;width:1200px;height:630px;overflow:hidden}
  body{
    background:radial-gradient(900px 500px at 12% -10%, #1e3a8a 0%, transparent 60%),
               radial-gradient(700px 400px at 100% 110%, #1e293b 0%, transparent 55%),
               ${BG};
    color:${TEXT};font-family:system-ui,-apple-system,"Segoe UI",sans-serif;
    display:flex;flex-direction:column;justify-content:center;
    padding:0 84px;box-sizing:border-box;position:relative;
  }
  .brand{display:flex;align-items:center;gap:20px;margin-bottom:34px}
  .mark{width:78px;height:78px;border-radius:18px;background:${PANEL};
        border:1px solid #334155;display:flex;align-items:center;justify-content:center}
  .name{font-size:46px;font-weight:800;letter-spacing:-0.5px}
  h1{font-size:62px;line-height:1.12;margin:0 0 26px;font-weight:800;letter-spacing:-1.2px}
  h1 span{color:${ACCENT}}
  p.sub{font-size:26px;line-height:1.5;color:${MUTED};margin:0;max-width:900px}
  .url{margin-top:44px;font-size:25px;color:${TEXT};display:flex;align-items:center;gap:14px}
  .dot{width:11px;height:11px;border-radius:50%;background:#22c55e}
  .tag{position:absolute;top:56px;right:84px;font-size:20px;color:${MUTED};
       border:1px solid #334155;border-radius:999px;padding:9px 18px;background:${PANEL}}
</style></head>
<body>
  <div class="tag">self-hosted &middot; open source</div>
  <div class="brand"><div class="mark">${mark(44, ACCENT)}</div><div class="name">rclient</div></div>
  <h1>Your computers,<br>in any <span>browser</span>.</h1>
  <p class="sub">A self-hosted web client for RustDesk. Keyboard, mouse, video and audio
     through your own relay &mdash; nothing to install on the device you connect from.</p>
  <div class="url"><span class="dot"></span>rclient-demo.linkzy.dev</div>
</body></html>`;

const icon = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html,body{margin:0;width:180px;height:180px}
  body{background:${BG};display:flex;align-items:center;justify-content:center}
  .sq{width:180px;height:180px;display:flex;align-items:center;justify-content:center;
      background:linear-gradient(145deg,#16233f 0%,${BG} 72%)}
</style></head>
<body><div class="sq">${mark(132, ACCENT)}</div></body></html>`;

const browser = await chromium.launch();

async function render(html, width, height, file) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.screenshot({ path: out(file), type: 'png', clip: { x: 0, y: 0, width, height } });
  await page.close();
  console.log('wrote', file, width + 'x' + height);
}

await render(card, 1200, 630, 'og-image.png');
await render(icon, 180, 180, 'apple-touch-icon.png');
await browser.close();
