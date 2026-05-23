/**
 * @fileoverview
 * Tiny content-hashing helper shared by the config discovery loader and the
 * issue-location enricher.
 *
 * Both modules need to derive a SHA-1 digest of the on-disk config file so
 * they can key cache entries by exact file bytes. Centralizing the algorithm
 * keeps the digest format consistent so a hash computed in one path can be
 * matched against an entry written by the other.
 */

import crypto from 'node:crypto';

/**
 * Computes the SHA-1 hex digest of `content`.
 *
 * @param content - UTF-8 text whose digest is required.
 * @returns Lowercase hex string representation of the SHA-1 digest.
 */
export function sha1Hex(content: string): string {
    return crypto.createHash('sha1').update(content).digest('hex');
}
