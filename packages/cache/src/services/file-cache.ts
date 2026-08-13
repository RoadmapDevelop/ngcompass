import type {
  AsyncDriver,
  FileCache,
  FileCacheEntry,
} from '../models/index.js';

export const createFileCache = (
  driver: AsyncDriver<FileCacheEntry>
): FileCache => ({
  get: (key) => driver.get(key),
  set: (key, files, stats) =>
    driver.set(key, { files, stats, timestamp: Date.now() }),
});
