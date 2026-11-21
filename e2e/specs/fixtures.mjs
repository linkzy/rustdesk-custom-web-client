// Shared fixtures for the end-to-end specs.
//
// The stack is started once per file (not per test): bringing up a fake host,
// a gateway and a video stream costs a couple of seconds, and the specs are
// written to be independent anyway.

import { test as base, expect } from '@playwright/test';
import { startStack } from '../stack.mjs';

export { expect };

export const test = base.extend({
  // eslint-disable-next-line no-empty-pattern
  stack: async ({}, use) => {
    const stack = await startStack({ startWeb: true, log: () => {} });
    try {
      await use(stack);
    } finally {
      // Always stop everything, even when an assertion throws: a leaked gateway
      // or browser is what made earlier runs pin this machine.
      await stack.stop();
    }
  },

  // eslint-disable-next-line no-empty-pattern
  page: async ({ page, stack }, use) => {
    // Every page starts from the app under test, never a blank tab.
    await page.goto(stack.appUrl);
    await use(page);
  },
});

/** Fills the connect form and submits it. */
export async function connect(page, { id, password }) {
  await page.getByLabel('Device ID').fill(id);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Connect' }).click();
}

/**
 * Samples the canvas and returns how many distinct colours it holds.
 * A blank or single-colour canvas means nothing was decoded.
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

/** A cheap fingerprint of the canvas pixels, to compare two moments. */
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
    for (let i = 0; i < data.length; i += 4 * 13) {
      hash = (hash * 31 + data[i]) | 0;
    }
    return String(hash);
  });
}
