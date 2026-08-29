import fs from 'node:fs/promises';
import path from 'node:path';
import writeFileAtomic from 'write-file-atomic';
import { getDirectoryStats } from '../filesystem.js';
import type { AsyncDriver, DiskDriverConfig } from '../models/index.js';

const JSON_EXTENSION = '.json';

const listJsonKeys = (entries: string[]): string[] =>
  entries
    .filter((name) => name.endsWith(JSON_EXTENSION))
    .map((name) => name.slice(0, -JSON_EXTENSION.length));

const safeReadDir = async (dir: string): Promise<string[]> => {
  try {
    return await fs.readdir(dir);
  } catch {
    return [];
  }
};

const tryReadJsonFile = async (
  filePath: string
): Promise<string | undefined> => {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return undefined;
  }
};

const tryUnlink = async (filePath: string): Promise<void> => {
  try {
    await fs.unlink(filePath);
  } catch {}
};

export const createAtomicDriver = <T>(
  config: DiskDriverConfig
): AsyncDriver<T> => {
  const cacheDir = config.path;
  const getFilePath = (key: string): string =>
    path.join(cacheDir, `${key}${JSON_EXTENSION}`);

  let catalog: Set<string> | null = null;
  let catalogPromise: Promise<void> | null = null;
  let catalogGeneration = 0;

  const ensureDir = async (): Promise<void> => {
    try {
      await fs.mkdir(cacheDir, { recursive: true });
    } catch {}
  };

  const ensureCatalog = async (): Promise<void> => {
    if (catalog) return;
    if (!catalogPromise) {
      const localGeneration = catalogGeneration;
      catalogPromise = (async () => {
        try {
          await ensureDir();
          const files = await safeReadDir(cacheDir);
          if (catalogGeneration === localGeneration) {
            catalog = new Set(listJsonKeys(files));
          }
        } finally {
          catalogPromise = null;
          if (!catalog) catalog = new Set();
        }
      })();
    }
    await catalogPromise;
  };

  const syncCatalogInsert = async (key: string): Promise<void> => {
    if (catalogPromise) await catalogPromise;
    catalog?.add(key);
  };

  const syncCatalogRemove = async (key: string): Promise<void> => {
    if (catalogPromise) await catalogPromise;
    catalog?.delete(key);
  };

  return {
    get: async (key) => {
      if (catalog && !catalog.has(key)) return undefined;

      const filePath = getFilePath(key);
      const data = await tryReadJsonFile(filePath);
      if (data === undefined) {
        catalog?.delete(key);
        return undefined;
      }

      try {
        return JSON.parse(data) as T;
      } catch {
        catalog?.delete(key);
        return undefined;
      }
    },

    set: async (key, value) => {
      await ensureDir();
      await writeFileAtomic(getFilePath(key), JSON.stringify(value), {
        encoding: 'utf-8',
      });
      if (catalog || catalogPromise) {
        await syncCatalogInsert(key);
      }
    },

    has: async (key) => {
      await ensureCatalog();
      return catalog?.has(key) ?? false;
    },

    delete: async (key) => {
      await tryUnlink(getFilePath(key));
      if (catalog || catalogPromise) {
        await syncCatalogRemove(key);
      }
    },

    clear: async () => {
      try {
        await fs.rm(cacheDir, { recursive: true, force: true });
      } catch {}
      await ensureDir();
      catalogGeneration += 1;
      catalog = new Set();
    },

    getStats: async () => getDirectoryStats(cacheDir),
  };
};
