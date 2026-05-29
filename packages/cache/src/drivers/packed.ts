import fs from 'node:fs/promises';
import path from 'node:path';
import v8 from 'node:v8';
import zlib from 'node:zlib';
import { promisify } from 'node:util';
import writeFileAtomic from 'write-file-atomic';
import type { AsyncDriver, DriverStats } from './types.js';

const PACK_SUFFIX = '.pack';
const CACHE_GZIP_LEVEL = zlib.constants.Z_DEFAULT_COMPRESSION;

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

export const createPackedFileDriver = <T>(config: {
  path: string;
}): AsyncDriver<T> & {
  bulkSet(entries: ReadonlyArray<readonly [string, T]>): Promise<void>;
} => {
  const filePath = config.path + PACK_SUFFIX;
  const map = new Map<string, T>();
  let loaded = false;

  const ensureLoaded = async (): Promise<void> => {
    if (loaded) return;
    loaded = true;
    try {
      const buf = await fs.readFile(filePath);
      const restored = v8.deserialize(await gunzip(buf)) as Map<string, T>;
      for (const [k, v] of restored) map.set(k, v);
    } catch {}
  };

  const save = async (): Promise<void> => {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const compressed = await gzip(v8.serialize(map), { level: CACHE_GZIP_LEVEL });
    await writeFileAtomic(filePath, compressed);
  };

  return {
    get: async (key) => {
      await ensureLoaded();
      return map.get(key);
    },

    set: async (key, value) => {
      await ensureLoaded();
      map.set(key, value);
      await save();
    },

    has: async (key) => {
      await ensureLoaded();
      return map.has(key);
    },

    delete: async (key) => {
      await ensureLoaded();
      map.delete(key);
      await save();
    },

    clear: async () => {
      map.clear();

      loaded = true;
      try {
        await fs.unlink(filePath);
      } catch {}
    },

    getStats: async (): Promise<DriverStats> => {
      await ensureLoaded();
      let size = 0;
      try {
        const stat = await fs.stat(filePath);
        size = stat.size;
      } catch {}
      return { entries: map.size, size };
    },

    bulkSet: async (entries) => {
      await ensureLoaded();
      for (const [k, v] of entries) map.set(k, v);
      await save();
    },
  };
};
