export const rules = '@ngcompass/rules';

export * from './migration/component-no-manual-detect-changes.rule.js';
export * from './migration/prefer-inject.rule.js';
export * from './migration/prefer-on-push.rule.js';
export * from './migration/rxjs-avoid-behaviorsubject-for-local-state.rule.js';
export * from './migration/rxjs-avoid-subject-as-event-bus.rule.js';
export * from './migration/rxjs-no-subscribe-in-component.rule.js';
export * from './migration/rxjs-prefer-to-signal-for-template-state.rule.js';
export * from './migration/rxjs-require-take-until-destroyed.rule.js';
export * from './migration/signal-avoid-untracked-overuse.rule.js';
export * from './migration/signal-effect-must-be-destroy-scoped.rule.js';
export * from './migration/signal-no-effect-in-constructor.rule.js';
export * from './migration/signal-no-side-effects-in-computed.rule.js';
export * from './migration/signal-prefer-computed-over-sync-effect.rule.js';
export * from './migration/template-no-array-literal-binding.rule.js';
export * from './migration/template-no-async-pipe-duplication.rule.js';
export * from './migration/template-no-call-expression.rule.js';
export * from './migration/template-no-object-literal-binding.rule.js';
export * from './migration/template-trackby-required.rule.js';
export * from './migration/to-signal-require-initial-value.rule.js';



export {
    isKnownRule,
    getRuleMetadata,
    getAllRuleNames,
    getRuleRegistryMap as ruleRegistry,
} from './registry/rule-registry.js';

export {
    RuleRegistry,
    getGlobalRegistry,
    resetGlobalRegistry,
    type RulePlugin,
    type RegisterOptions,
} from './registry/rule-registry.js';

export { registerAllBuiltinRules } from './registry/register-all.js';
export { executeBatchedNewEngineRules, isNewEngineRule } from './engine/adapter.js';
export { type RuleHandler } from './engine/rule-handler.js';
export { RuleContextFactory } from './engine/rule-context-factory.js';

// Resolution
export { resolveRules, getEnabledRules, getRulesByCategory, getRulesByDependencyType } from './resolution/resolver.js';
export { loadPreset, resolveExtendsChain } from './resolution/loader.js';
export { normalizeRuleConfig, isRuleEnabled, normalizeAllRules } from './resolution/normalize.js';
export { mergeRuleConfig, mergeRulesConfigs, applyOverrides } from './resolution/merger.js';

// Presets
export { builtinPresets, isBuiltinPreset, getBuiltinPreset } from './presets/index.js';

// Recommendations and rule utilities
export * from './recommendations.js';
export * from './rule-utils.js';
