/**
 * @fileoverview
 * Storage-driver interfaces and configuration shapes shared by every driver
 * (memory, disk, json-file, atomic, packed) and consumed by the
 * cache-context factory.
 *
 * Two parallel interface hierarchies exist intentionally:
 *  - `SyncDriver<T>` — used for memory drivers where every operation is
 *    O(1) and synchronous I/O is acceptable.
 *  - `AsyncDriver<T>` — used for disk/network drivers where every operation
 *    is awaitable.
 *
 * `DriverConfig` (formerly `CacheConfig`) was renamed to avoid colliding with
 * the higher-level `CacheConfig` declared in `@ngcompass/config`'s health
 * subsystem.
 */

/** Operational statistics returned by every driver. */
export interface DriverStats {
    /** Number of entries currently stored. */
    entries: number;
    /** Approximate on-disk / in-memory footprint in bytes. */
    size: number;
}

/**
 * Asynchronous storage driver used for disk and network-backed caches.
 *
 * Implementations may expose extra capabilities (e.g. `prune`, `flush`,
 * `bulkSet`) via interface intersections; consumers must declare the union
 * type they need rather than feature-detect at runtime.
 */
export interface AsyncDriver<T> {
    get(key: string): Promise<T | undefined>;
    set(key: string, value: T): Promise<void>;
    has(key: string): Promise<boolean>;
    delete(key: string): Promise<void>;
    clear(): Promise<void>;
    getStats(): Promise<DriverStats>;
    /** Optional: write many entries in a single atomic I/O operation. */
    bulkSet?(entries: ReadonlyArray<readonly [string, T]>): Promise<void>;
}

/** Synchronous storage driver used for memory-resident caches. */
export interface SyncDriver<T> {
    get(key: string): T | undefined;
    set(key: string, value: T): void;
    has(key: string): boolean;
    delete(key: string): void;
    clear(): void;
    getStats(): DriverStats;
}

/** Configuration for the memory driver. */
export interface MemoryDriverConfig {
    /** Maximum number of entries before LRU eviction kicks in. */
    maxItems?: number;
    /** Maximum approximate footprint in bytes before LRU eviction kicks in. */
    maxSize?: number;
    /** Time-to-live in milliseconds; entries older than this are evicted lazily. */
    ttl?: number;
}

/**
 * Configuration for the disk driver and its variants (atomic, packed,
 * json-file). The `ttl` field is accepted for API consistency but the
 * cacache-backed disk driver doesn't enforce it — entries live until
 * explicitly pruned or cleared.
 */
export interface DiskDriverConfig {
    /** Directory used as the cache root. */
    path: string;
    /** Reserved for future per-driver TTL support; currently unused on disk. */
    ttl?: number;
}

/** Top-level cache configuration passed to `createCacheContext`. */
export interface DriverConfig {
    memory?: MemoryDriverConfig;
    disk?: Partial<DiskDriverConfig>;
}

/** @deprecated Use {@link DriverConfig}. Retained for source-level compatibility. */
export type CacheConfig = DriverConfig;
