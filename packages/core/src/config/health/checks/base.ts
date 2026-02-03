import { ConfigIssue } from "@ngcompass/common";
import { MESSAGES } from "../messages.js";
import { ConfigBlock, ConfigBlockValidation, ValidationContext } from "../types.js";

/**
 * Reusable check for config blocks (root config or profiles)
 */
export function validateConfigBlock(
    block: ConfigBlock,
    context: ValidationContext,
    basePath: (string | number)[] = []
): ConfigBlockValidation {
    const issues: ConfigIssue[] = [];

    // Mutually exclusive: autoFix & autoFixOnSave
    if (block.autoFix && block.autoFixOnSave) {
        issues.push({
            ...MESSAGES.MUTUALLY_EXCLUSIVE_AUTOFIX(),
            path: [...basePath, "autoFix"]
        });
    }

    // Max workers
    if (block.maxWorkers !== undefined) {
        if (block.maxWorkers < 1) {
            issues.push({
                ...MESSAGES.WORKERS_BELOW_MINIMUM(),
                path: [...basePath, "maxWorkers"]
            });
        }

        const cpuCores = context.os.cpus().length;
        if (block.maxWorkers > cpuCores * 2) {
            issues.push({
                ...MESSAGES.WORKERS_EXCESSIVE(block.maxWorkers, cpuCores * 2),
                path: [...basePath, "maxWorkers"]
            });
        }
    }

    // Debounce validation
    if (block.watchOptions?.debounce !== undefined) {
        const debounce = block.watchOptions.debounce;
        const path = [...basePath, "watchOptions", "debounce"];
        if (debounce < 0) {
            issues.push({ ...MESSAGES.NEGATIVE_DEBOUNCE(debounce), path });
        } else if (debounce > 5000) {
            issues.push({ ...MESSAGES.DEBOUNCE_EXCESSIVE(debounce), path });
        }
    }

    // Cache TTL validation
    if (block.cache) {
        const path = [...basePath, "cache", "ttl"];
        if (block.cache.ttl !== undefined && block.cache.ttl < 0) {
            issues.push({ ...MESSAGES.NEGATIVE_CACHE_TTL(block.cache.ttl), path });
        }
        // Note: ttl === 0 is valid (means use driver default), so no warning
    }

    return { issues };
}
