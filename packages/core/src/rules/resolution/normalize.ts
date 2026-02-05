/**
 * Rule Configuration Normalization
 *
 * Pure functions to normalize rule configurations
 */

import type { RuleConfig, RuleConfigFull, RuleSeverity } from '../types.js';

/**
 * Check if a rule config is shorthand (just severity string)
 */
export const isShorthand = (config: RuleConfig): config is RuleSeverity => {
    return typeof config === 'string';
};

/**
 * Normalize rule config to full format
 *
 * Pure function: shorthand → full format
 */
export const normalizeRuleConfig = (config: RuleConfig): RuleConfigFull => {
    if (isShorthand(config)) {
        return {
            severity: config,
            options: {},
        };
    }

    return {
        severity: config.severity,
        options: config.options || {},
    };
};

/**
 * Check if a rule is enabled (severity !== 'off')
 */
export const isRuleEnabled = (config: RuleConfig): boolean => {
    const normalized = normalizeRuleConfig(config);
    return normalized.severity !== 'off';
};

/**
 * Normalize all rules in a rules object
 *
 * Pure function: transforms all rule configs to full format
 */
export const normalizeAllRules = (
    rules: Readonly<Record<string, RuleConfig>>
): ReadonlyMap<string, RuleConfigFull> => {
    const normalized = new Map<string, RuleConfigFull>();

    for (const [name, config] of Object.entries(rules)) {
        normalized.set(name, normalizeRuleConfig(config));
    }

    return normalized;
};
