export const rules = '@ngcompass/rules';

export * from './rules/correctness/signal-no-side-effects-in-computed.rule.js';
export * from './rules/correctness/signal-effect-must-be-destroy-scoped.rule.js';
export * from './rules/correctness/rxjs-no-nested-subscribe.rule.js';
export * from './rules/correctness/no-ngzone.rule.js';
export * from './rules/correctness/no-changedetectorref.rule.js';
export * from './rules/correctness/no-directive-accessor.rule.js';
export * from './rules/correctness/no-providezonechangedetection.rule.js';
export * from './rules/correctness/no-reactive-forms.rule.js';
export * from './rules/correctness/no-zonejs-import.rule.js';
export * from './rules/correctness/no-ngoninit.rule.js';
export * from './rules/correctness/no-ngonchanges.rule.js';
export * from './rules/correctness/no-ngdocheck.rule.js';
export * from './rules/correctness/no-ngaftercontentinit.rule.js';
export * from './rules/correctness/no-ngaftercontentchecked.rule.js';
export * from './rules/correctness/no-ngafterviewinit.rule.js';
export * from './rules/correctness/no-ngafterviewchecked.rule.js';
export * from './rules/correctness/no-ngondestroy.rule.js';

export * from './rules/performance/prefer-on-push.rule.js';
export * from './rules/performance/template-no-call-expression.rule.js';
export * from './rules/performance/template-trackby-required.rule.js';
export * from './rules/performance/template-no-object-literal-binding.rule.js';
export * from './rules/performance/template-no-array-literal-binding.rule.js';

export * from './rules/security/no-bypass-sanitization.rule.js';
export * from './rules/security/template-no-unsafe-bindings.rule.js';

export * from './rules/ssr/no-document-access.rule.js';
export * from './rules/ssr/prefer-after-render-over-after-view-init.rule.js';

export * from './rules/reactivity/rxjs-no-subscribe-in-component.rule.js';
export * from './rules/reactivity/rxjs-require-take-until-destroyed.rule.js';
export * from './rules/reactivity/rxjs-avoid-subject-as-event-bus.rule.js';
export * from './rules/reactivity/rxjs-prefer-to-signal-for-template-state.rule.js';
export * from './rules/reactivity/to-signal-require-initial-value.rule.js';
export * from './rules/reactivity/signal-prefer-computed-over-sync-effect.rule.js';
export * from './rules/reactivity/signal-avoid-untracked-overuse.rule.js';

export * from './rules/modern-api/prefer-inject.rule.js';
export * from './rules/modern-api/signal-prefer-input-signal.rule.js';
export * from './rules/modern-api/signal-prefer-output-function.rule.js';
export * from './rules/modern-api/signal-prefer-model.rule.js';
export * from './rules/modern-api/no-view-decorator.rule.js';
export * from './rules/modern-api/no-content-decorator.rule.js';

export * from './rules/template/template-prefer-control-flow.rule.js';
export * from './rules/template/template-no-async-pipe-duplication.rule.js';
export * from './rules/template/template-no-async-pipe.rule.js';

export * from './rules/testing/spec-no-focused-test.rule.js';
export * from './rules/testing/no-detectchanges-testing.rule.js';
export * from './rules/testing/no-ngzone-testing.rule.js';
export * from './rules/testing/no-zonejs-testing-functions.rule.js';

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
} from './registry/rule-registry.js';
export type { RegisterOptions, RulePlugin } from './models/index.js';

export { registerAllBuiltinRules } from './registry/register-all.js';
export {
  executeBatchedNewEngineRules,
  isNewEngineRule,
} from './engine/adapter.js';
export { type RuleHandler, RuleContextFactory } from '@ngcompass/engine';

export {
  resolveRules,
  getEnabledRules,
  getRulesByCategory,
  getRulesByDependencyType,
} from './resolution/resolver.js';
export { loadPreset, resolveExtendsChain } from './resolution/loader.js';
export {
  normalizeRuleConfig,
  isRuleEnabled,
  normalizeAllRules,
} from './resolution/normalize.js';
export {
  mergeRuleConfig,
  mergeRulesConfigs,
  applyOverrides,
} from './resolution/merger.js';
export { decideVersionGate } from './resolution/angular-version.js';
export type { VersionGateDecision } from './models/index.js';

export {
  builtinPresets,
  isBuiltinPreset,
  getBuiltinPreset,
  getPresetsForRule,
} from './presets/index.js';

export * from './recommendations.js';
export * from './rule-utils.js';
export type { AstNode, MaybeAstNode } from './models/index.js';
