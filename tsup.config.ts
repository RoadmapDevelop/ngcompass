import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['packages/*/src/index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    treeshake: true,
    minify: false, // Enable for production
    target: 'node18',
    outDir: 'dist',
});