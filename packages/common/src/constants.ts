/**
 * @fileoverview
 * Module-level constants shared across every package.
 *
 * Includes the tool name, the current package version (kept in lockstep
 * across all 10 published packages), default cache directory, default
 * include/exclude glob patterns, and the supported Angular major-version
 * range.
 */

/** Canonical CLI/tool identifier used in config file names and cache paths. */
export const TOOL_NAME = 'ngcompass';

/** Published package version shared by all releaseable monorepo packages. */
export const PACKAGE_VERSION = 'v0.1.6-beta';

/** Version for package-level cache data whose shape is not tied to task plans. */
export const CACHE_VERSION = '1.0.0';

/** Supported configuration file names, ordered by discovery preference. */
export const CONFIG_FILE_NAMES = [
    `.${TOOL_NAME}rc.json`,
    `.${TOOL_NAME}rc.js`,
    `.${TOOL_NAME}.config.js`,
    `${TOOL_NAME}.config.json`,
] as const;

export const DEFAULT_CACHE_DIR = `node_modules/.cache/${TOOL_NAME}`;

/** Default source globs analyzed when a project config omits `include`. */
export const DEFAULT_INCLUDE_PATTERNS = [
    '**/*.ts',
    '**/*.html',
] as const;

/** Default noisy/generated paths excluded before rule planning. */
export const DEFAULT_EXCLUDE_PATTERNS = [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/*.spec.ts',
    '**/*.test.ts',
] as const;

/** Angular major-version compatibility range understood by built-in rules. */
export const SUPPORTED_ANGULAR_VERSIONS = {
    min: 12,
    max: 21,
} as const;
