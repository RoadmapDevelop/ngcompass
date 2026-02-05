import { defineConfig } from 'tsup';
import type { Options } from 'tsup';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import UnpluginSWC from 'unplugin-swc';

const isProduction = process.env.NODE_ENV === 'production';
const isBenchmark = process.env.BENCHMARK === 'true';

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

// Load SWC config from workspace root
const swcConfig = existsSync(swcConfigPath)
    ? JSON.parse(readFileSync(swcConfigPath, 'utf-8'))
    : {
          jsc: {
              parser: {
                  syntax: 'typescript',
                  decorators: true,
                  dynamicImport: true,
              },
              transform: {
                  legacyDecorator: true,
                  decoratorMetadata: true,
              },
              target: 'es2022',
          },
          module: {
              type: 'es6',
          },
      };

/**
 * Shared tsup configuration factory for all packages
 * Each package should extend this with their specific entry points
 *
 * Usage in package:
 * import { createConfig } from '../../tsup.config.js';
 * export default createConfig({ entry: ['src/index.ts'] });
 */
export function createConfig(overrides: Options = {}): Options {
    return defineConfig({
        format: ['cjs', 'esm'],
        dts: {
            resolve: true, // Faster type resolution
        },
        splitting: false, // Library mode - keep false for most packages
        sourcemap: isProduction ? false : true, // Skip sourcemaps in prod for smaller output
        clean: true,
        treeshake: true,
        minify: false, // Let SWC handle minification when needed
        target: 'node18',
        outDir: 'dist',
        // Use SWC plugin for faster transpilation
        esbuildPlugins: [
            UnpluginSWC.esbuild({
                jsc: swcConfig.jsc,
                module: swcConfig.module,
            }),
        ],
        // Skip node_modules bundling for library code
        skipNodeModulesBundle: true,
        // Platform configuration
        platform: 'node',
        // Shims
        shims: false, // Disable for Node.js libraries
        // Enable code splitting for better caching (when needed)
        ...(isBenchmark && {
            metafile: true,
            onSuccess: 'echo "Build completed successfully"',
        }),
        ...overrides,
    } as Options);
}

// Default export for direct usage (backwards compatible)
export default createConfig();