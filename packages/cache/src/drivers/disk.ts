import v8 from 'node:v8';
import zlib from 'node:zlib';
import { promisify } from 'node:util';
import cacache from 'cacache';
import { debug } from '@ngcompass/common';
import { getDirectoryStats } from '../utils/fs.js';
import type { AsyncDriver, DiskDriverConfig } from '../models/index.js';

const CACHE_GZIP_LEVEL = zlib.constants.Z_DEFAULT_COMPRESSION;

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

const errorCode = (err: unknown): string | undefined => {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = err.code;
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
        const deserialized = v8.deserialize(await gunzip(result.data)) as T;
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
      const buffer = await gzip(v8.serialize(value), { level: CACHE_GZIP_LEVEL });
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
