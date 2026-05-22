/**
 * @fileoverview
 * Per-file override resolution.
 *
 * Each `ConfigOverride` declares a set of glob patterns and a rule map.
 * For every file being analysed, the planner walks the overrides array,
 * picks the ones whose globs match, and merges their rule maps on top of
 * the globally resolved rule map (last matching override wins).
 *
 * Design:
 *  - Fast path: when no override matches, the original `globalRules` Map is
 *    returned unchanged so there is zero allocation in the common case.
 *  - Matching overrides allocate a shallow copy of `globalRules` and apply
 *    each override entry in declaration order.
 *  - Unknown rule names in an override are silently ignored — consistent
 *    with how the global rule resolver behaves.
 */

import { minimatch } from 'minimatch';
import type { ConfigOverride, ResolvedRule, RuleConfig } from '@ngcompass/common';

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Returns every override whose `files` glob pattern(s) match `filePath`.
 *
 * @param filePath  - Absolute (or rootDir-relative) path of the file being analysed.
 * @param overrides - Full overrides array from the user's configuration.
 */
export const findMatchingOverrides = (
    filePath: string,
    overrides: ReadonlyArray<ConfigOverride>,
): ReadonlyArray<ConfigOverride> =>
    overrides.filter((o) => {
        const patterns = Array.isArray(o.files) ? o.files : [o.files];
        return matchesAnyGlob(filePath, patterns);
    });

/**
 * Returns the effective rule map for `filePath`.
 *
 * - No matching override → `globalRules` is returned as-is (no allocation).
 * - At least one override matches → a new Map is allocated; overrides are
 *   applied in declaration order:
 *   * `'off'`          → rule removed from the file's map.
 *   * `'warn' | 'error'` → severity updated, options inherited from global.
 *   * object form      → severity updated, options merged (override wins).
 */
export const resolveOverridesForFile = (
    filePath: string,
    globalRules: ReadonlyMap<string, ResolvedRule>,
    overrides: ReadonlyArray<ConfigOverride>,
): ReadonlyMap<string, ResolvedRule> => {
    const matching = findMatchingOverrides(filePath, overrides);
    if (matching.length === 0) return globalRules;

    const result = new Map(globalRules);
    for (const override of matching) {
        if (!override.rules) continue;
        for (const [ruleName, ruleConfig] of Object.entries(override.rules)) {
            const existing = result.get(ruleName);
            if (!existing) continue;

            const normalized = normalizeOverrideConfig(ruleConfig);
            if (normalized.severity === 'off') {
                result.delete(ruleName);
            } else {
                result.set(ruleName, {
                    ...existing,
                    severity: normalized.severity,
                    options: { ...existing.options, ...normalized.options },
                });
            }
        }
    }
    return result;
};

// ── Internal helpers ──────────────────────────────────────────────────────

/** Returns `true` when `filePath` (with normalised separators) matches `pattern`. */
const matchesGlob = (filePath: string, pattern: string): boolean =>
    minimatch(filePath.replace(/\\/g, '/'), pattern, { dot: true });

/** Returns `true` when `filePath` matches any pattern in `patterns`. */
const matchesAnyGlob = (filePath: string, patterns: string[]): boolean =>
    patterns.some((p) => matchesGlob(filePath, p));

type NormalizedOverrideConfig = {
    severity: 'warn' | 'error' | 'off';
    options: Record<string, unknown>;
};

/**
 * Normalises a raw override rule entry to a canonical `{ severity, options }`
 * shape. Accepts the shorthand string form, the verbose object form, and
 * defaults unrecognised inputs to `'off'`.
 */
const normalizeOverrideConfig = (rc: RuleConfig | 'off'): NormalizedOverrideConfig => {
    if (typeof rc === 'string') {
        return { severity: rc as NormalizedOverrideConfig['severity'], options: {} };
    }
    if (rc && typeof rc === 'object' && 'severity' in rc) {
        const obj = rc as { severity: string; options?: Record<string, unknown> };
        return {
            severity: obj.severity as NormalizedOverrideConfig['severity'],
            options: obj.options ?? {},
        };
    }
    return { severity: 'off', options: {} };
};
