import { CacheContext } from '@ngcompass/cache';
import { resolveConfig } from '../loaders/loader.js';
import type { ConfigValidationResult } from '@ngcompass/common';

export interface ValidateConfigOptions {
    cwd?: string;
    profile?: string;
    cache?: CacheContext;
}

export async function validateConfig(options: ValidateConfigOptions = {}): Promise<ConfigValidationResult> {
    try {
        return await resolveConfig(options);
    } catch (error: unknown) {
        return {
            config: undefined,
            report: {
                valid: false,
                issues: [{
                    code: "error-conf-semantic",
                    message: error instanceof Error ? error.message : String(error),
                    path: [],
                    severity: "error"
                }]
            }
        };
    }
}

