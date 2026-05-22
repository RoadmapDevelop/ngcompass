/**
 * @fileoverview
 * Cross-field validation for the root configuration.
 *
 * Validates fields whose constraints span the whole config (e.g. `maxWarnings`)
 * and delegates per-block checks to {@link validateConfigBlock} so the same
 * worker/cache rules apply to both the root and individual profiles.
 */

import type { ConfigIssue } from '@ngcompass/common';
import { MESSAGES } from '../messages.js';
import type { ConfigBlockValidation, ValidatedConfig, ValidationContext } from '../types.js';
import { validateConfigBlock } from './base.js';

const LIMITS = {
    WARNINGS_MIN: 0,
} as const;

/**
 * Runs top-level field constraints and delegates block-level checks.
 *
 * @param config - The composed configuration object to validate.
 * @param context - Validation context (CPU lookup, FS abstraction).
 * @param basePath - Path prefix for nested attribution (profiles, overrides).
 * @returns {ConfigBlockValidation} Combined issues from this layer and the base block.
 */
export function validateCrossFields(
    config: ValidatedConfig,
    context: ValidationContext,
    basePath: (string | number)[] = [],
): ConfigBlockValidation {
    const issues: ConfigIssue[] = [];

    if (config.maxWarnings !== undefined && config.maxWarnings < LIMITS.WARNINGS_MIN) {
        issues.push({
            ...MESSAGES.NEGATIVE_MAX_WARNINGS(config.maxWarnings),
            path: [...basePath, 'maxWarnings'],
        });
    }

    const { issues: blockIssues } = validateConfigBlock(config, context, basePath);
    issues.push(...blockIssues);

    return { issues };
}
