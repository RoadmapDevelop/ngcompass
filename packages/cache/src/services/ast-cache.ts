/**
 * @fileoverview
 * Two-tier AST cache: memory (L1, hot) over disk (L2, cold).
 *
 * Reads check L1 first; on miss they fall through to L2 and, on L2 hit,
 * promote the entry back to L1. Writes are persisted to both tiers so a
 * process restart never warms up empty. All L2 operations are wrapped in
 * defensive `try/catch` blocks because disk corruption or driver errors
 * must degrade to a cache miss — never crash the consuming analysis run.
 */

import { debug } from '@ngcompass/common';
import type { AsyncDriver, SyncDriver } from '../drivers/types.js';

/** Entry stored in the AST cache. */
export interface AstEntry {
    /** Absolute file path that produced the AST. */
    filePath: string;
    /**
     * Opaque AST payload. Typed as `unknown` because different consumers
     * (TypeScript parser, Angular template parser, etc.) store different
     * shapes here; runtime shape checks live at the consumer boundary.
     */
    ast: unknown;
}

/** Read/write surface exposed to consumers. */
export interface AstCache {
    get: (hash: string) => Promise<AstEntry | undefined>;
    set: (hash: string, entry: AstEntry) => Promise<void>;
    invalidate: (hash: string) => Promise<void>;
}

/** One-line diagnostic helper for the catch sites below. */
const describe = (err: unknown): string =>
    err instanceof Error ? err.message : String(err);

/**
 * Builds a two-tier AST cache backed by the supplied L1/L2 drivers.
 *
 * @param l1 - Synchronous memory driver (hot tier).
 * @param l2 - Asynchronous disk driver (cold tier).
 * @returns A unified {@link AstCache} that hides the tiering from callers.
 */
export const createAstCache = (
    l1: SyncDriver<AstEntry>,
    l2: AsyncDriver<AstEntry>,
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
            debug('cache', `Failed to read AST from L2 for ${hash}: ${describe(error)}`);
        }
        return undefined;
    },

    set: async (hash, entry) => {
        l1.set(hash, entry);
        try {
            await l2.set(hash, entry);
        } catch (error) {
            debug('cache', `Failed to persist AST to L2 for ${hash}: ${describe(error)}`);
        }
    },

    invalidate: async (hash) => {
        l1.delete(hash);
        try {
            await l2.delete(hash);
        } catch (error) {
            debug('cache', `Failed to invalidate AST in L2 for ${hash}: ${describe(error)}`);
        }
    },
});
