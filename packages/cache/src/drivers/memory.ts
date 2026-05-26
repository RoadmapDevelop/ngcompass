import { LRUCache } from 'lru-cache';
import type { MemoryDriverConfig, SyncDriver } from './types.js';

const FALLBACK_ENTRY_SIZE = 1024;

const DEFAULT_MAX_SIZE_BYTES = 50 * 1024 * 1024;

const DEFAULT_MAX_ITEMS = 500;

const estimateSize = (value: unknown): number => {
  if (typeof value === 'string') return value.length;
  if (value instanceof Uint8Array) return value.byteLength;
  return FALLBACK_ENTRY_SIZE;
};

export const createMemoryDriver = <T>(
  config: MemoryDriverConfig = {}
): SyncDriver<T> => {
  const cache = new LRUCache<string, T & object>({
    max: config.maxItems ?? DEFAULT_MAX_ITEMS,
    maxSize: config.maxSize ?? DEFAULT_MAX_SIZE_BYTES,
    sizeCalculation: estimateSize,
    ttl: config.ttl,
  });

  return {
    get: (key) => cache.get(key) as T | undefined,
    set: (key, value) => {
      cache.set(key, value as T & object);
    },
    has: (key) => cache.has(key),
    delete: (key) => {
      cache.delete(key);
    },
    clear: () => {
      cache.clear();
    },
    getStats: () => ({
      entries: cache.size,
      size: cache.calculatedSize,
    }),
  };
};
