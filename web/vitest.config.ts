import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    // jsdom gives the passwordStorage tests a real localStorage; the pure
    // frame/connect-form tests do not need a DOM.
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
