import type { SourceCache, SourceEntry, SyncDriver } from '../models/index.js';

export const createSourceCache = (
  driver: SyncDriver<SourceEntry>
): SourceCache => ({
  get: (hash) => driver.get(hash),
  set: (hash, entry) => driver.set(hash, entry),
  has: (hash) => driver.has(hash),
});
