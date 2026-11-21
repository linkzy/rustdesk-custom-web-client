// The happy path, driven through the real UI: connect, see video, click, type.
//
// Every assertion is about what the user gets, not about internals: a canvas
// that is painting, and input that reached the "machine".

import { test, expect, connect, canvasColours, canvasFingerprint } from './fixtures.mjs';

test.describe('a real session', () => {
  test('reaches connected and streams video that keeps changing', async ({ page, stack }) => {
    await connect(page, { id: stack.fakeHost.id, password: stack.fakeHost.password });

    // The header reports the remote resolution once the host answers. App.tsx
    // renders it as "640x360 - H264" (ASCII x, codec after a separator).
    await expect(page.getByText(`${stack.fakeHost.screen.width}x${stack.fakeHost.screen.height}`))
      .toBeVisible({ timeout: 30_000 });

    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();

    // The fake host must have sent frames; this reads its own state rather than
    // sleeping and hoping.
    await stack.control.waitForFrames(10);

    // Pixels: a decoded frame has many colours; a failed decode leaves a blank.
    await expect.poll(() => canvasColours(page), { timeout: 20_000 })
      .toBeGreaterThan(3);

    // And it must not be a still image: two samples a moment apart differ.
    // This is what proves frames are still arriving, not just that one did.
    const first = await canvasFingerprint(page);
    await expect.poll(() => canvasFingerprint(page), {
      timeout: 20_000,
      intervals: [250, 250, 250, 250],
    }).not.toBe(first);
  });

  test('a click reaches the machine at the coordinates clicked', async ({ page, stack }) => {
    await connect(page, { id: stack.fakeHost.id, password: stack.fakeHost.password });
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible({ timeout: 30_000 });
    await stack.control.waitForFrames(10);

    await stack.control.clearEvents();

    // Click a known point inside the canvas box and translate it the same way
    // the app does (canvas pixels, not screen pixels).
    const box = await canvas.boundingBox();
    const size = await canvas.evaluate((el) => ({ width: el.width, height: el.height }));
    const clickX = Math.round(size.width * 0.25);
    const clickY = Math.round(size.height * 0.75);

    await page.mouse.click(
      box.x + (clickX / size.width) * box.width,
      box.y + (clickY / size.height) * box.height,
    );

    // The host records what it received; assert on the coordinate it saw.
    await expect.poll(async () => (await stack.control.events('mouse')).length, {
      timeout: 15_000,
    }).toBeGreaterThan(0);

    const mouse = (await stack.control.events('mouse'))[0];
    expect(mouse.detail.mask).toBe(1); // left button down
    expect(Math.abs(mouse.detail.x - clickX)).toBeLessThanOrEqual(2);
    expect(Math.abs(mouse.detail.y - clickY)).toBeLessThanOrEqual(2);
  });

  test('typing arrives as key events', async ({ page, stack }) => {
    await connect(page, { id: stack.fakeHost.id, password: stack.fakeHost.password });
    await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 });
    await stack.control.waitForFrames(10);

    await stack.control.clearEvents();

    // Focus the remote surface the way a user would, then type.
    await page.locator('canvas').click();
    await page.keyboard.type('ab');

    await expect.poll(async () => (await stack.control.events('key')).length, {
      timeout: 15_000,
    }).toBeGreaterThanOrEqual(2);

    const keys = await stack.control.events('key');
    const unicodes = keys.map((k) => k.detail.unicode).filter((u) => typeof u === 'number');
    // 'a' and 'b' must arrive as their code points, not as scancodes.
    expect(unicodes).toContain(97);
    expect(unicodes).toContain(98);
  });
});
