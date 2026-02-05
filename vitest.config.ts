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