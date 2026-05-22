/**
 * @fileoverview
 * Composite SHA-256 hasher used by `CacheContext.computeHash`.
 *
 * The cache mixes a version-prefixed salt into every key so that an upgrade
 * of either the tool or the on-disk schema invalidates pre-existing entries
 * automatically. The salt is intentionally a *required* parameter to
 * `computeCompositeHash` so callers can't accidentally lose the invalidation
 * salt by omitting the argument.
 */

import crypto from 'node:crypto';
import { CACHE_KEY_PREFIX } from '../constants.js';

/**
 * Computes a SHA-256 digest of `content`, mixing `salt` into the hash so that
 * salt changes invalidate every previously-computed key.
 *
 * @param content - Bytes (as text) to hash.
 * @param salt    - Invalidation salt; pass {@link CACHE_KEY_PREFIX} (or a
 *                  derived value) unless you have a reason to override it.
 * @returns Lowercase hex digest.
 */
export const computeCompositeHash = (content: string, salt: string): string => {
    const hash = crypto.createHash('sha256');
    hash.update(content);
    if (salt) hash.update(salt);
    return hash.digest('hex');
};

