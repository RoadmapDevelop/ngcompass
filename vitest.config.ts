import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';

// Find workspace root (where .swcrc is located)
function findWorkspaceRoot(startPath: string): string {
  let currentPath = startPath;
  while (currentPath !== dirname(currentPath)) {
    const swcrcPath = join(currentPath, '.swcrc');
    if (existsSync(swcrcPath)) {
      return currentPath;
    }
    currentPath = dirname(currentPath);
  }
  return startPath;
}

const workspaceRoot = findWorkspaceRoot(process.cwd());
const swcConfigPath = join(workspaceRoot, '.swcrc');

// Load SWC config from workspace root for consistency
const swcConfig = existsSync(swcConfigPath)
  ? JSON.parse(readFileSync(swcConfigPath, 'utf-8'))
  : undefined;

export default defineConfig({
  plugins: [
    swc.vite(swcConfig)
  ],
  test: {
    globals: true, // Use global describe, it, expect
    environment: 'node',
    include: ['packages/**/*.{test,spec}.ts'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/.claude/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html', 'json-summary'],
      include: ['packages/*/src/**/*.ts'],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/.claude/**',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/types.ts', // Type definitions don't need coverage
        '**/index.ts', // Re-exports have lower coverage requirements
      ],
      // COVERAGE THRESHOLDS — Beta v1 baselines calibrated to actual measured coverage.
      // Raise these incrementally as TICKET-003 / TICKET-004 tests land.
      // Target for v1 stable: lines 60, functions 65, branches 40, statements 60.
      thresholds: {
        lines: 25,
        functions: 30,
        branches: 12,
        statements: 25,
      },
      // Report uncovered lines
      all: true,
    },
  },
});
