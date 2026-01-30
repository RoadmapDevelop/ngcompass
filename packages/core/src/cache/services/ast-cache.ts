import { AsyncDriver, SyncDriver } from '../drivers/types.js';

export interface AstEntry {
    filePath: string;
    ast: unknown;
}

export interface AstCache {
    get: (hash: string) => Promise<AstEntry | undefined>;
    set: (hash: string, entry: AstEntry) => Promise<void>;
    invalidate: (hash: string) => Promise<void>;
}

/**
 * Creates a Two-Tiered AST Cache.
 * Strategy: 
 * 1. Read: Memory (L1) -> Disk (L2).
 * 2. Write: Memory (L1) -> Disk (L2).
 * 3. Promotion: If found in L2, promote to L1.
 * Key: Content Hash.
 */
export const createAstCache = (
    l1: SyncDriver<AstEntry>,
    l2: AsyncDriver<AstEntry>
): AstCache => {
    return {
        get: async (hash: string): Promise<AstEntry | undefined> => {
            // 1. Check L1
            const hot = l1.get(hash);
            if (hot) return hot;

            // 2. Check L2
            try {
                const cold = await l2.get(hash);
                if (cold) {
                    // 3. Promote to L1
                    l1.set(hash, cold);
                    return cold;
                }
            } catch (error) {
                // If L2 fails (e.g. deserialization, corruption), we ignore it and return undefined.
                // Optionally we could delete it, but the driver implementation handles its own consistency usually.
                // If using our disk driver, it might just throw.
                // Safe default: assume miss.
                return undefined;
            }

            return undefined;
        },

        set: async (hash: string, entry: AstEntry): Promise<void> => {
            // Write to both
            l1.set(hash, entry);
            await l2.set(hash, entry);
        },

        invalidate: async (hash: string): Promise<void> => {
            l1.delete(hash);
            await l2.delete(hash);
        }
    };
};
