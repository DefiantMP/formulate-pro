import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['lib/calc-engine/tests/**/*.test.ts'],
  },
});
