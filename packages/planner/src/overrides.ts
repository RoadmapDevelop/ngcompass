/**
 * Per-file Override Resolution
 *
 * Matches config.overrides[].files glob patterns against each analysed file
 * path and merges the matching override rules on top of the global resolved
 * rules before tasks are created for that file.
 *
 * Design:
 * - Fast path: when no override matches, the original globalRules Map is
 *   returned as-is (zero allocation).
 * - When overrides match, a shallow copy of globalRules is made and mutated
 *   in place so each override rule entry can be applied in declaration order
 *   (last matching override wins).
 * - Unknown rule names in overrides are silently ignored for consistency with
 *   the global rule resolution behaviour.
 */

import { minimatch } from 'minimatch';
import type { ResolvedRule, RuleConfig, ConfigOverride } from '@ngcompass/common';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns every ConfigOverride whose `files` glob pattern(s) match the given
 * file path.
 *
 * @param filePath  Absolute (or rootDir-relative) path of the file being analysed.
 * @param overrides The full overrides array from the user's config.
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
 * Returns the effective rule map for a specific file.
 *
 * - When no override matches, returns `globalRules` unchanged (fast path, no copy).
 * - When one or more overrides match, returns a new Map with overrides applied:
 *   - `'off'`          → rule is removed from the file's map
 *   - `'warn'|'error'` → severity updated; options inherited from global rule
 *   - object form      → severity updated; options deep-merged (override wins)
 *
 * @param filePath    Absolute path of the file being analysed.
 * @param globalRules The globally resolved rules map (from resolveRules()).
 * @param overrides   The overrides array from the user's config.
 */
export const resolveOverridesForFile = (
    filePath: string,
    globalRules: ReadonlyMap<string, ResolvedRule>,
    overrides: ReadonlyArray<ConfigOverride>,
): ReadonlyMap<string, ResolvedRule> => {
    const matching = findMatchingOverrides(filePath, overrides);
    if (matching.length === 0) return globalRules; // fast path — no allocation

    const result = new Map(globalRules);

    for (const override of matching) {
        if (!override.rules) continue;
        for (const [ruleName, ruleConfig] of Object.entries(override.rules)) {
            const existing = result.get(ruleName);
            if (!existing) continue; // unknown rule — ignore (consistent with global behaviour)

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

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** True if `filePath` (with backslashes normalised) matches the given glob. */
const matchesGlob = (filePath: string, pattern: string): boolean =>
    minimatch(filePath.replace(/\\/g, '/'), pattern, { dot: true });

/** True if `filePath` matches ANY of the given glob patterns. */
const matchesAnyGlob = (filePath: string, patterns: string[]): boolean =>
    patterns.some((p) => matchesGlob(filePath, p));

type NormalizedOverrideConfig = {
    severity: 'warn' | 'error' | 'off';
    options: Record<string, unknown>;
};

/** Normalises a raw override rule entry to a canonical { severity, options } shape. */
const normalizeOverrideConfig = (rc: RuleConfig | 'off'): NormalizedOverrideConfig => {
    if (typeof rc === 'string') {
        return { severity: rc as NormalizedOverrideConfig['severity'], options: {} };
    }
    if (typeof rc === 'object' && rc !== null && 'severity' in rc) {
        return {
            severity: (rc as { severity: string }).severity as NormalizedOverrideConfig['severity'],
            options: ((rc as { options?: Record<string, unknown> }).options) ?? {},
        };
    }
    return { severity: 'off', options: {} };
};
