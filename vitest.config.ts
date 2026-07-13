import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    include: ['lib/calc-engine/tests/**/*.test.ts', 'lib/**/*.test.ts', 'app/**/*.test.ts'],
  },
});
