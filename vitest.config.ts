import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true, // Use global describe, it, expect
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html', 'json-summary'],
      include: ['packages/*/src/**/*.ts'],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/types.ts', // Type definitions don't need coverage
        '**/index.ts', // Re-exports have lower coverage requirements
      ],
      // COVERAGE THRESHOLDS - Enforce minimum coverage
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90,
      },
      // Report uncovered lines
      all: true,
    },
  },
});