import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';

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

const swcConfig = existsSync(swcConfigPath)
  ? JSON.parse(readFileSync(swcConfigPath, 'utf-8'))
  : undefined;

export default defineConfig({
  plugins: [swc.vite(swcConfig)],
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.{test,spec}.ts'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/.claude/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html', 'json-summary'],
      include: ['**/src/**/*.ts'],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/.claude/**',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/types.ts',
        '**/index.ts',
      ],

      thresholds: {
        lines: 25,
        functions: 30,
        branches: 12,
        statements: 25,
      },

      all: true,
    },
  },
});
