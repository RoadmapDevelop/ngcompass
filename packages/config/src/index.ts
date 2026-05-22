/**
 * @fileoverview
 * Public entry point for `@ngcompass/config`.
 *
 * Surfaces the schema, normalization defaults, loader, health-check
 * subsystem, the `defineConfig` authoring helper, and the CLI-facing
 * action wrappers (`initConfig`, `validateConfig`). Plugin loading is
 * exposed as a single named export to keep the surface area predictable.
 */

export * from './actions/healthcheck.js';
export * from './actions/init.js';
export * from './define-config.js';
export * from './health/index.js';
export * from './loaders/discovery.js';
export * from './loaders/loader.js';
export * from './schemas/defaults.js';
export * from './schemas/schema.js';
export { loadPlugins } from './plugin-loader.js';
