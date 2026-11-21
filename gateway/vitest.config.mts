import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // The fake-host integration test opens real sockets on ephemeral ports and
    // waits on timers, so it needs more than the 5s default.
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
