/**
 * @fileoverview
 * Validates filesystem paths declared in the configuration.
 *
 * Covers three concerns:
 *  - Output paths (`outputPath`) — safety, existence, write permission.
 *  - Cache location (`cache.location`) — must not live inside `node_modules`
 *    unless under the conventional `node_modules/.cache` subdirectory.
 *  - Parser options (`parserOptions.project`, `tsconfigRootDir`) — existence.
 */

import * as fs from 'node:fs';
import type { ConfigIssue } from '@ngcompass/common';
import { MESSAGES } from '../messages.js';
import type { ConfigBlockValidation, ValidatedConfig, ValidationContext } from '../types.js';

const TRAVERSAL_TOKEN = '..';
const SENSITIVE_DIRS = ['/etc/', '\\etc\\', '/var/', '\\var\\'];
const PATH_SEPARATOR_RE = /[\\/]/;

/**
 * Returns `true` when any path segment in `location` is literally `node_modules`.
 * Avoids false positives for paths that merely contain the substring
 * (e.g. `/home/me/node_modules-bak/cache`).
 */
function containsNodeModulesSegment(location: string): boolean {
    return location.split(PATH_SEPARATOR_RE).includes('node_modules');
}

/**
 * Returns `true` when `location` sits under the conventional
 * `node_modules/.cache` subtree (path-separator agnostic).
 */
function isUnderNodeModulesCache(location: string): boolean {
    const segments = location.split(PATH_SEPARATOR_RE);
    const idx = segments.indexOf('node_modules');
    return idx !== -1 && segments[idx + 1] === '.cache';
}

/**
 * Validates filesystem paths in the configuration.
 *
 * @param config - Validated configuration.
 * @param context - Provides `fs`/`path` abstractions for testability.
 * @param basePath - Path prefix for issue attribution.
 * @returns {ConfigBlockValidation} Path-related issues.
 */
export function validatePaths(
    config: ValidatedConfig,
    context: ValidationContext,
    basePath: (string | number)[] = [],
): ConfigBlockValidation {
    const issues: ConfigIssue[] = [];

    const resolveFromCwd = (targetPath: string): string =>
        context.path.isAbsolute(targetPath)
            ? targetPath
            : context.path.resolve(context.cwd, targetPath);

    // ── outputPath ──────────────────────────────────────────────────────────
    if (config.outputPath) {
        const { outputPath } = config;
        const path = [...basePath, 'outputPath'];

        if (outputPath.includes(TRAVERSAL_TOKEN)) {
            issues.push({ ...MESSAGES.OUTPUT_PATH_TRAVERSAL(outputPath), path });
        }

        if (SENSITIVE_DIRS.some(dir => outputPath.includes(dir))) {
            issues.push({ ...MESSAGES.OUTPUT_PATH_SYSTEM_DIR(outputPath), path });
        }

        const dir = context.path.dirname(resolveFromCwd(outputPath));
        if (!context.fs.existsSync(dir)) {
            issues.push({ ...MESSAGES.OUTPUT_PATH_NOT_FOUND(dir), path });
        } else {
            try {
                context.fs.accessSync(dir, fs.constants.W_OK);
            } catch {
                issues.push({ ...MESSAGES.OUTPUT_PATH_NOT_WRITABLE(dir), path });
            }
        }
    }

    // ── cache.location ──────────────────────────────────────────────────────
    if (config.cache && typeof config.cache === 'object' && config.cache.enabled) {
        const { location } = config.cache;
        if (location) {
            const path = [...basePath, 'cache', 'location'];

            if (containsNodeModulesSegment(location) && !isUnderNodeModulesCache(location)) {
                issues.push({ ...MESSAGES.CACHE_IN_NODE_MODULES(location), path });
            }

            const cacheDir = context.path.dirname(resolveFromCwd(location));
            if (!context.fs.existsSync(cacheDir)) {
                issues.push({ ...MESSAGES.CACHE_PARENT_NOT_FOUND(cacheDir), path });
            }
        }
    }

    // ── parserOptions ───────────────────────────────────────────────────────
    if (config.parserOptions) {
        const { project, tsconfigRootDir } = config.parserOptions;

        if (project) {
            const resolved = resolveFromCwd(project);
            if (!context.fs.existsSync(resolved)) {
                issues.push({
                    ...MESSAGES.TSCONFIG_PROJECT_NOT_FOUND(project),
                    path: [...basePath, 'parserOptions', 'project'],
                });
            }
        }

        if (tsconfigRootDir) {
            const resolved = resolveFromCwd(tsconfigRootDir);
            if (!context.fs.existsSync(resolved)) {
                issues.push({
                    ...MESSAGES.TSCONFIG_ROOT_NOT_FOUND(tsconfigRootDir),
                    path: [...basePath, 'parserOptions', 'tsconfigRootDir'],
                });
            }
        }
    }

    return { issues };
}
