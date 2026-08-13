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
import { decideVersionGate } from './angular-version.js';
import { resolveExtendsChain } from './loader.js';
import { applyOverrides, mergeRulesConfigs } from './merger.js';
import { isRuleEnabled } from './normalize.js';

export async function resolveRules(
  config: NormalizedAnalyzerConfig,
  configDir: string
): Promise<Result<RuleResolutionResult>> {
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

    const finalRules = applyOverrides(
      mergedPresetRules,
      (config.rules ?? {}) as RulesConfig
    );
    debug('loader', `Final merged rules: ${finalRules.size} rules`);

    const resolvedRules = new Map<string, ResolvedRule>();
    const skippedByVersion: string[] = [];
    const userConfiguredRules = config.rules ?? {};
    let enabledCount = 0;
    let disabledCount = 0;
    let unknownRules = 0;

    for (const [ruleName, ruleConfig] of finalRules) {
      if (!isKnownRule(ruleName)) {
        debug(
          'loader',
          `Warning: Unknown rule "${ruleName}" (will be skipped)`
        );
        unknownRules++;
        continue;
      }

      const metadata = getRuleMetadata(ruleName)!;
      const gate = decideVersionGate(
        metadata,
        config.angularVersion,
        Object.hasOwn(userConfiguredRules, ruleName)
      );

      if (gate === 'skip') {
        debug(
          'loader',
          `Skipping "${ruleName}": requires Angular ${metadata.minAngularVersion}, detected ${config.angularVersion}`
        );
        skippedByVersion.push(ruleName);
        continue;
      }

      if (gate === 'invalid-floor') {
        debug(
          'loader',
          `Warning: Rule "${ruleName}" declares an unparseable minAngularVersion ("${metadata.minAngularVersion}") and will always run`
        );
      }

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
    debug('loader', `  Skipped by Angular version: ${skippedByVersion.length}`);
    debug('loader', `  Resolution time: ${resolutionTime.toFixed(1)}ms`);

    return Ok({
      rules: resolvedRules,
      metadata: {
        totalRules: resolvedRules.size,
        enabledRules: enabledCount,
        disabledRules: disabledCount,
        presetsLoaded: presets.map((p) => p.name),
        resolutionTime,
        skippedByVersion,
      },
    });
  } catch (error) {
    timeEnd('rule-resolution');
    return Err(
      new Error(`Rule resolution failed: ${(error as Error).message}`)
    );
  }
}

export function getEnabledRules(
  resolvedRules: ResolvedRulesMap
): ResolvedRulesMap {
  const enabled = new Map<string, ResolvedRule>();
  for (const [name, rule] of resolvedRules) {
    if (rule.severity !== 'off') enabled.set(name, rule);
  }
  return enabled;
}

export function getRulesByCategory(
  resolvedRules: ResolvedRulesMap
): ReadonlyMap<string, ReadonlyArray<ResolvedRule>> {
  const byCategory = new Map<string, ResolvedRule[]>();
  for (const rule of resolvedRules.values()) {
    const category = rule.metadata.category;
    const rules = byCategory.get(category) ?? [];
    rules.push(rule);
    byCategory.set(category, rules);
  }
  return byCategory;
}

export function getRulesByDependencyType(
  resolvedRules: ResolvedRulesMap
): ReadonlyMap<string, ReadonlyArray<ResolvedRule>> {
  const byType = new Map<string, ResolvedRule[]>();
  for (const rule of resolvedRules.values()) {
    const depType = rule.metadata.dependencyType;
    const rules = byType.get(depType) ?? [];
    rules.push(rule);
    byType.set(depType, rules);
  }
  return byType;
}
