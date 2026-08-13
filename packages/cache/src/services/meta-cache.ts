import type { AsyncDriver, FileMeta, MetaCache } from '../models/index.js';

export const createMetaCache = (driver: AsyncDriver<FileMeta>): MetaCache => ({
  get: (filePath) => driver.get(filePath),
  set: (filePath, meta) => driver.set(filePath, meta),
  delete: (filePath) => driver.delete(filePath),
  flush: async () => {
    const flushable = driver as { flush?: () => Promise<void> };
    if (typeof flushable.flush === 'function') {
      await flushable.flush();
    }
  },
});
