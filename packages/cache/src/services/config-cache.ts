import type { ConfigValidationResult } from '@ngcompass/common';
import type { AsyncDriver } from '../drivers/types.js';

export interface ConfigCache {
  get: (hash: string) => Promise<ConfigValidationResult | undefined>;
  set: (hash: string, report: ConfigValidationResult) => Promise<void>;
}

export const createConfigCache = (
  driver: AsyncDriver<ConfigValidationResult>
): ConfigCache => ({
  get: (hash) => driver.get(hash),
  set: (hash, report) => driver.set(hash, report),
});
