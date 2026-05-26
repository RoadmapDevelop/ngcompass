import { defineConfig } from 'tsup';
import type { Options } from 'tsup';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import UnpluginSWC from 'unplugin-swc';

const isProduction = process.env.NODE_ENV === 'production';
const isBenchmark = process.env.BENCHMARK === 'true';

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

export function createConfig(overrides: Options = {}): Options {
  return defineConfig({
    format: ['cjs', 'esm'],
    dts: {
      resolve: true,
    },
    splitting: false,
    sourcemap: isProduction ? false : true,
    clean: true,
    treeshake: true,
    minify: false,
    target: 'node18',
    outDir: 'dist',

    esbuildPlugins: [
      UnpluginSWC.esbuild({
        jsc: swcConfig.jsc,
        module: swcConfig.module,
      }),
    ],

    skipNodeModulesBundle: true,

    platform: 'node',

    shims: false,

    ...(isBenchmark && {
      metafile: true,
      onSuccess: 'echo "Build completed successfully"',
    }),
    ...overrides,
  } as Options);
}

export default createConfig();
