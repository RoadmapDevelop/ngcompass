/**
 * @fileoverview
 * Rule-resolution pipeline.
 *
 * Combines the user's config (`rules`) with every preset its `extends`
 * chain refers to and produces a fully resolved `ResolvedRulesMap` ready
 * for the planner.
 *
 * Pipeline:
 *   1. Resolve the `extends` chain (recursive; deepest preset first).
 *   2. Merge preset rules left-to-right.
 *   3. Apply user-config rules on top (highest precedence).
 *   4. Attach registry metadata to every rule entry.
 *   5. Count enabled / disabled / unknown rules for reporting.
 */

import {
    debug,
    Err,
    Ok,
    time,
    timeEnd,
    type NormalizedAnalyzerConfig,
    type ResolvedRule,
    type ResolvedRulesMap,
    type Result,
    type RuleResolutionResult,
    type RulesConfig,
} from '@ngcompass/common';
import { getRuleMetadata, isKnownRule } from '../registry/rule-registry.js';
import { resolveExtendsChain } from './loader.js';
import { applyOverrides, mergeRulesConfigs } from './merger.js';
import { isRuleEnabled } from './normalize.js';

/**
 * Resolves the active rule set from `config`.
 *
 * @param config    - Normalized analyzer configuration.
 * @param configDir - Project root used to resolve file-based preset references.
 */
export const resolveRules = async (
    config: NormalizedAnalyzerConfig,
    configDir: string,
): Promise<Result<RuleResolutionResult>> => {
    time('rule-resolution');
    debug('loader', 'Starting rule resolution');

    try {
        debug('loader', `Resolving extends: ${JSON.stringify(config.extends)}`);
        const presetsResult = await resolveExtendsChain(config.extends, configDir);
        if (!presetsResult.ok) {
            timeEnd('rule-resolution');
            return presetsResult;
        }

        const presets = presetsResult.data;
        debug('loader', `Loaded ${presets.length} preset(s)`);

        const mergedPresetRules = mergeRulesConfigs(presets.map((p) => p.rules));
        debug('loader', `Merged preset rules: ${mergedPresetRules.size} rules`);

        const finalRules = applyOverrides(mergedPresetRules, (config.rules ?? {}) as RulesConfig);
        debug('loader', `Final merged rules: ${finalRules.size} rules`);

        const resolvedRules = new Map<string, ResolvedRule>();
        let enabledCount = 0;
        let disabledCount = 0;
        let unknownRules = 0;

        for (const [ruleName, ruleConfig] of finalRules) {
            if (!isKnownRule(ruleName)) {
                debug('loader', `Warning: Unknown rule "${ruleName}" (will be skipped)`);
                unknownRules++;
                continue;
            }

            const metadata = getRuleMetadata(ruleName)!;
            resolvedRules.set(ruleName, {
                name: ruleName,
                severity: ruleConfig.severity,
                options: ruleConfig.options ?? {},
                metadata,
            });

            if (isRuleEnabled(ruleConfig)) enabledCount++;
            else disabledCount++;
        }

        const resolutionTime = timeEnd('rule-resolution');

        debug('loader', 'Rule resolution complete:');
        debug('loader', `  Total rules: ${resolvedRules.size}`);
        debug('loader', `  Enabled: ${enabledCount}`);
        debug('loader', `  Disabled: ${disabledCount}`);
        debug('loader', `  Unknown (skipped): ${unknownRules}`);
        debug('loader', `  Resolution time: ${resolutionTime.toFixed(1)}ms`);

        return Ok({
            rules: resolvedRules,
            metadata: {
                totalRules: resolvedRules.size,
                enabledRules: enabledCount,
                disabledRules: disabledCount,
                presetsLoaded: presets.map((p) => p.name),
                resolutionTime,
            },
        });
    } catch (error) {
        timeEnd('rule-resolution');
        return Err(new Error(`Rule resolution failed: ${(error as Error).message}`));
    }
};

/** Filters `resolvedRules` down to those whose severity is not `'off'`. */
export const getEnabledRules = (resolvedRules: ResolvedRulesMap): ResolvedRulesMap => {
    const enabled = new Map<string, ResolvedRule>();
    for (const [name, rule] of resolvedRules) {
        if (rule.severity !== 'off') enabled.set(name, rule);
    }
    return enabled;
};

/** Groups rules by their declared `metadata.category` value. */
export const getRulesByCategory = (
    resolvedRules: ResolvedRulesMap,
): ReadonlyMap<string, ReadonlyArray<ResolvedRule>> => {
    const byCategory = new Map<string, ResolvedRule[]>();
    for (const rule of resolvedRules.values()) {
        const category = rule.metadata.category;
        const rules = byCategory.get(category) ?? [];
        rules.push(rule);
        byCategory.set(category, rules);
    }
    return byCategory;
};

/** Groups rules by their declared `metadata.dependencyType` value. */
export const getRulesByDependencyType = (
    resolvedRules: ResolvedRulesMap,
): ReadonlyMap<string, ReadonlyArray<ResolvedRule>> => {
    const byType = new Map<string, ResolvedRule[]>();
    for (const rule of resolvedRules.values()) {
        const depType = rule.metadata.dependencyType;
        const rules = byType.get(depType) ?? [];
        rules.push(rule);
        byType.set(depType, rules);
    }
    return byType;
};
