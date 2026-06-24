import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['tests/integration/setup-env.ts'],
    include: ['tests/integration/**/*.test.ts'],
    hookTimeout: 30000,
    testTimeout: 30000,
    fileParallelism: false,
  },
});
