import { debug } from '@ngcompass/common';
import type { AsyncDriver, SyncDriver } from '../drivers/types.js';

export interface AstEntry {
  filePath: string;

  ast: unknown;
}

export interface AstCache {
  get: (hash: string) => Promise<AstEntry | undefined>;
  set: (hash: string, entry: AstEntry) => Promise<void>;
  invalidate: (hash: string) => Promise<void>;
}

const describe = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

export const createAstCache = (
  l1: SyncDriver<AstEntry>,
  l2: AsyncDriver<AstEntry>
): AstCache => ({
  get: async (hash) => {
    const hot = l1.get(hash);
    if (hot) return hot;

    try {
      const cold = await l2.get(hash);
      if (cold) {
        l1.set(hash, cold);
        return cold;
      }
    } catch (error) {
      debug(
        'cache',
        `Failed to read AST from L2 for ${hash}: ${describe(error)}`
      );
    }
    return undefined;
  },

  set: async (hash, entry) => {
    l1.set(hash, entry);
    try {
      await l2.set(hash, entry);
    } catch (error) {
      debug(
        'cache',
        `Failed to persist AST to L2 for ${hash}: ${describe(error)}`
      );
    }
  },

  invalidate: async (hash) => {
    l1.delete(hash);
    try {
      await l2.delete(hash);
    } catch (error) {
      debug(
        'cache',
        `Failed to invalidate AST in L2 for ${hash}: ${describe(error)}`
      );
    }
  },
});
