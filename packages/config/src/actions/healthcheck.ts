/**
 * @fileoverview
 * `validateConfig` action — the public entry point used by the
 * `ngcompass config health` CLI command.
 *
 * Wraps {@link resolveConfig} so unexpected exceptions from discovery, parsing,
 * or jiti loading surface as a structured {@link ConfigValidationResult}
 * instead of crashing the CLI. The wrapper preserves the contract that callers
 * always receive a valid `report` object they can render.
 */

import type { ConfigValidationResult, ConfigIssue } from '@ngcompass/common';
import { resolveConfig, type ValidateConfigOptions } from '../loaders/loader.js';

export type { ValidateConfigOptions };

/** Error code emitted when an unexpected exception is captured during validation. */
const UNEXPECTED_ERROR_CODE = 'error-conf-semantic';

/**
 * Builds a {@link ConfigIssue} from an unexpected thrown value. Used so the
 * CLI receives a uniform report shape even when the underlying loader throws.
 *
 * @param error - Value thrown by {@link resolveConfig}.
 * @returns {ConfigIssue} A single error-severity issue with no path attribution.
 */
const toUnexpectedIssue = (error: unknown): ConfigIssue => ({
    code: UNEXPECTED_ERROR_CODE,
    message: error instanceof Error ? error.message : String(error),
    path: [],
    severity: 'error',
});

/**
 * Resolves and validates the active ngcompass configuration.
 *
 * Domain validation failures already flow through `resolveConfig` as a
 * `ConfigValidationResult` with `report.valid === false`. The `try/catch`
 * here only converts *unexpected* exceptions (missing files, parse failures,
 * jiti import errors) into the same shape so callers never need to handle
 * two return modes.
 *
 * @param options - Working directory, profile, and cache overrides.
 * @returns {Promise<ConfigValidationResult>} Validation outcome with a renderable report.
 *
 * @example
 *   const { report } = await validateConfig({ profile: 'ci' });
 *   if (!report.valid) { ... }
 */
export async function validateConfig(
    options: ValidateConfigOptions,
): Promise<ConfigValidationResult> {
    try {
        return await resolveConfig(options);
    } catch (error: unknown) {
        return {
            config: undefined,
            report: {
                valid: false,
                issues: [toUnexpectedIssue(error)],
            },
        };
    }
}
