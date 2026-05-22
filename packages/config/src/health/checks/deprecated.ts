/**
 * @fileoverview
 * Detects legacy / deprecated configuration fields.
 *
 * Operates on the raw (pre-Zod) configuration so it can spot fields that the
 * schema would otherwise strip or normalize. Each finding is a warning with a
 * migration suggestion — no field is hard-rejected here.
 */

import type { ConfigIssue } from '@ngcompass/common';
import { MESSAGES } from '../messages.js';
import type { ConfigBlockValidation } from '../types.js';

/**
 * Scans the raw configuration for deprecated keys and emits migration hints.
 *
 * @param rawConfig - Unvalidated configuration object, exactly as loaded.
 * @param basePath - Path prefix for nested attribution.
 * @returns {ConfigBlockValidation} Deprecation warnings, if any.
 */
export function validateDeprecatedFields(
    rawConfig: unknown,
    basePath: (string | number)[] = [],
): ConfigBlockValidation {
    const issues: ConfigIssue[] = [];

    if (!rawConfig || typeof rawConfig !== 'object') {
        return { issues };
    }

    const config = rawConfig as Record<string, unknown>;

    if ('cacheLocation' in config && config.cacheLocation !== undefined) {
        issues.push({
            ...MESSAGES.DEPRECATED_CACHE_LOCATION,
            path: [...basePath, 'cacheLocation'],
        });
    }

    if ('concurrency' in config && config.concurrency !== undefined) {
        issues.push({
            ...MESSAGES.DEPRECATED_CONCURRENCY,
            path: [...basePath, 'concurrency'],
        });
    }

    return { issues };
}
