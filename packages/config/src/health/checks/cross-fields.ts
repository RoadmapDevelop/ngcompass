import { ConfigIssue } from "@ngcompass/common";
import { MESSAGES } from "../messages.js";
import { ConfigBlockValidation, ValidatedConfig, ValidationContext } from "../types.js";
import { validateConfigBlock } from "./base.js";

/**
 * Constants governing global configuration validation limits.
 */
const LIMITS = {
    WARNINGS_MIN: 0
} as const;

/**
 * Performs top-level validation for the configuration object, addressing cross-field 
 * constraints and delegating to the base configuration block validator.
 *
 * @param config - The fully composed configuration object to validate.
 * @param context - The validation context providing access to environmental data.
 * @param basePath - The structural path used for pinpointing issues in error reports.
 * @returns A consolidated validation result containing issues from all checks.
 */
export function validateCrossFields(
    config: ValidatedConfig,
    context: ValidationContext,
    basePath: (string | number)[] = []
): ConfigBlockValidation {
    const issues: ConfigIssue[] = [];

    /**
     * Global Constraints: Max Warnings
     * Validates that the warning threshold is not a negative value.
     */
    if (config.maxWarnings !== undefined) {
        const { maxWarnings } = config;

        if (maxWarnings < LIMITS.WARNINGS_MIN) {
            issues.push({
                ...MESSAGES.NEGATIVE_MAX_WARNINGS(maxWarnings),
                path: [...basePath, "maxWarnings"]
            });
        }
    }

    /**
     * Inheritance: Base Block Validation
     * Aggregates validation issues from the standard configuration block logic.
     */
    const { issues: blockIssues } = validateConfigBlock(config, context, basePath);
    issues.push(...blockIssues);

    return { issues };
}