import type { ConfigValidationResult } from '@ngcompass/common';
import type {
  AstEntry,
  CacheEntry,
  CacheMetadata,
  FileCacheEntry,
  FileMeta,
  SourceEntry,
} from './cache-entry.js';

export interface SourceCache {
  get: (hash: string) => SourceEntry | undefined;
  set: (hash: string, entry: SourceEntry) => void;
  has: (hash: string) => boolean;
}

export interface AstCache {
  get: (hash: string) => Promise<AstEntry | undefined>;
  set: (hash: string, entry: AstEntry) => Promise<void>;
  invalidate: (hash: string) => Promise<void>;
}

export interface ConfigCache {
  get: (hash: string) => Promise<ConfigValidationResult | undefined>;
  set: (hash: string, report: ConfigValidationResult) => Promise<void>;
}

export interface MetaCache {
  get: (filePath: string) => Promise<FileMeta | undefined>;
  set: (filePath: string, meta: FileMeta) => Promise<void>;
  delete: (filePath: string) => Promise<void>;

  flush: () => Promise<void>;
}

export interface PlanCache {
  get: (key: string) => Promise<unknown>;
  set: (key: string, plan: unknown) => Promise<void>;
  delete: (key: string) => Promise<void>;
}

export interface FileCache {
  get: (key: string) => Promise<FileCacheEntry | undefined>;
  set: (key: string, files: string[], stats?: unknown) => Promise<void>;
}

export interface ResultCache {
  get: <T>(hash: string) => Promise<T | undefined>;
  set: <T>(hash: string, result: T) => Promise<void>;
  has: (hash: string) => Promise<boolean>;
  delete: (hash: string) => Promise<void>;

  getMany: <T>(
    hashes: ReadonlyArray<string>
  ) => Promise<ReadonlyMap<string, T>>;
  setMany: <T>(entries: ReadonlyArray<readonly [string, T]>) => Promise<void>;
  hasMany: (hashes: ReadonlyArray<string>) => Promise<ReadonlySet<string>>;

  getWithMetadata: <T>(hash: string) => Promise<CacheEntry<T> | undefined>;
  getManyWithMetadata: <T>(
    hashes: ReadonlyArray<string>
  ) => Promise<ReadonlyMap<string, CacheEntry<T>>>;
  updateMetadata: (
    hash: string,
    updates: Partial<CacheMetadata>
  ) => Promise<void>;

  flush: () => Promise<void>;
}
