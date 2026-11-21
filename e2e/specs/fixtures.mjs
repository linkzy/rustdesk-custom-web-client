// Shared fixture: one stack per worker, torn down on every path.
//
// The stack itself is tool-agnostic (e2e/stack.mjs) and is reused unchanged;
// this file only adapts it to Playwright's fixture lifetime.

import { test as base, expect } from '@playwright/test';
import { startStack } from '../stack.mjs';

export { expect };

/**
 * Attempt a connection through the real form.
 *
 * Selectors are element ids, not labels or CSS classes: the labels are
 * translated (so their text changes with locale) and the class names belong to
 * the styles module, not to the test.
 */
export async function connect(page, { id, password }) {
  await page.goto('/');
  await page.locator('#rclient-device-id').fill(id);
  await page.locator('#rclient-password').fill(password);
  await page.getByRole('button', { name: /^connect$/i }).click();
}

/** True when a remote screen is on the page. */
export async function hasCanvas(page) {
  return (await page.locator('canvas').count()) > 0;
}

/**
 * Distinct colours sampled from the canvas. A decoded video frame has many; a
 * canvas that never painted (or failed to decode) has one or none.
 */
export async function canvasColours(page) {
  return page.evaluate(() => {
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

/**
 * A cheap fingerprint of the canvas pixels. Comparing two samples proves frames
 * are still arriving, rather than that one arrived once.
 */
export async function canvasFingerprint(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas || !canvas.width) return '';
    const probe = document.createElement('canvas');
    probe.width = canvas.width;
    probe.height = canvas.height;
    const ctx = probe.getContext('2d');
    ctx.drawImage(canvas, 0, 0);
    const data = ctx.getImageData(0, 0, probe.width, probe.height).data;
    let hash = 0;
    for (let i = 0; i < data.length; i += 4 * 13) hash = (hash * 31 + data[i]) | 0;
    return String(hash);
  });
}

/**
 * The canvas box in CSS pixels plus its pixel dimensions, so a click can be
 * placed at a chosen point *inside the frame* regardless of how it is scaled.
 */
export async function canvasGeometry(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return null;
    const r = canvas.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height, pw: canvas.width, ph: canvas.height };
  });
}

/** Clicks at a point in canvas pixels, mapped to screen coordinates. */
export async function clickCanvasPoint(page, px, py) {
  const box = await canvasGeometry(page);
  if (!box) throw new Error('no canvas to click');
  await page.mouse.click(
    box.x + (px / box.pw) * box.width,
    box.y + (py / box.ph) * box.height,
  );
  return { px, py, box };
}

export const test = base.extend({
  // eslint-disable-next-line no-empty-pattern
  stack: async ({}, use) => {
    const stack = await startStack({
      startWeb: !process.env.E2E_EXTERNAL,
      log: () => {},
    });
    try {
      await use(stack);
    } finally {
      // Runs on pass, on fail and on timeout: a leaked gateway or fake host is
      // what pinned this machine twice during earlier work.
      await stack.stop();
    }
  },

  // A relative goto('/') in connect() resolves against this.
  baseURL: async ({ stack }, use) => {
    await use(stack.appUrl);
  },
});
