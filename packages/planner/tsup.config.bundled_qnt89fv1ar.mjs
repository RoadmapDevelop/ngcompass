import { defineConfig } from 'tsup';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import UnpluginSWC from 'unplugin-swc';
var isProduction = process.env.NODE_ENV === 'production';
var isBenchmark = process.env.BENCHMARK === 'true';
function findWorkspaceRoot(startPath) {
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
var workspaceRoot = findWorkspaceRoot(process.cwd());
var swcConfigPath = join(workspaceRoot, '.swcrc');
var swcConfig = existsSync(swcConfigPath)
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
function createConfig(overrides = {}) {
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
  });
}
var tsup_config_default = createConfig();

var tsup_config_default2 = createConfig({
  entry: ['src/index.ts'],
});
export { tsup_config_default2 as default };
