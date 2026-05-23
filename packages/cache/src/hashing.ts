/**
 * @fileoverview
 * Content hashing primitives shared by the cache and planner.
 *
 * Uses xxhash-wasm when initialized (fast, suitable for the hot path) and
 * falls back to a Node `crypto` SHA-256 digest before the wasm module is
 * loaded so that hashing always works synchronously from process start.
 *
 * xxhash-wasm exposes separate entry points for strings (`h64`) and bytes
 * (`h64Raw`); we dispatch on the input type so callers can pass either
 * without a cast through `any`.
 */

import crypto from 'node:crypto';
import xxhash from 'xxhash-wasm';

/** Cached xxhash 64-bit digest function. `undefined` until {@link initHasher} resolves. */
let h64: ((input: string | Uint8Array) => string) | undefined;

/**
 * Formats an xxhash 64-bit digest as a zero-padded 16-character hex string so
 * digests are visually comparable and safe to embed in filesystem paths.
 */
const formatDigest = (digest: bigint): string => digest.toString(16).padStart(16, '0');

/**
 * Loads the xxhash-wasm module and caches the digest function.
 *
 * Safe to call multiple times; subsequent calls resolve immediately. Awaited
 * once at process startup so the synchronous `computeHash` path always has
 * the fast implementation available.
 *
 * @returns {Promise<void>} Resolves after the wasm hasher is ready.
 */
export const initHasher = async (): Promise<void> => {
    if (h64) return;
    const api = await xxhash();
    h64 = (input: string | Uint8Array): string =>
        formatDigest(typeof input === 'string' ? api.h64(input) : api.h64Raw(input));
};

/**
 * Computes a hex-encoded digest of `content`.
 *
 * Returns a 16-character xxhash digest after {@link initHasher} resolves,
 * and a 64-character SHA-256 digest until then. Both digests are stable for
 * identical inputs across process restarts.
 *
 * @param content - String or byte buffer to hash.
 * @returns Hex-encoded digest.
 */
export const computeHash = (content: string | Uint8Array): string => {
    if (h64) return h64(content);
    const hasher = crypto.createHash('sha256');
    hasher.update(content);
    return hasher.digest('hex');
};
