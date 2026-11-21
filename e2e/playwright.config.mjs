// Playwright configuration for the end-to-end suite.
//
// The specs live in e2e/specs/ and the stack they run against is started by
// e2e/stack.mjs (fake RustDesk host + gateway + the built web app on ephemeral
// ports). Nothing is started here: Playwright has no way to thread the fake
// host's OS-assigned ports into the gateway's environment, so the fixture does
// it and the CI job starts the services itself.

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './specs',

  // Only *our* specs. Playwright's default pattern (`**/*.spec.*`) matches
  // nothing here, but its .test.* fallback would walk into gateway/ and web/ and
  // try to run the vitest unit suites with the wrong runner — which is exactly
  // what happened on the first attempt. Keep this narrow and explicit.
  testMatch: /.*\.spec\.mjs$/,

  // One worker. This machine has 4 threads and every test drives a real browser
  // against a video stream; parallelism buys a few seconds and costs the box.
  workers: 1,
  fullyParallel: false,

  // No retries locally: a retry would paper over exactly the flakiness this
  // suite exists to catch. CI gets one, for a cold browser start.
  retries: process.env.CI ? 1 : 0,

  // A session needs a handshake, a keyframe and a few frames; the offline case
  // also waits through three rendezvous attempts.
  timeout: 60_000,
  expect: { timeout: 20_000 },

  // The report is written, never served: opening a server would leave a process
  // holding a port after the run.
  reporter: [
    ['list'],
    ['html', { outputFolder: '.artifacts/html-report', open: 'never' }],
  ],
  outputDir: '.artifacts/test-results',

  use: {
    // A failure must show the page, not just a stack trace: the trace is a
    // timeline you can click through, the screenshot is the moment it broke.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',

    // Pin the UI language. The app detects it from navigator.language, and the
    // assertions read English strings ('Connect', the error titles).
    locale: 'en-US',

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
});
