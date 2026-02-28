/**
 * Content Hashing — Core utility
 *
 * Deterministic hashing for cache invalidation.
 * Uses xxhash-wasm (fast) with SHA-256 fallback before initialization.
 * The full planner/hashing.ts (file-level helpers) will import computeHash from here.
 */

import crypto from 'node:crypto';
import xxhash from 'xxhash-wasm';

let h64: ((input: string | Uint8Array) => string) | undefined;

/**
 * Initializes the xxhash hasher (call once at startup).
 */
export const initHasher = async (): Promise<void> => {
    if (h64) return;
    const { h64: hasher } = await xxhash();
    h64 = (input: string | Uint8Array) =>
        hasher(input as any)
            .toString(16)
            .padStart(16, '0');
};

/**
 * Computes a hash using xxhash if initialized, SHA-256 otherwise.
 *
 * @param content - Data to hash
 * @returns Hex-encoded hash string
 */
export const computeHash = (content: string | Uint8Array): string => {
    if (h64) return h64(content);
    const hasher = crypto.createHash('sha256');
    hasher.update(content);
    return hasher.digest('hex');
};
