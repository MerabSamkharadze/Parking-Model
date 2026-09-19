import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Tests cover the sim engine only (SPEC §1); no DOM environment needed.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 60_000, // 24 h runs with invariant checks take a few seconds each
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
});
