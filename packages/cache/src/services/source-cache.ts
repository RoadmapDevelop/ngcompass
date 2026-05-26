import type { SyncDriver } from '../drivers/types.js';

export interface SourceEntry {
  content: string;

  filePath: string;
}

export interface SourceCache {
  get: (hash: string) => SourceEntry | undefined;
  set: (hash: string, entry: SourceEntry) => void;
  has: (hash: string) => boolean;
}

export const createSourceCache = (
  driver: SyncDriver<SourceEntry>
): SourceCache => ({
  get: (hash) => driver.get(hash),
  set: (hash, entry) => driver.set(hash, entry),
  has: (hash) => driver.has(hash),
});
