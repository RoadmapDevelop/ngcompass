export const CACHE_VERSION = '1.0.0';
export const SCHEMA_VERSION = 1;

/**
 * Prefix for cache keys to ensure versioning.
 * Format: v{CACHE_VERSION}-s{SCHEMA_VERSION}
 */
export const CACHE_KEY_PREFIX = `v${CACHE_VERSION}-s${SCHEMA_VERSION}`;
