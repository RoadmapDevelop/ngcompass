/**
 * @ngcompass/cache
 *
 * Caching layer for the ngcompass analysis engine.
 * Provides disk, memory, and JSON-file backed drivers,
 * plus cache services for AST, results, config, and meta data.
 */

// Core types
export * from './types.js';
export * from './constants.js';

// Hashing primitives (also used by @ngcompass/planner)
export { computeHash, initHasher } from './hashing.js';
export { stableSerialize, SerializationError } from './utils/stable-serialize.js';

// Cache key context
export * from './key-context.js';

// Drivers
export type { CacheConfig } from './drivers/types.js';

// Context (CacheContext factory)
export * from './context.js';

// Runtime cache helpers used by the CLI
export * from './runtime-cache.js';

