import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // The fake-host integration tests open real sockets and run timers, so they
    // need more than the 5s default.
    testTimeout: 30000,
    hookTimeout: 30000,
    // One file at a time in a single fork. The defaults would start one worker
    // per CPU (this machine has 4 threads) and the integration files bind real
    // ports and stream video, which is exactly the kind of parallel load that
    // makes the whole machine unusable. The suite is ~2s either way.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
  },
});
