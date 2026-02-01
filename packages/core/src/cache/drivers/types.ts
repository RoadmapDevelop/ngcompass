/**
 * Generic storage driver interface for asynchronous operations.
 * Used for Disk and Network IO.
 */
export interface AsyncDriver<T> {
    get(key: string): Promise<T | undefined>;
    set(key: string, value: T): Promise<void>;
    has(key: string): Promise<boolean>;
    delete(key: string): Promise<void>;
    clear(): Promise<void>;
}

/**
 * Generic storage driver interface for synchronous operations.
 * Used for Memory operations.
 */
export interface SyncDriver<T> {
    get(key: string): T | undefined;
    set(key: string, value: T): void;
    has(key: string): boolean;
    delete(key: string): void;
    clear(): void;
}

/**
 * Configuration for the memory driver.
 */
export interface MemoryDriverConfig {
    maxItems?: number;
    maxSize?: number; // Maximum size in bytes
    ttl?: number;
}

/**
 * Configuration for the disk driver.
 */
export interface DiskDriverConfig {
    path: string;
    ttl?: number;
}

/**
 * Global cache configuration.
 */
export interface CacheConfig {
    memory?: MemoryDriverConfig;
    disk?: Partial<DiskDriverConfig>;
}
