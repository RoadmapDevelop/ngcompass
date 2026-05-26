import { AsyncDriver } from '../drivers/types.js';
import { debug } from '@ngcompass/common';

export interface CacheMetadata {
  readonly taskId: string;

  readonly timestamp: number;

  readonly hits: number;

  readonly lastAccess: number;
}

export interface CacheEntry<T> {
  readonly result: T;

  readonly metadata: CacheMetadata;
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

const BATCH_SIZE = 200;

export const createResultCache = (
  driver: AsyncDriver<unknown>
): ResultCache => {
  const getMetadataKey = (hash: string): string => `${hash}.meta`;

  const getOrCreateMetadata = async (hash: string): Promise<CacheMetadata> => {
    const metaKey = getMetadataKey(hash);
    const existing = (await driver.get(metaKey)) as CacheMetadata | undefined;

    if (existing) {
      return existing;
    }

    const newMeta: CacheMetadata = {
      taskId: hash,
      timestamp: Date.now(),
      hits: 0,
      lastAccess: Date.now(),
    };

    await driver.set(metaKey, newMeta);
    return newMeta;
  };

  const incrementHits = async (hash: string): Promise<void> => {
    const meta = await getOrCreateMetadata(hash);
    const updated: CacheMetadata = {
      ...meta,
      hits: meta.hits + 1,
      lastAccess: Date.now(),
    };
    await driver.set(getMetadataKey(hash), updated);
  };

  const pendingWrites = new Map<string, unknown>();

  const drainPendingWrites = async (): Promise<void> => {
    if (pendingWrites.size === 0) return;

    const entries = [...pendingWrites.entries()];
    pendingWrites.clear();

    const now = Date.now();

    if (driver.bulkSet) {
      const all: Array<readonly [string, unknown]> = [];
      for (const [hash, result] of entries) {
        all.push([hash, result]);
        all.push([
          getMetadataKey(hash),
          {
            taskId: hash,
            timestamp: now,
            hits: 0,
            lastAccess: now,
          } satisfies CacheMetadata,
        ]);
      }
      await driver.bulkSet(all);
    } else {
      for (let i = 0; i < entries.length; i += BATCH_SIZE) {
        const batch = entries.slice(i, i + BATCH_SIZE);
        await Promise.all(
          batch.map(([hash, result]) => driver.set(hash, result))
        );
        await Promise.all(
          batch.map(([hash]) =>
            driver.set(getMetadataKey(hash), {
              taskId: hash,
              timestamp: now,
              hits: 0,
              lastAccess: now,
            } satisfies CacheMetadata)
          )
        );
      }
    }

    debug('cache', `Flushed ${entries.length} buffered results to disk`);
  };

  return {
    get: async <T>(hash: string): Promise<T | undefined> => {
      if (pendingWrites.has(hash)) {
        return pendingWrites.get(hash) as T;
      }

      const result = (await driver.get(hash)) as T | undefined;
      if (result !== undefined) {
        incrementHits(hash).catch((err) => {
          debug(
            'cache',
            `incrementHits failed for ${hash}: ${err instanceof Error ? err.message : String(err)}`
          );
        });
      }
      return result;
    },

    set: async <T>(hash: string, result: T): Promise<void> => {
      await driver.set(hash, result);

      await getOrCreateMetadata(hash);
    },

    has: async (hash: string): Promise<boolean> => {
      if (pendingWrites.has(hash)) return true;
      return driver.has(hash);
    },

    delete: async (hash: string): Promise<void> => {
      pendingWrites.delete(hash);
      await driver.delete(hash);
      try {
        await driver.delete(getMetadataKey(hash));
      } catch (error) {
        debug(
          'cache',
          `Failed to delete metadata for ${hash}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    },

    getMany: async <T>(
      hashes: ReadonlyArray<string>
    ): Promise<ReadonlyMap<string, T>> => {
      if (hashes.length === 0) {
        return new Map<string, T>();
      }

      const results = new Map<string, T>();

      for (let i = 0; i < hashes.length; i += BATCH_SIZE) {
        const batch = hashes.slice(i, i + BATCH_SIZE);
        await Promise.all(
          batch.map(async (hash) => {
            if (pendingWrites.has(hash)) {
              results.set(hash, pendingWrites.get(hash) as T);
              return;
            }

            const result = (await driver.get(hash)) as T | undefined;
            if (result !== undefined) {
              results.set(hash, result);

              incrementHits(hash).catch((err) => {
                debug(
                  'cache',
                  `incrementHits failed for ${hash}: ${err instanceof Error ? err.message : String(err)}`
                );
              });
            }
          })
        );
      }

      return results;
    },

    setMany: async <T>(
      entries: ReadonlyArray<readonly [string, T]>
    ): Promise<void> => {
      if (entries.length === 0) return;

      for (const [hash, result] of entries) {
        pendingWrites.set(hash, result);
      }

      debug(
        'cache',
        `Buffered ${entries.length} results (total pending: ${pendingWrites.size})`
      );
    },

    hasMany: async (
      hashes: ReadonlyArray<string>
    ): Promise<ReadonlySet<string>> => {
      if (hashes.length === 0) {
        return new Set<string>();
      }

      const hasPending = hashes.some((h) => pendingWrites.has(h));
      if (!hasPending) {
        try {
          const stats = await driver.getStats();
          if (stats.entries === 0) {
            return new Set<string>();
          }
        } catch {
          return new Set<string>();
        }
      }

      const existing = new Set<string>();

      for (let i = 0; i < hashes.length; i += BATCH_SIZE) {
        const batch = hashes.slice(i, i + BATCH_SIZE);
        await Promise.all(
          batch.map(async (hash) => {
            if (pendingWrites.has(hash)) {
              existing.add(hash);
              return;
            }
            const exists = await driver.has(hash);
            if (exists) {
              existing.add(hash);
            }
          })
        );
      }

      return existing;
    },

    getWithMetadata: async <T>(
      hash: string
    ): Promise<CacheEntry<T> | undefined> => {
      const result = (
        pendingWrites.has(hash)
          ? pendingWrites.get(hash)
          : await driver.get(hash)
      ) as T | undefined;

      if (result === undefined) {
        return undefined;
      }

      const metadata = await getOrCreateMetadata(hash);

      await incrementHits(hash);

      return { result, metadata };
    },

    getManyWithMetadata: async <T>(
      hashes: ReadonlyArray<string>
    ): Promise<ReadonlyMap<string, CacheEntry<T>>> => {
      if (hashes.length === 0) {
        return new Map<string, CacheEntry<T>>();
      }

      const entries = new Map<string, CacheEntry<T>>();
      const metadataUpdates: Array<[string, CacheMetadata]> = [];

      for (let i = 0; i < hashes.length; i += BATCH_SIZE) {
        const batch = hashes.slice(i, i + BATCH_SIZE);
        await Promise.all(
          batch.map(async (hash) => {
            const result = (
              pendingWrites.has(hash)
                ? pendingWrites.get(hash)
                : await driver.get(hash)
            ) as T | undefined;

            if (result !== undefined) {
              const metadata = await getOrCreateMetadata(hash);
              const updated: CacheMetadata = {
                ...metadata,
                hits: metadata.hits + 1,
                lastAccess: Date.now(),
              };
              entries.set(hash, { result, metadata: updated });
              metadataUpdates.push([hash, updated]);
            }
          })
        );
      }

      if (metadataUpdates.length > 0) {
        for (let i = 0; i < metadataUpdates.length; i += BATCH_SIZE) {
          const batch = metadataUpdates.slice(i, i + BATCH_SIZE);
          await Promise.all(
            batch.map(async ([hash, updated]) => {
              await driver.set(getMetadataKey(hash), updated);
            })
          );
        }
      }

      return entries;
    },

    updateMetadata: async (
      hash: string,
      updates: Partial<CacheMetadata>
    ): Promise<void> => {
      const existing =
        ((await driver.get(getMetadataKey(hash))) as
          | CacheMetadata
          | undefined) ?? (await getOrCreateMetadata(hash));
      const updated: CacheMetadata = {
        ...existing,
        ...updates,
      };
      await driver.set(getMetadataKey(hash), updated);
    },

    flush: drainPendingWrites,
  };
};
