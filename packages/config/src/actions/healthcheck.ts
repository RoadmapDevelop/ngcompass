import { CacheContext } from '@ngcompass/cache';
import { resolveConfig } from '../loaders/loader.js';
import type { ConfigValidationResult } from '@ngcompass/common';

export interface ValidateConfigOptions {
    cwd?: string;
    profile?: string;
    cache?: CacheContext;
}

/**
 * Validates the configuration.
 * Resolves the configuration (discovery + merge + full validation) and returns the health report and the config.
 */
export async function validateConfig(options: ValidateConfigOptions = {}): Promise<ConfigValidationResult> {
    try {
        return await resolveConfig(options);
    } catch (error: any) {
        return {
            config: undefined,
            report: {
                valid: false,
                issues: [{
                    code: "error-conf-semantic",
                    message: error.message,
                    path: [],
                    severity: "error"
                }]
            }
        };
    }
}

