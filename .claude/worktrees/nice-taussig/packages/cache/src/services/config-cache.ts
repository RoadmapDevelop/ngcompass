import { ConfigValidationResult } from '@ngcompass/common';
import { AsyncDriver } from '../drivers/types.js';

export interface ConfigCache {
    get: (hash: string) => Promise<ConfigValidationResult | undefined>;
    set: (hash: string, report: ConfigValidationResult) => Promise<void>;
}

/**
 * Creates a Configuration Cache.
 * Strategy: Persistent Disk (Atomic files).
 * Key: Raw Configuration Hash.
 */
export const createConfigCache = (driver: AsyncDriver<any>): ConfigCache => {
    return {
        get: async (hash: string): Promise<ConfigValidationResult | undefined> => {
            return driver.get(hash);
        },

        set: async (hash: string, report: ConfigValidationResult): Promise<void> => {
            await driver.set(hash, report);
        }
    };
};
