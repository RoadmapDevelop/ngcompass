import { ConfigIssue } from "@ngcompass/common";
import { MESSAGES } from "../messages.js";
import { ConfigBlockValidation } from "../types.js";

/**
 * Evaluates a raw configuration object for the presence of legacy or deprecated fields.
 * This function is typically called early in the validation pipeline to provide
 * migration guidance to the user.
 *
 * @param rawConfig - The unvalidated, potentially loosely-typed configuration object.
 * @param basePath - The structural path used to locate the deprecated fields in the source.
 * @returns A validation result containing warnings or errors for deprecated usage.
 */
export function validateDeprecatedFields(
    rawConfig: unknown,
    basePath: (string | number)[] = []
): ConfigBlockValidation {
    const issues: ConfigIssue[] = [];

    /**
     * Type Guard: Validity Check
     * Ensures the input is an object before attempting to inspect properties.
     */
    if (!rawConfig || typeof rawConfig !== "object") {
        return { issues };
    }

    const config = rawConfig as Record<string, unknown>;

    /**
     * Legacy Field: cacheLocation
     * Checks for the presence of the deprecated 'cacheLocation' property.
     * Migration path: Use 'cache.path' or 'cache.directory' depending on the driver.
     */
    if ("cacheLocation" in config && config.cacheLocation !== undefined) {
        issues.push({
            ...MESSAGES.DEPRECATED_CACHE_LOCATION(),
            path: [...basePath, "cacheLocation"]
        });
    }

    /**
     * Legacy Field: concurrency
     * Checks for the presence of the deprecated 'concurrency' property.
     * Migration path: Use 'maxWorkers' for consistent resource management.
     */
    if ("concurrency" in config && config.concurrency !== undefined) {
        issues.push({
            ...MESSAGES.DEPRECATED_CONCURRENCY(),
            path: [...basePath, "concurrency"]
        });
    }

    return { issues };
}