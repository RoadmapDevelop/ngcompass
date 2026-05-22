/**
 * @fileoverview
 * Public entry point for `@ngcompass/cache`.
 *
 * Surfaces the cache services, drivers, hashing primitives, key-context
 * helpers, and the runtime cache factory used by the CLI. Implementations
 * are intentionally kept private — consumers receive a `CacheContext` and
 * never reach for individual driver modules.
 */

export * from './types.js';
export * from './constants.js';

// Hashing primitives (also used by @ngcompass/planner).
export { computeHash, initHasher } from './hashing.js';

// Cache-key context (consumed by planner + config loader).
export * from './key-context.js';

// Driver configuration surface (consumed by `createRuntimeCache` callers).
export type { CacheConfig, DriverConfig } from './drivers/types.js';

// Context factory.
export * from './context.js';

// CLI-facing runtime cache helper.
export * from './runtime-cache.js';
