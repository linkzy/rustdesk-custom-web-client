// The two failure paths users hit first. Both are about the message a person
// sees, so they assert on visible text, not on console output.

import { test, expect, connect } from './fixtures.mjs';

test.describe('failures the user actually hits', () => {
  test('a wrong password shows a friendly message and no video', async ({ page, stack }) => {
    await connect(page, { id: stack.fakeHost.id, password: 'definitely-not-the-password' });

    // web/src/utils/errors.ts maps the raw "Wrong password" from the host to
    // this exact title; asserting the title catches a mapping regression too.
    await expect(page.getByText('Wrong password', { exact: true }))
      .toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Check the password in RustDesk/i)).toBeVisible();

    // And there must be no remote screen pretending to have connected.
    await expect(page.locator('canvas')).toHaveCount(0);
  });

  test('an unknown ID says the machine is offline', async ({ page }) => {
    // The fake host answers only for its own ID; anything else is OFFLINE.
    await connect(page, { id: '999999999', password: 'whatever' });

    await expect(page.getByText('That machine is offline', { exact: true }))
      .toBeVisible({ timeout: 40_000 });
    await expect(page.locator('canvas')).toHaveCount(0);
  });
});
