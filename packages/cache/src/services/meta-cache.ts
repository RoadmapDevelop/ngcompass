import type { AsyncDriver, FileMeta, MetaCache } from '../models/index.js';

type FlushableDriver = AsyncDriver<FileMeta> & { flush: () => Promise<void> };

const isFlushableDriver = (
  driver: AsyncDriver<FileMeta>
): driver is FlushableDriver =>
  'flush' in driver && typeof driver.flush === 'function';

export const createMetaCache = (driver: AsyncDriver<FileMeta>): MetaCache => ({
  get: (filePath) => driver.get(filePath),
  set: (filePath, meta) => driver.set(filePath, meta),
  delete: (filePath) => driver.delete(filePath),
  flush: async () => {
    if (isFlushableDriver(driver)) {
      await driver.flush();
    }
  },
});
