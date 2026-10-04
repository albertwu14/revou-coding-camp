import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Use node environment; tests set up their own JSDOM instances manually
    environment: 'node',
    include: ['**/*.test.js'],
  },
});
