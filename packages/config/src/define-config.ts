/**
 * @fileoverview
 * `defineConfig` helper for authoring TypeScript configuration files.
 *
 * The function is an identity at runtime — its sole purpose is to apply the
 * `AnalyzerConfig` type to the argument so editors offer completion and
 * type-checking inside the user's `ngcompass.config.ts`. Using a generic
 * preserves literal inference for fields like `rules` and `extends` so
 * downstream code can narrow them without `as const` ceremony.
 */

import type { AnalyzerConfig } from '@ngcompass/common';

/**
 * Identity helper that types `config` as an `AnalyzerConfig` for IDE support.
 *
 * @param config - Configuration object literal authored by the user.
 * @returns The same object, unchanged.
 *
 * @example
 *   export default defineConfig({
 *       extends: 'ngcompass:recommended',
 *       rules: { 'no-subscribe-in-component': 'error' },
 *   });
 */
export function defineConfig<TConfig extends AnalyzerConfig>(config: TConfig): TConfig {
    return config;
}
