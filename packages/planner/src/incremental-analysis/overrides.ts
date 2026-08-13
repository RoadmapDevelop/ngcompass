import { minimatch } from 'minimatch';
import type {
  ConfigOverride,
  ResolvedRule,
  RuleConfig,
} from '@ngcompass/common';

export const findMatchingOverrides = (
  filePath: string,
  overrides: ReadonlyArray<ConfigOverride>
): ReadonlyArray<ConfigOverride> =>
  overrides.filter((o) => {
    const patterns = Array.isArray(o.files) ? o.files : [o.files];
    return matchesAnyGlob(filePath, patterns);
  });

export const resolveOverridesForFile = (
  filePath: string,
  globalRules: ReadonlyMap<string, ResolvedRule>,
  overrides: ReadonlyArray<ConfigOverride>
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

const matchesGlob = (filePath: string, pattern: string): boolean =>
  minimatch(filePath.replace(/\\/g, '/'), pattern, { dot: true });

const matchesAnyGlob = (filePath: string, patterns: string[]): boolean =>
  patterns.some((p) => matchesGlob(filePath, p));

type NormalizedOverrideConfig = {
  severity: 'warn' | 'error' | 'off';
  options: Record<string, unknown>;
};

const normalizeOverrideConfig = (
  rc: RuleConfig | 'off'
): NormalizedOverrideConfig => {
  if (typeof rc === 'string') {
    return { severity: rc, options: {} };
  }
  if (rc && typeof rc === 'object' && 'severity' in rc) {
    return { severity: rc.severity, options: rc.options ?? {} };
  }
  return { severity: 'off', options: {} };
};
