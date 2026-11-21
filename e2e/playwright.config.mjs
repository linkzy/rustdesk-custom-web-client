// Playwright configuration for the end-to-end suite.
//
// The tests live here (e2e/), not in web/, so they never collide with the app's
// own tooling. The stack they run against is started by e2e/stack.mjs: fake
// RustDesk host + gateway + web on ephemeral ports, unless E2E_EXTERNAL=1, in
// which case CI has already started them as background services.

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './specs',
  // One worker: this machine has 4 threads and each test drives a real browser
  // against a video stream. Parallelism here buys seconds and costs the box.
  workers: 1,
  fullyParallel: false,
  // A real session needs a handshake, a keyframe and a few frames; 60s is
  // generous without hiding a hang.
  timeout: 60_000,
  expect: { timeout: 15_000 },
  // Retries would mask flakiness in the thing we are trying to prove. The only
  // retry that makes sense is in CI, where a first-run browser start can be slow.
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never' }]]
    : [['list']],
  // A failure must show the page, not just a stack trace.
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'chromium',
      // Only Chromium: the product needs WebCodecs video decoding, which is the
      // point of the test, and one browser is all this machine should run.
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  outputDir: './.artifacts',
});
