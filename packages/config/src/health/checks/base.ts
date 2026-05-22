/**
 * @fileoverview
 * Base configuration-block check.
 *
 * Validates fields that exist on every block — root config or profile —
 * namely worker-count bounds and cache TTL. Profile-specific checks call
 * this with a non-empty `basePath` so issues are attributed to the right
 * profile entry.
 */

import type { ConfigIssue } from '@ngcompass/common';
import { MESSAGES } from '../messages.js';
import type { ConfigBlock, ConfigBlockValidation, ValidationContext } from '../types.js';

/** Bounds applied by the base block check. */
const LIMITS = {
    WORKERS_MIN: 1,
    WORKERS_CPU_MULTIPLIER: 2,
    CACHE_TTL_MIN: 0,
} as const;

/**
 * Validates fields common to both the root config and individual profiles.
 *
 * @param block - The block to validate (root config or a profile entry).
 * @param context - Provides CPU-count lookup for worker bounds.
 * @param basePath - Path prefix used to attribute issues inside profiles.
 * @returns {ConfigBlockValidation} Issues discovered in this block.
 */
export function validateConfigBlock(
    block: ConfigBlock,
    context: ValidationContext,
    basePath: (string | number)[] = [],
): ConfigBlockValidation {
    const issues: ConfigIssue[] = [];

    // Worker bounds: must be ≥ 1 and not absurdly larger than the host CPU count.
    if (block.maxWorkers !== undefined) {
        const cpuCores = context.os.cpus().length;
        const workerLimit = cpuCores * LIMITS.WORKERS_CPU_MULTIPLIER;

        if (block.maxWorkers < LIMITS.WORKERS_MIN) {
            issues.push({
                ...MESSAGES.WORKERS_BELOW_MINIMUM,
                path: [...basePath, 'maxWorkers'],
            });
        } else if (block.maxWorkers > workerLimit) {
            issues.push({
                ...MESSAGES.WORKERS_EXCESSIVE(block.maxWorkers, workerLimit),
                path: [...basePath, 'maxWorkers'],
            });
        }
    }

    // Cache TTL: must be a non-negative number when supplied as an object.
    if (block.cache && typeof block.cache === 'object' && block.cache.ttl !== undefined) {
        const { ttl } = block.cache;
        if (ttl < LIMITS.CACHE_TTL_MIN) {
            issues.push({
                ...MESSAGES.NEGATIVE_CACHE_TTL(ttl),
                path: [...basePath, 'cache', 'ttl'],
            });
        }
    }

    return { issues };
}
