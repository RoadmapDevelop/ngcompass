export interface DriverStats {
  entries: number;

  size: number;
}

export interface AsyncDriver<T> {
  get(key: string): Promise<T | undefined>;
  set(key: string, value: T): Promise<void>;
  has(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  getStats(): Promise<DriverStats>;

  bulkSet?(entries: ReadonlyArray<readonly [string, T]>): Promise<void>;
}

export interface SyncDriver<T> {
  get(key: string): T | undefined;
  set(key: string, value: T): void;
  has(key: string): boolean;
  delete(key: string): void;
  clear(): void;
  getStats(): DriverStats;
}

export interface MemoryDriverConfig {
  maxItems?: number;

  maxSize?: number;

  ttl?: number;
}

export interface DiskDriverConfig {
  path: string;

  ttl?: number;
}

export interface DriverConfig {
  memory?: MemoryDriverConfig;
  disk?: Partial<DiskDriverConfig>;
}

export type CacheConfig = DriverConfig;
