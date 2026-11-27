// Measures what the app RECEIVES for each shortcut combination, and documents
// what this method cannot measure.
//
//   node e2e/shortcut-matrix.mjs
//   node e2e/shortcut-matrix.mjs --json out.json
//
// ---------------------------------------------------------------------------
// READ THIS FIRST — the scope limit, measured rather than assumed
// ---------------------------------------------------------------------------
// Playwright's page.keyboard.press() sends CDP Input.dispatchKeyEvent, which is
// injected *below* the browser UI layer. e2e/shortcut-method-check.mjs proves
// it: Ctrl+W injected that way does NOT close the tab, in a browser where a real
// Ctrl+W does.
//
// So this script cannot answer "would a real user's Ctrl+W reach the page".
// What it CAN answer, honestly:
//
//   1. What our handler receives for every combination the browser does deliver
//      (key, code, keyCode, modifier flags) — that is what feeds buildKeyPayload.
//   2. That the app calls preventDefault() and sends a payload for each of them.
//
// The browser-reserved rows are marked UNMEASURED, not "reaches". They are
// decided by the OS and the browser chrome, which no page can observe; the
// column stays honestly blank until someone presses the keys in a real window.
// docs/SHORTCUTS.md records the method and this limitation.

import fs from 'node:fs';
import { chromium } from '@playwright/test';
import { startStack } from './stack.mjs';

// Which combinations are expected to be contested by the browser chrome. This is
// a claim from documented browser behaviour, NOT a measurement — the script
// reports these as unmeasured and says so.
const BROWSER_OWNED = new Set([
  'Ctrl+W', 'Ctrl+T', 'Ctrl+N', 'Ctrl+Shift+T', 'Ctrl+Shift+N', 'Ctrl+Shift+W',
  'Ctrl+Tab', 'Ctrl+Shift+Tab', 'Ctrl+PageDown', 'Ctrl+PageUp',
  'Alt+Tab', 'Alt+F4', 'Meta+L', 'Meta+D', 'Ctrl+Alt+Delete',
  'F11', 'Ctrl+Shift+I', 'Ctrl+Shift+J', 'Ctrl+Shift+C', 'F12',
]);

const SHORTCUTS = [
  'Ctrl+C', 'Ctrl+V', 'Ctrl+X', 'Ctrl+A', 'Ctrl+Z', 'Ctrl+Y',
  'Ctrl+S', 'Ctrl+P', 'Ctrl+F', 'Ctrl+R', 'Ctrl+D', 'Ctrl+L',
  'Ctrl+W', 'Ctrl+T', 'Ctrl+N', 'Ctrl+Shift+T', 'Ctrl+Shift+N',
  'Ctrl+Tab', 'Ctrl+Shift+Tab', 'Alt+Tab', 'Alt+F4', 'Meta+L',
  'Ctrl+Alt+Delete', 'F5', 'F11', 'Escape', 'Ctrl+Shift+I',
  'Ctrl+Plus', 'Ctrl+Minus', 'Ctrl+0',
];

const outJson = (() => {
  const i = process.argv.indexOf('--json');
  return i !== -1 ? process.argv[i + 1] : null;
})();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let stack = null;
let browser = null;

try {
  stack = await startStack({ startWeb: true, log: () => {} });
  browser = await chromium.launch();
  const context = await browser.newContext({ locale: 'en-US' });
  const page = await context.newPage();

  await page.goto(stack.appUrl);
  await page.locator('#rclient-machine-id').fill(stack.fakeHost.id);
  await page.locator('#rclient-password').fill(stack.fakeHost.password);
  await page.getByRole('button', { name: /^connect$/i }).click();
  await page.locator('canvas').waitFor({ state: 'visible', timeout: 30_000 });
  await stack.control.waitForFrames(5);

  // Focus the remote surface once; the harness handles the rest.
  const box = await page.locator('canvas').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await sleep(200);

  // Record what our own document listener sees, in the page.
  // Two phases, because they answer different questions: the capture-phase probe
  // runs BEFORE the app's listener (so defaultPrevented is always false there),
  // while the bubble-phase one runs after and shows whether the app prevented it.
  await page.evaluate(() => {
    window.__seen = [];
    document.addEventListener('keydown', (e) => {
      const entry = {
        phase: 'capture',
        key: e.key, code: e.code, keyCode: e.keyCode,
        ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey,
        preventedAtCapture: e.defaultPrevented,
      };
      window.__seen.push(entry);
    }, true);
    window.addEventListener('keydown', (e) => {
      // Bubble phase on window runs after the app's document listener.
      const last = window.__seen[window.__seen.length - 1];
      if (last) last.preventedAfterApp = e.defaultPrevented;
    }, false);
  });

  const results = [];
  for (const id of SHORTCUTS) {
    await stack.control.clearEvents();
    await page.evaluate(() => { window.__seen = []; });
    // Playwright's key names differ for a few keys, and case matters: 'Control+C'
    // produces an uppercase C event (key="C"), while a real keyboard's Ctrl+C
    // produces lowercase "c". Use the lowercase form so the matrix models what a
    // user actually presses.
    const spec = id
      .replace('Ctrl+Plus', 'Control+=')
      .replace(/^Ctrl\+([A-Z])$/, (_, k) => `Control+${k.toLowerCase()}`)
      .replace(/^Ctrl\+/, 'Control+');
    await page.keyboard.press(spec);
    await sleep(250);

    const seen = await page.evaluate(() => window.__seen);
    // The app sends different payloads per union member; read what the host got.
    const sent = await stack.control.events('key');

    const browserOwned = BROWSER_OWNED.has(id);
    const delivered = seen.length > 0;
    // Report the CHARACTER event, not the modifier keydown that precedes it:
    // Ctrl+C produces a Control keydown (control_key=4), then the 'c' keydown
    // carrying chr. The character one is what the shortcut turns on.
    const keyDowns = sent.filter((e) => e.detail.down === true);
    const charEvent = keyDowns.find((e) => e.detail.chr !== undefined || e.detail.unicode !== undefined)
      ?? keyDowns.find((e) => e.detail.control_key !== undefined);
    const lastSeen = seen[seen.length - 1];

    results.push({
      shortcut: id,
      // 'delivered' means the injected event reached our listener — NOT that a
      // real keyboard would deliver it.
      delivered,
      browserOwned: browserOwned ? 'expected-contested' : 'expected-available',
      received: lastSeen ? {
        key: lastSeen.key, code: lastSeen.code, keyCode: lastSeen.keyCode,
        ctrl: lastSeen.ctrl, alt: lastSeen.alt, shift: lastSeen.shift, meta: lastSeen.meta,
        preventedByApp: lastSeen.preventedAfterApp === true,
      } : null,
      payload: charEvent ? {
        chr: charEvent.detail.chr,
        unicode: charEvent.detail.unicode,
        control_key: charEvent.detail.control_key,
        modifiers: charEvent.detail.modifiers,
        mode: charEvent.detail.mode,
      } : null,
    });
  }

  console.log('shortcut         expected          delivered  key     code      keyCode  sent');
  console.log('-'.repeat(96));
  for (const r of results) {
    const mark = r.browserOwned === 'expected-contested' ? 'contested' : 'available';
    const got = r.received
      ? `${String(r.received.key).padEnd(7)} ${String(r.received.code).padEnd(9)} ${String(r.received.keyCode).padEnd(8)}`
      : `${'-'.padEnd(7)} ${'-'.padEnd(9)} ${'-'.padEnd(8)}`;
    const payload = r.payload
      ? (r.payload.control_key !== undefined ? `control_key=${r.payload.control_key}`
        : r.payload.chr !== undefined ? `chr=${r.payload.chr} (${String.fromCodePoint(r.payload.chr)})`
          : r.payload.unicode !== undefined ? `unicode=${r.payload.unicode}` : '?')
      : '(nothing)';
    console.log(`${r.shortcut.padEnd(16)} ${mark.padEnd(17)} ${String(r.delivered).padEnd(10)} ${got} ${payload}`);
  }

  const deliveredCount = results.filter((r) => r.delivered).length;
  console.log('');
  console.log(`${deliveredCount}/${results.length} combinations were delivered to the page listener`);
  console.log('when injected through CDP. That is NOT a measurement of what a real keyboard');
  console.log('delivers: CDP injection bypasses the browser UI layer (see');
  console.log('e2e/shortcut-method-check.mjs). Rows marked "contested" are the ones a real');
  console.log('browser is documented to intercept; this harness cannot confirm them.');

  if (outJson) {
    fs.writeFileSync(outJson, JSON.stringify({
      browser: 'Chromium (Playwright)',
      method: 'CDP Input.dispatchKeyEvent via page.keyboard.press',
      scopeLimit: 'CDP injection bypasses the browser UI layer; browser-reserved shortcuts cannot be measured this way',
      measuredAt: new Date().toISOString(),
      results,
    }, null, 2), 'utf8');
    console.log(`wrote ${outJson}`);
  }
} finally {
  await browser?.close().catch(() => {});
  await stack?.stop().catch(() => {});
}
