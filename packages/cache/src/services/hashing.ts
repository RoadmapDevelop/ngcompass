import crypto from 'node:crypto';
import { CACHE_KEY_PREFIX } from '../constants.js';

/**
 * Computes a customized SHA-256 hash for content.
 * Accepts an optional salt (e.g., tool version) to ensure cache invalidation on upgrades.
 */
export const computeCompositeHash = (content: string, salt: string = CACHE_KEY_PREFIX): string => {
    const hash = crypto.createHash('sha256');
    hash.update(content);
    if (salt) {
        hash.update(salt);
    }
    return hash.digest('hex');
};
