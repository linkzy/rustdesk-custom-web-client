// The happy path, driven through the real UI: connect, see video, click, type.
//
// Every assertion is about what a user gets, not about internals: a canvas that
// is painting and keeps changing, and input that reached the machine. The
// expected values come from the app and the protocol, not from the fake host's
// implementation details.

import {
  test,
  expect,
  connect,
  hasCanvas,
  canvasColours,
  canvasFingerprint,
  canvasGeometry,
  clickCanvasPoint,
} from './fixtures.mjs';

test.describe('a real session', () => {
  test('connects and streams video that keeps changing', async ({ page, stack }) => {
    await connect(page, { id: stack.fakeHost.id, password: stack.fakeHost.password });

    await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 });

    // The fake host's own counter, not a wall clock: this also proves the
    // gateway relayed frames before we start sampling pixels.
    await stack.control.waitForFrames(10);

    // A decoded frame has many colours; a blank or failed decode has one.
    await expect.poll(() => canvasColours(page), {
      message: 'the canvas should paint a decoded frame (more than 3 colours)',
    }).toBeGreaterThan(3);

    // And it must not be a still image. Two samples taken a moment apart have
    // to differ, which is what proves frames are still arriving.
    const first = await canvasFingerprint(page);
    await expect.poll(() => canvasFingerprint(page), {
      message: 'the picture should change between frames (canvas fingerprint)',
      intervals: [250, 250, 250, 250],
    }).not.toBe(first);

    // App.tsx renders "640×360 · H264" — U+00D7, not ASCII 'x'.
    const { width, height } = stack.fakeHost.screen;
    await expect(page.getByText(`${width}\u00d7${height}`, { exact: false })).toBeVisible();
  });

  test('a click reaches the machine at the coordinates clicked', async ({ page, stack }) => {
    await connect(page, { id: stack.fakeHost.id, password: stack.fakeHost.password });
    await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 });
    await stack.control.waitForFrames(10);

    await stack.control.clearEvents();

    // Pick a point inside the frame and click it the way a user would.
    const box = await canvasGeometry(page);
    const clickX = Math.round(box.pw * 0.25);
    const clickY = Math.round(box.ph * 0.75);
    await clickCanvasPoint(page, clickX, clickY);

    // RustDesk encodes mask = (button << 3) | type, with button 0x01 = left and
    // type 1 = down (see RemoteScreen.tsx). A left press is 9, not 1.
    const MOUSE_LEFT_DOWN = 9;
    await expect.poll(async () => {
      const events = await stack.control.events('mouse');
      return events.some((e) => e.detail.mask === MOUSE_LEFT_DOWN);
    }, { message: 'the fake host should receive a left-button-down event' }).toBe(true);

    const down = (await stack.control.events('mouse'))
      .find((e) => e.detail.mask === MOUSE_LEFT_DOWN);

    // Allow 2px: the canvas is scaled to fit, so one screen pixel is a fraction
    // of a frame pixel and rounding can go either way.
    expect(Math.abs(down.detail.x - clickX)).toBeLessThanOrEqual(2);
    expect(Math.abs(down.detail.y - clickY)).toBeLessThanOrEqual(2);
  });

  test('typing arrives as key events', async ({ page, stack }) => {
    await connect(page, { id: stack.fakeHost.id, password: stack.fakeHost.password });
    await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 });
    await stack.control.waitForFrames(10);

    // Focus the remote surface first: without it the app ignores the keys.
    const box = await canvasGeometry(page);
    await clickCanvasPoint(page, Math.round(box.pw / 2), Math.round(box.ph / 2));
    await expect.poll(async () => (await stack.control.events('mouse')).length > 0, {
      message: 'the focusing click should reach the host first',
    }).toBe(true);

    await stack.control.clearEvents();
    await page.keyboard.type('ab');

    // 'a' and 'b' must arrive as code points, not as scancodes: the gateway
    // sends `unicode` for plain typing (see buildKeyPayload).
    await expect.poll(async () => {
      const unicodes = (await stack.control.events('key'))
        .map((k) => k.detail.unicode)
        .filter((u) => typeof u === 'number');
      return unicodes.includes(97) && unicodes.includes(98);
    }, { message: "keys 'a' and 'b' should arrive as unicode 97 and 98" }).toBe(true);
  });

  test('a Ctrl shortcut arrives with ctrl and the character code', async ({ page, stack }) => {
    // KI-006: Ctrl+C etc. used to send `chr` = the browser keyCode (67 = the
    // CHARACTER "C") while the user pressed "c". Upstream's Legacy-mode
    // process_chr reads `chr` as a Unicode scalar, so the host was asked to press
    // the wrong key. This asserts the payload a host actually needs.
    await connect(page, { id: stack.fakeHost.id, password: stack.fakeHost.password });
    await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 });
    await stack.control.waitForFrames(10);

    const box = await canvasGeometry(page);
    await clickCanvasPoint(page, Math.round(box.pw / 2), Math.round(box.ph / 2));
    await expect.poll(async () => (await stack.control.events('mouse')).length > 0, {
      message: 'the focusing click should reach the host first',
    }).toBe(true);

    await stack.control.clearEvents();
    await page.keyboard.press('Control+c');

    await expect.poll(async () => (await stack.control.events('key')).length > 0, {
      message: 'Ctrl+C should produce a key event',
    }).toBe(true);

    const keyEvents = await stack.control.events('key');
    // The Ctrl key press/release is itself a key event carrying modifier 4, so
    // select on the union field instead: the letter is the event with `chr`.
    const down = keyEvents
      .find((e) => e.detail.down === true && typeof e.detail.chr === 'number');

    expect(down, `no character key-down event: ${JSON.stringify(keyEvents)}`).toBeTruthy();
    expect(down.detail.modifiers).toContain(4);

    // The character the user typed: 'c' is 99, not the virtual-key 67.
    expect(down.detail.chr).toBe('c'.codePointAt(0));
    expect(down.detail).not.toHaveProperty('unicode');
  });
});
