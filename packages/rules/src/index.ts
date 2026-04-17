export const rules = '@ngcompass/rules';

// ─── Correctness ─────────────────────────────────────────────────────────────
// Rules that prevent bugs, crashes, memory leaks, and lifecycle violations.
export * from './rules/correctness/component-no-manual-detect-changes.rule.js';
export * from './rules/correctness/signal-no-side-effects-in-computed.rule.js';
export * from './rules/correctness/signal-effect-must-be-destroy-scoped.rule.js';
export * from './rules/correctness/rxjs-no-nested-subscribe.rule.js';

// ─── Performance ─────────────────────────────────────────────────────────────
// Rules that prevent rendering bottlenecks and change-detection inefficiencies.
export * from './rules/performance/prefer-on-push.rule.js';
export * from './rules/performance/template-no-call-expression.rule.js';
export * from './rules/performance/template-trackby-required.rule.js';
export * from './rules/performance/template-no-object-literal-binding.rule.js';
export * from './rules/performance/template-no-array-literal-binding.rule.js';

// ─── Security ────────────────────────────────────────────────────────────────
// Rules that prevent XSS, injection, and sanitization bypass vulnerabilities.
export * from './rules/security/no-bypass-sanitization.rule.js';
export * from './rules/security/template-no-unsafe-bindings.rule.js';

// ─── SSR ─────────────────────────────────────────────────────────────────────
// Rules that enforce platform safety for Angular Universal / @angular/ssr.
export * from './rules/ssr/no-document-access.rule.js';
export * from './rules/ssr/prefer-after-render-over-after-view-init.rule.js';

// ─── Reactivity ──────────────────────────────────────────────────────────────
// Rules that enforce correct RxJS and Signal reactive patterns.
export * from './rules/reactivity/rxjs-no-subscribe-in-component.rule.js';
export * from './rules/reactivity/rxjs-require-take-until-destroyed.rule.js';
export * from './rules/reactivity/rxjs-avoid-subject-as-event-bus.rule.js';
export * from './rules/reactivity/rxjs-prefer-to-signal-for-template-state.rule.js';
export * from './rules/reactivity/to-signal-require-initial-value.rule.js';
export * from './rules/reactivity/signal-prefer-computed-over-sync-effect.rule.js';
export * from './rules/reactivity/signal-avoid-untracked-overuse.rule.js';

// ─── Modern API ──────────────────────────────────────────────────────────────
// Rules that enforce idiomatic Angular 17+ APIs (input, output, inject, model).
export * from './rules/modern-api/prefer-inject.rule.js';
export * from './rules/modern-api/signal-prefer-input-signal.rule.js';
export * from './rules/modern-api/signal-prefer-output-function.rule.js';
export * from './rules/modern-api/signal-prefer-model.rule.js';

// ─── Template ────────────────────────────────────────────────────────────────
// Rules that enforce correct and idiomatic Angular template patterns.
export * from './rules/template/template-prefer-control-flow.rule.js';
export * from './rules/template/template-no-async-pipe-duplication.rule.js';

// ─── Testing ─────────────────────────────────────────────────────────────────
// Rules that enforce spec quality and prevent CI blind spots.
export * from './rules/testing/spec-no-focused-test.rule.js';


export {
    isKnownRule,
    getRuleMetadata,
    getAllRuleNames,
    getRuleRegistryMap as ruleRegistry,
    getRuleListEntries,
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
export { type RuleHandler, RuleContextFactory } from '@ngcompass/engine';

// Resolution
export { resolveRules, getEnabledRules, getRulesByCategory, getRulesByDependencyType } from './resolution/resolver.js';
export { loadPreset, resolveExtendsChain } from './resolution/loader.js';
export { normalizeRuleConfig, isRuleEnabled, normalizeAllRules } from './resolution/normalize.js';
export { mergeRuleConfig, mergeRulesConfigs, applyOverrides } from './resolution/merger.js';

// Presets
export { builtinPresets, isBuiltinPreset, getBuiltinPreset, getPresetsForRule } from './presets/index.js';

// Recommendations and rule utilities
export * from './recommendations.js';
export * from './rule-utils.js';
