// The two failure paths users hit first.
//
// The titles asserted here are the exact strings from
// web/src/utils/errors.ts (friendlyError), so a regression in that mapping
// fails this test rather than silently showing a generic message.

import { test, expect, connect, hasCanvas } from './fixtures.mjs';

test.describe('failures the user actually hits', () => {
  test('a wrong password shows the friendly message', async ({ page, stack }) => {
    await connect(page, { id: stack.fakeHost.id, password: 'definitely-not-the-password' });

    // The host rejects the hash; the gateway relays "Wrong password" and
    // errors.ts maps it to this pair. The badge is one element containing
    // "❌ Wrong password" plus the hint, so assert on the pair together rather
    // than exact-text matching a fragment.
    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible({ timeout: 30_000 });
    await expect(alert).toContainText('Wrong password');
    await expect(alert).toContainText('Check the password in RustDesk');

    // And it must not pretend to have connected.
    expect(await hasCanvas(page)).toBe(false);
  });

  test('an unknown ID says the machine is offline', async ({ page, stack }) => {
    // The fake host answers only for its own ID; anything else is OFFLINE.
    await connect(page, { id: '999999999', password: 'whatever' });

    // Rendezvous retries three times with two seconds between them before the
    // gateway gives up, so this takes a few seconds by design.
    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible({ timeout: 40_000 });
    await expect(alert).toContainText('That machine is offline');
    await expect(alert).toContainText('Make sure RustDesk is running');

    expect(await hasCanvas(page)).toBe(false);
  });
});
