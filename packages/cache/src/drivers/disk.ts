import v8 from 'node:v8';
import cacache from 'cacache';
import { debug } from '@ngcompass/common';
import { getDirectoryStats } from '../utils/fs.js';
import type { AsyncDriver, DiskDriverConfig } from './types.js';

const errorCode = (err: unknown): string | undefined => {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
};

export const createDiskDriver = <T>(
  config: DiskDriverConfig
): AsyncDriver<T> & { prune: () => Promise<void> } => {
  const cachePath = config.path;

  return {
    get: async (key) => {
      try {
        const tReadStart = performance.now();
        const result = await cacache.get(cachePath, key);
        const tReadEnd = performance.now();

        const tDeserStart = performance.now();
        const deserialized = v8.deserialize(result.data) as T;
        const tDeserEnd = performance.now();

        debug(
          'cache',
          `read=${(tReadEnd - tReadStart).toFixed(2)}ms ` +
            `deserialize=${(tDeserEnd - tDeserStart).toFixed(2)}ms ` +
            `bytes=${result.data.length}`
        );

        return deserialized;
      } catch (err) {
        if (errorCode(err) === 'ENOENT') return undefined;

        const message = err instanceof Error ? err.message : String(err);
        debug('cache', `Dropping unreadable entry ${key}: ${message}`);
        try {
          await cacache.rm.entry(cachePath, key);
        } catch {}
        return undefined;
      }
    },

    set: async (key, value) => {
      const buffer = v8.serialize(value);
      await cacache.put(cachePath, key, buffer);
    },

    has: async (key) => {
      try {
        const info = await cacache.get.info(cachePath, key);
        return Boolean(info);
      } catch {
        return false;
      }
    },

    delete: async (key) => {
      await cacache.rm.entry(cachePath, key);
    },

    clear: async () => {
      await cacache.rm.all(cachePath);
    },

    prune: async () => {
      await cacache.verify(cachePath);
    },

    getStats: async () => {
      return getDirectoryStats(cachePath);
    },
  };
};
