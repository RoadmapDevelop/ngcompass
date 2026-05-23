/**
 * @fileoverview
 * Public entry point for `@ngcompass/reporters`.
 *
 * Surfaces the reporter contracts, the `getReporter` / `getConfigReporter`
 * / `getCacheReporter` factories, the output abstraction (`ReporterOutput`
 * + `processOutput` + `createTestOutput`), the code-frame renderer, and
 * every concrete reporter implementation. Consumers (CLI) typically use
 * only the factories.
 */

export * from './types.js';
export * from './factory.js';
export * from './output.js';
export * from './code-frame.js';
export * from './reporters/config.js';
export * from './reporters/cache.js';
export * from './reporters/console-reporter.js';
export * from './reporters/json-reporter.js';
export * from './reporters/html-reporter.js';
export * from './reporters/sarif-reporter.js';
export * from './reporters/rules-reporter.js';
