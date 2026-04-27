import { ConfigIssue } from "@ngcompass/common";
import { MESSAGES } from "../messages.js";
import { ConfigBlock, ConfigBlockValidation, ValidationContext } from "../types.js";

/**
 * Constants governing validation limits and thresholds.
 */
const LIMITS = {
    WORKERS_MIN: 1,
    WORKERS_CPU_MULTIPLIER: 2,
    CACHE_TTL_MIN: 0
} as const;

/**
 * Performs a comprehensive validation of a configuration block, which can represent
 * either the root configuration or a specific profile.
 *
 * @param block - The configuration object to validate.
 * @param context - The validation context providing access to environmental data like CPU count.
 * @param basePath - The breadcrumb path used for accurate error reporting in nested structures.
 * @returns A validation result object containing any discovered issues.
 */
export function validateConfigBlock(
    block: ConfigBlock,
    context: ValidationContext,
    basePath: (string | number)[] = []
): ConfigBlockValidation {
    const issues: ConfigIssue[] = [];

    /**
     * Resource Allocation: Worker Threads
     * Validates that the worker count is within reasonable hardware limits.
     */
    if (block.maxWorkers !== undefined) {
        const cpuCores = context.os.cpus().length;
        const workerLimit = cpuCores * LIMITS.WORKERS_CPU_MULTIPLIER;

        if (block.maxWorkers < LIMITS.WORKERS_MIN) {
            issues.push({
                ...MESSAGES.WORKERS_BELOW_MINIMUM(),
                path: [...basePath, "maxWorkers"]
            });
        } else if (block.maxWorkers > workerLimit) {
            issues.push({
                ...MESSAGES.WORKERS_EXCESSIVE(block.maxWorkers, workerLimit),
                path: [...basePath, "maxWorkers"]
            });
        }
    }

    /**
     * Persistence: Cache Time-to-Live
     * Ensures the cache TTL is a non-negative value.
     */
    if (block.cache && typeof block.cache === "object" && block.cache.ttl !== undefined) {
        const { ttl } = block.cache;
        const path = [...basePath, "cache", "ttl"];

        if (ttl < LIMITS.CACHE_TTL_MIN) {
            issues.push({ ...MESSAGES.NEGATIVE_CACHE_TTL(ttl), path });
        }
    }

    return { issues };
}
