/**
 * Constants used across packages
 */

export const TOOL_NAME = 'ngcompass';

export const CONFIG_FILE_NAMES = [
    `.${TOOL_NAME}rc.json`,
    `.${TOOL_NAME}rc.js`,
    `.${TOOL_NAME}.config.js`,
    `${TOOL_NAME}.config.json`,
] as const;

export const DEFAULT_CACHE_DIR = `node_modules/.cache/${TOOL_NAME}`;

export const DEFAULT_INCLUDE_PATTERNS = [
    '**/*.ts',
    '**/*.html',
] as const;

export const DEFAULT_EXCLUDE_PATTERNS = [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/*.spec.ts',
    '**/*.test.ts',
] as const;

export const SUPPORTED_ANGULAR_VERSIONS = {
    min: 12,
    max: 21,
} as const;