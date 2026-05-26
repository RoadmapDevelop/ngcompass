import fs from 'node:fs/promises';
import path from 'node:path';
import writeFileAtomic from 'write-file-atomic';
import { debug } from '@ngcompass/common';
import type { AsyncDriver, DiskDriverConfig, DriverStats } from './types.js';

const META_FILENAME = 'meta.json';
const DEBOUNCE_MS = 2000;

export const createJsonFileDriver = <T>(
  config: DiskDriverConfig
): AsyncDriver<T> & { flush: () => Promise<void> } => {
  const filePath = path.join(config.path, META_FILENAME);

  let cache: Map<string, T> | null = null;
  let loadPromise: Promise<void> | null = null;
  let saveTimeout: NodeJS.Timeout | null = null;
  let savePromise: Promise<void> | null = null;

  const load = async (): Promise<void> => {
    if (cache) return;
    if (loadPromise) return loadPromise;

    loadPromise = (async () => {
      try {
        await fs.mkdir(config.path, { recursive: true });
        const content = await fs.readFile(filePath, 'utf-8');
        const data: unknown = JSON.parse(content);
        if (data && typeof data === 'object' && !Array.isArray(data)) {
          cache = new Map(Object.entries(data as Record<string, T>));
        } else {
          debug('cache', `Discarding non-object meta payload at ${filePath}`);
          cache = new Map();
        }
      } catch {
        cache = new Map();
      } finally {
        loadPromise = null;
      }
    })();

    return loadPromise;
  };

  const flush = async (): Promise<void> => {
    if (saveTimeout) {
      clearTimeout(saveTimeout);
      saveTimeout = null;
    }
    if (!cache) return;
    if (savePromise) await savePromise;

    const snapshot = cache;
    savePromise = (async () => {
      try {
        await fs.mkdir(config.path, { recursive: true });
        await writeFileAtomic(
          filePath,
          JSON.stringify(Object.fromEntries(snapshot))
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        debug('cache', `Failed to flush metadata cache to ${filePath}: ${msg}`);
      } finally {
        savePromise = null;
      }
    })();

    await savePromise;
  };

  const scheduleSave = (): void => {
    if (saveTimeout) return;
    saveTimeout = setTimeout(() => {
      saveTimeout = null;
      void flush();
    }, DEBOUNCE_MS);
    saveTimeout.unref();
  };

  return {
    get: async (key) => {
      await load();
      return cache?.get(key);
    },
    set: async (key, value) => {
      await load();
      cache?.set(key, value);
      scheduleSave();
    },
    has: async (key) => {
      await load();
      return cache?.has(key) ?? false;
    },
    delete: async (key) => {
      await load();
      if (cache?.delete(key)) {
        scheduleSave();
      }
    },
    clear: async () => {
      if (saveTimeout) {
        clearTimeout(saveTimeout);
        saveTimeout = null;
      }
      cache = new Map();
      try {
        await fs.unlink(filePath);
      } catch {}
    },
    getStats: async (): Promise<DriverStats> => {
      await load();
      return { entries: cache?.size ?? 0, size: 0 };
    },
    flush,
  };
};
