// Tests whether CDP-injected keys exercise the browser's own shortcut handling.
//
// This is a method check, not a product test. If Ctrl+W injected through
// page.keyboard.press does NOT close the tab in a normal page, then the CDP path
// bypasses the browser UI layer — which means a matrix built that way cannot
// tell us which shortcuts a real user's keyboard would lose to the browser.
//
//   node e2e/shortcut-method-check.mjs

import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
await page.goto('data:text/html,<h1>method check</h1><input id=x>');
await page.locator('#x').click();

const checks = [];
let closed = false;
page.on('close', () => { closed = true; });

// Control case: a shortcut the browser certainly handles inside an input.
await page.keyboard.press('Control+a');
const selected = await page.evaluate(() => {
  const el = document.activeElement;
  if (!el || el.selectionStart === undefined) return { applicable: false };
  return { applicable: true, start: el.selectionStart, end: el.selectionEnd, len: el.value.length };
});
checks.push({
  what: 'Control+a selects the input text',
  result: selected.applicable
    ? (selected.start === 0 && selected.end === selected.len && selected.len > 0)
    : 'n/a',
  detail: selected,
});

// The decisive one: injecting Ctrl+W.
await page.evaluate(() => { document.title = 'still here'; });
await page.keyboard.press('Control+w');
await new Promise((r) => setTimeout(r, 500));
const stillOpen = !page.isClosed();
const titleNow = stillOpen ? await page.title().catch(() => '(gone)') : '(closed)';
checks.push({
  what: 'Control+w closes the tab (real browsers do)',
  result: !stillOpen,
  detail: { stillOpen, titleNow, closed },
});

console.log('--- CDP key injection vs the browser UI layer ---');
for (const c of checks) {
  console.log(`${c.result === true ? 'YES ' : 'NO  '} ${c.what}`);
  console.log(`     ${JSON.stringify(c.detail)}`);
}
console.log('');
console.log(stillOpen
  ? 'CONCLUSION: CDP-injected Ctrl+W did not close the tab, so key injection does NOT'
    + ' exercise the browser UI layer. A matrix measured this way shows only what the'
    + ' page receives once the event is dispatched, not what a real keyboard delivers.'
  : 'CONCLUSION: CDP-injected Ctrl+W DID close the tab, so injection reaches the'
    + ' browser UI layer and the matrix can measure browser-reserved shortcuts.');

await browser.close();
