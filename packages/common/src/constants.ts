/**
 * @fileoverview
 * Module-level constants shared across multiple packages.
 *
 * Includes the current package version (kept in lockstep across all 10
 * published packages), the package-level cache schema version, and the
 * default include glob patterns consumed by both the CLI and config
 * packages.
 */

/** Published package version shared by all releaseable monorepo packages. */
export const PACKAGE_VERSION = 'v0.1.6-beta';

/** Version for package-level cache data whose shape is not tied to task plans. */
export const CACHE_VERSION = '1.0.0';

/** Default source globs analyzed when a project config omits `include`. */
export const DEFAULT_INCLUDE_PATTERNS = [
    '**/*.ts',
    '**/*.html',
] as const;
