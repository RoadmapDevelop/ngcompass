import { registerNewEngineRule } from '../engine/adapter.js';

// ─── Correctness ─────────────────────────────────────────────────────────────
import { componentNoManualDetectChangesRule } from '../rules/correctness/component-no-manual-detect-changes.rule.js';
import { signalNoSideEffectsInComputedRule } from '../rules/correctness/signal-no-side-effects-in-computed.rule.js';
import { signalEffectDestroyScopedRule } from '../rules/correctness/signal-effect-must-be-destroy-scoped.rule.js';
import { signalNoEffectInConstructorRule } from '../rules/correctness/signal-no-effect-in-constructor.rule.js';
import { rxjsNoNestedSubscribeRule } from '../rules/correctness/rxjs-no-nested-subscribe.rule.js';

// ─── Performance ─────────────────────────────────────────────────────────────
import { preferOnPushRule } from '../rules/performance/prefer-on-push.rule.js';
import { templateNoCallExpressionRule } from '../rules/performance/template-no-call-expression.rule.js';
import { templateTrackByRequiredRule } from '../rules/performance/template-trackby-required.rule.js';
import { templateNoObjectLiteralBindingRule } from '../rules/performance/template-no-object-literal-binding.rule.js';
import { templateNoArrayLiteralBindingRule } from '../rules/performance/template-no-array-literal-binding.rule.js';

// ─── Security ────────────────────────────────────────────────────────────────
import { noBypassSanitizationRule } from '../rules/security/no-bypass-sanitization.rule.js';
import { templateNoUnsafeBindingsRule } from '../rules/security/template-no-unsafe-bindings.rule.js';

// ─── SSR ─────────────────────────────────────────────────────────────────────
import { noDocumentAccessRule } from '../rules/ssr/no-document-access.rule.js';
import { preferAfterRenderOverAfterViewInitRule } from '../rules/ssr/prefer-after-render-over-after-view-init.rule.js';

// ─── Reactivity ──────────────────────────────────────────────────────────────
import { rxjsNoSubscribeInComponentRule } from '../rules/reactivity/rxjs-no-subscribe-in-component.rule.js';
import { rxjsRequireTakeUntilDestroyedRule } from '../rules/reactivity/rxjs-require-take-until-destroyed.rule.js';
import { rxjsAvoidBehaviorSubjectRule } from '../rules/reactivity/rxjs-avoid-behaviorsubject-for-local-state.rule.js';
import { rxjsAvoidSubjectRule } from '../rules/reactivity/rxjs-avoid-subject-as-event-bus.rule.js';
import { rxjsPreferToSignalRule } from '../rules/reactivity/rxjs-prefer-to-signal-for-template-state.rule.js';
import { toSignalRequireInitialValueRule } from '../rules/reactivity/to-signal-require-initial-value.rule.js';
import { signalPreferComputedRule } from '../rules/reactivity/signal-prefer-computed-over-sync-effect.rule.js';

// ─── Modern API ──────────────────────────────────────────────────────────────
import { preferInjectRule } from '../rules/modern-api/prefer-inject.rule.js';
import { signalPreferInputSignalRule } from '../rules/modern-api/signal-prefer-input-signal.rule.js';
import { signalPreferOutputFunctionRule } from '../rules/modern-api/signal-prefer-output-function.rule.js';
import { signalPreferModelRule } from '../rules/modern-api/signal-prefer-model.rule.js';

// ─── Template ────────────────────────────────────────────────────────────────
import { templatePreferControlFlowRule } from '../rules/template/template-prefer-control-flow.rule.js';
import { templateNoAsyncPipeDuplicationRule } from '../rules/template/template-no-async-pipe-duplication.rule.js';

// ─── Testing ─────────────────────────────────────────────────────────────────
import { specNoFocusedTestRule } from '../rules/testing/spec-no-focused-test.rule.js';

export function registerAllBuiltinRules() {
    // Correctness — bugs, memory leaks, lifecycle violations
    registerNewEngineRule(componentNoManualDetectChangesRule);
    registerNewEngineRule(signalNoSideEffectsInComputedRule);
    registerNewEngineRule(signalEffectDestroyScopedRule);
    registerNewEngineRule(signalNoEffectInConstructorRule);
    registerNewEngineRule(rxjsNoNestedSubscribeRule);

    // Performance — change detection, rendering, template efficiency
    registerNewEngineRule(preferOnPushRule);
    registerNewEngineRule(templateNoCallExpressionRule);
    registerNewEngineRule(templateTrackByRequiredRule);
    registerNewEngineRule(templateNoObjectLiteralBindingRule);
    registerNewEngineRule(templateNoArrayLiteralBindingRule);

    // Security — XSS, injection, sanitization bypass
    registerNewEngineRule(noBypassSanitizationRule);
    registerNewEngineRule(templateNoUnsafeBindingsRule);

    // SSR — platform safety for Angular Universal / @angular/ssr
    registerNewEngineRule(noDocumentAccessRule);
    registerNewEngineRule(preferAfterRenderOverAfterViewInitRule);

    // Reactivity — RxJS patterns, signal reactivity, observable lifecycle
    registerNewEngineRule(rxjsNoSubscribeInComponentRule);
    registerNewEngineRule(rxjsRequireTakeUntilDestroyedRule);
    registerNewEngineRule(rxjsAvoidBehaviorSubjectRule);
    registerNewEngineRule(rxjsAvoidSubjectRule);
    registerNewEngineRule(rxjsPreferToSignalRule);
    registerNewEngineRule(toSignalRequireInitialValueRule);
    registerNewEngineRule(signalPreferComputedRule);

    // Modern API — idiomatic Angular 17+ APIs
    registerNewEngineRule(preferInjectRule);
    registerNewEngineRule(signalPreferInputSignalRule);
    registerNewEngineRule(signalPreferOutputFunctionRule);
    registerNewEngineRule(signalPreferModelRule);

    // Template — structure, syntax, and template patterns
    registerNewEngineRule(templatePreferControlFlowRule);
    registerNewEngineRule(templateNoAsyncPipeDuplicationRule);

    // Testing — spec quality, CI blind spots
    registerNewEngineRule(specNoFocusedTestRule);
}
