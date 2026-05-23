/**
 * @fileoverview
 * Config-validation cache.
 *
 * Holds the result of `validateConfiguration()` keyed by the composite
 * fingerprint defined in `key-context.ts`. The driver is typed concretely as
 * `AsyncDriver<ConfigValidationResult>` so callers no longer rely on a
 * runtime cast through `unknown`.
 *
 * Strategy: persistent disk via the atomic driver.
 */

import type { ConfigValidationResult } from '@ngcompass/common';
import type { AsyncDriver } from '../drivers/types.js';

/** Read/write surface exposed to consumers. */
export interface ConfigCache {
    get: (hash: string) => Promise<ConfigValidationResult | undefined>;
    set: (hash: string, report: ConfigValidationResult) => Promise<void>;
}

/**
 * Wraps a typed async driver as a {@link ConfigCache}.
 *
 * @param driver - Backing async driver carrying `ConfigValidationResult` payloads.
 * @returns A thin `ConfigCache` proxy.
 */
export const createConfigCache = (
    driver: AsyncDriver<ConfigValidationResult>,
): ConfigCache => ({
    get: (hash) => driver.get(hash),
    set: (hash, report) => driver.set(hash, report),
});
