/**
 * @fileoverview
 * Validates that every entry in the `extends` field resolves to an installed
 * npm package or a valid local path.
 *
 * Without this check, referencing a missing preset would silently produce an
 * analyzer run with no rules — the kind of failure mode that takes a long
 * time to notice in CI.
 */

import { createRequire } from 'node:module';
import nodePath from 'node:path';
import type { ConfigIssue } from '@ngcompass/common';
import { MESSAGES } from '../messages.js';
import type { ConfigBlockValidation, ValidatedConfig } from '../types.js';

/**
 * Returns `true` when the specifier should be skipped by package resolution.
 *
 * Skipped specifiers:
 *  - Relative paths (`./preset`)
 *  - Absolute paths (`/abs/path/preset`)
 *  - Plugin-style specifiers (`ngcompass:recommended`) — resolved by the rule engine.
 */
function isSkippable(preset: string): boolean {
    if (preset.startsWith('.')) return true;
    if (nodePath.isAbsolute(preset)) return true;
    if (preset.includes(':')) return true;
    return false;
}

/**
 * Attempts Node's module resolution from `cwd` for `preset`.
 *
 * @returns {string | null} Resolved absolute path or `null` when unresolved.
 */
function tryResolve(preset: string, cwd: string): string | null {
    try {
        const anchorFile = nodePath.join(cwd, '__resolve_anchor__.cjs');
        const requireFn = createRequire(anchorFile);
        return requireFn.resolve(preset);
    } catch {
        return null;
    }
}

/**
 * Validates that every npm-package entry in `extends` is resolvable.
 *
 * @param config - Validated config containing the `extends` field.
 * @param basePath - Path prefix for issue attribution.
 * @param cwd - Project root used as the resolution base.
 * @returns {ConfigBlockValidation} Issues for unresolved presets.
 */
export function validateExtendsChain(
    config: ValidatedConfig,
    basePath: (string | number)[],
    cwd: string,
): ConfigBlockValidation {
    const issues: ConfigIssue[] = [];

    if (!config.extends) return { issues };

    const isArray = Array.isArray(config.extends);
    const extendsList: unknown[] = isArray ? (config.extends as unknown[]) : [config.extends];

    for (let i = 0; i < extendsList.length; i++) {
        const preset = extendsList[i];

        if (typeof preset !== 'string' || preset.trim() === '') continue;
        if (isSkippable(preset)) continue;

        if (tryResolve(preset, cwd) !== null) continue;

        const issuePath: (string | number)[] = [...basePath, 'extends'];
        if (isArray) issuePath.push(i);

        issues.push({
            ...MESSAGES.EXTENDS_NOT_FOUND(preset),
            path: issuePath,
        });
    }

    return { issues };
}
