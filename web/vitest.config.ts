import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    // jsdom gives the passwordStorage tests a real localStorage; the pure
    // frame/connect-form tests do not need a DOM.
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    // jsdom is memory-hungry and this is a 4-thread machine: one file at a time
    // in a single fork keeps a test run from competing with everything else.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
  },
});
