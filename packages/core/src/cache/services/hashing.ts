import crypto from 'node:crypto';

/**
 * Computes a customized SHA-256 hash for content.
 * Accepts an optional salt (e.g., tool version) to ensure cache invalidation on upgrades.
 */
export const computeCompositeHash = (content: string, salt: string = ''): string => {
    const hash = crypto.createHash('sha256');
    hash.update(content);
    if (salt) {
        hash.update(salt);
    }
    return hash.digest('hex');
};
