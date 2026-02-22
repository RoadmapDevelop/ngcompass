/**
 * Registers all built-in rules with the registry.
 * Imported for side-effects.
 */

// New high-performance engine
import { registerNewEngineRule } from './engine/adapter.js';

// P0: Migration Blockers
import { preferOnPushRule } from './migration/prefer-on-push.rule.js';
import { templateNoCallExpressionRule } from './migration/template-no-call-expression.rule.js';
import { rxjsNoSubscribeInComponentRule } from './migration/rxjs-no-subscribe-in-component.rule.js';
import { rxjsAvoidBehaviorSubjectRule } from './migration/rxjs-avoid-behaviorsubject-for-local-state.rule.js';
import { templateTrackByRequiredRule } from './migration/template-trackby-required.rule.js';
import { templateNoObjectLiteralBindingRule } from './migration/template-no-object-literal-binding.rule.js';
import { templateNoArrayLiteralBindingRule } from './migration/template-no-array-literal-binding.rule.js';
import { toSignalRequireInitialValueRule } from './migration/to-signal-require-initial-value.rule.js';
import { rxjsAvoidSubjectRule } from './migration/rxjs-avoid-subject-as-event-bus.rule.js';
import { signalNoSideEffectsInComputedRule } from './migration/signal-no-side-effects-in-computed.rule.js';
import { preferInjectRule } from './migration/prefer-inject.rule.js';
import { componentNoManualDetectChangesRule } from './migration/component-no-manual-detect-changes.rule.js';
import { rxjsRequireTakeUntilDestroyedRule } from './migration/rxjs-require-take-until-destroyed.rule.js';
import { templateNoAsyncPipeDuplicationRule } from './migration/template-no-async-pipe-duplication.rule.js';
import { signalNoEffectInConstructorRule } from './migration/signal-no-effect-in-constructor.rule.js';
import { signalPreferComputedRule } from './migration/signal-prefer-computed-over-sync-effect.rule.js';
import { signalEffectDestroyScopedRule } from './migration/signal-effect-must-be-destroy-scoped.rule.js';
import { signalAvoidUntrackedRule } from './migration/signal-avoid-untracked-overuse.rule.js';
import { rxjsPreferToSignalRule } from './migration/rxjs-prefer-to-signal-for-template-state.rule.js';

// Registration
registerNewEngineRule(preferOnPushRule);
registerNewEngineRule(templateNoCallExpressionRule);
registerNewEngineRule(rxjsNoSubscribeInComponentRule);
registerNewEngineRule(rxjsAvoidBehaviorSubjectRule);
registerNewEngineRule(templateTrackByRequiredRule);
registerNewEngineRule(templateNoObjectLiteralBindingRule);
registerNewEngineRule(templateNoArrayLiteralBindingRule);
registerNewEngineRule(toSignalRequireInitialValueRule);
registerNewEngineRule(rxjsAvoidSubjectRule);
registerNewEngineRule(signalNoSideEffectsInComputedRule);
registerNewEngineRule(preferInjectRule);
registerNewEngineRule(componentNoManualDetectChangesRule);
registerNewEngineRule(rxjsRequireTakeUntilDestroyedRule);
registerNewEngineRule(templateNoAsyncPipeDuplicationRule);
registerNewEngineRule(signalNoEffectInConstructorRule);
registerNewEngineRule(signalPreferComputedRule);
registerNewEngineRule(signalEffectDestroyScopedRule);
registerNewEngineRule(signalAvoidUntrackedRule);
registerNewEngineRule(rxjsPreferToSignalRule);
