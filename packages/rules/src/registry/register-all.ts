import { registerNewEngineRule } from '../engine/adapter.js';

import { signalNoSideEffectsInComputedRule } from '../rules/correctness/signal-no-side-effects-in-computed.rule.js';
import { signalEffectDestroyScopedRule } from '../rules/correctness/signal-effect-must-be-destroy-scoped.rule.js';
import { rxjsNoNestedSubscribeRule } from '../rules/correctness/rxjs-no-nested-subscribe.rule.js';
import { noNgZoneRule } from '../rules/correctness/no-ngzone.rule.js';
import { componentNoManualDetectChangesRule } from '../rules/correctness/component-no-manual-detect-changes.rule.js';
import { noChangeDetectorRefRule } from '../rules/correctness/no-changedetectorref.rule.js';
import { noDirectiveAccessorRule } from '../rules/correctness/no-directive-accessor.rule.js';
import { noDirectiveWritablePropertyRule } from '../rules/correctness/no-directive-writable-property.rule.js';
import { noProvideZoneChangeDetectionRule } from '../rules/correctness/no-providezonechangedetection.rule.js';
import { noReactiveFormsRule } from '../rules/correctness/no-reactive-forms.rule.js';
import { noZoneJsImportRule } from '../rules/correctness/no-zonejs-import.rule.js';
import { noNgOnInitRule } from '../rules/correctness/no-ngoninit.rule.js';
import { noNgOnChangesRule } from '../rules/correctness/no-ngonchanges.rule.js';
import { noNgDoCheckRule } from '../rules/correctness/no-ngdocheck.rule.js';
import { noNgAfterContentInitRule } from '../rules/correctness/no-ngaftercontentinit.rule.js';
import { noNgAfterContentCheckedRule } from '../rules/correctness/no-ngaftercontentchecked.rule.js';
import { noNgAfterViewInitRule } from '../rules/correctness/no-ngafterviewinit.rule.js';
import { noNgAfterViewCheckedRule } from '../rules/correctness/no-ngafterviewchecked.rule.js';
import { noNgOnDestroyRule } from '../rules/correctness/no-ngondestroy.rule.js';
import { preferOnPushRule } from '../rules/performance/prefer-on-push.rule.js';
import { templateNoCallExpressionRule } from '../rules/performance/template-no-call-expression.rule.js';
import { templateTrackByRequiredRule } from '../rules/performance/template-trackby-required.rule.js';
import { templateNoObjectLiteralBindingRule } from '../rules/performance/template-no-object-literal-binding.rule.js';
import { templateNoArrayLiteralBindingRule } from '../rules/performance/template-no-array-literal-binding.rule.js';

import { noBypassSanitizationRule } from '../rules/security/no-bypass-sanitization.rule.js';
import { templateNoUnsafeBindingsRule } from '../rules/security/template-no-unsafe-bindings.rule.js';

import { noDocumentAccessRule } from '../rules/ssr/no-document-access.rule.js';
import { preferAfterRenderOverAfterViewInitRule } from '../rules/ssr/prefer-after-render-over-after-view-init.rule.js';

import { rxjsNoSubscribeInComponentRule } from '../rules/reactivity/rxjs-no-subscribe-in-component.rule.js';
import { rxjsRequireTakeUntilDestroyedRule } from '../rules/reactivity/rxjs-require-take-until-destroyed.rule.js';
import { rxjsAvoidSubjectRule } from '../rules/reactivity/rxjs-avoid-subject-as-event-bus.rule.js';
import { rxjsPreferToSignalRule } from '../rules/reactivity/rxjs-prefer-to-signal-for-template-state.rule.js';
import { toSignalRequireInitialValueRule } from '../rules/reactivity/to-signal-require-initial-value.rule.js';
import { signalPreferComputedRule } from '../rules/reactivity/signal-prefer-computed-over-sync-effect.rule.js';
import { signalAvoidUntrackedRule } from '../rules/reactivity/signal-avoid-untracked-overuse.rule.js';

import { preferInjectRule } from '../rules/modern-api/prefer-inject.rule.js';
import { signalPreferInputSignalRule } from '../rules/modern-api/signal-prefer-input-signal.rule.js';
import { signalPreferOutputFunctionRule } from '../rules/modern-api/signal-prefer-output-function.rule.js';
import { signalPreferModelRule } from '../rules/modern-api/signal-prefer-model.rule.js';
import { noViewDecoratorRule } from '../rules/modern-api/no-view-decorator.rule.js';
import { noContentDecoratorRule } from '../rules/modern-api/no-content-decorator.rule.js';

import { templatePreferControlFlowRule } from '../rules/template/template-prefer-control-flow.rule.js';
import { templateNoAsyncPipeDuplicationRule } from '../rules/template/template-no-async-pipe-duplication.rule.js';
import { templateNoAsyncPipeRule } from '../rules/template/template-no-async-pipe.rule.js';

import { specNoFocusedTestRule } from '../rules/testing/spec-no-focused-test.rule.js';
import { noDetectChangesTestingRule } from '../rules/testing/no-detectchanges-testing.rule.js';
import { noNgZoneTestingRule } from '../rules/testing/no-ngzone-testing.rule.js';
import { noZoneJsTestingFunctionsRule } from '../rules/testing/no-zonejs-testing-functions.rule.js';

export function registerAllBuiltinRules() {
  registerNewEngineRule(signalNoSideEffectsInComputedRule, 'correctness');
  registerNewEngineRule(signalEffectDestroyScopedRule, 'correctness');
  registerNewEngineRule(rxjsNoNestedSubscribeRule, 'correctness');
  registerNewEngineRule(noNgZoneRule, 'correctness');
  registerNewEngineRule(componentNoManualDetectChangesRule, 'correctness');
  registerNewEngineRule(noChangeDetectorRefRule, 'correctness');
  registerNewEngineRule(noDirectiveAccessorRule, 'correctness');
  registerNewEngineRule(noDirectiveWritablePropertyRule, 'correctness');
  registerNewEngineRule(noProvideZoneChangeDetectionRule, 'correctness');
  registerNewEngineRule(noReactiveFormsRule, 'correctness');
  registerNewEngineRule(noZoneJsImportRule, 'correctness');
  registerNewEngineRule(noNgOnInitRule, 'correctness');
  registerNewEngineRule(noNgOnChangesRule, 'correctness');
  registerNewEngineRule(noNgDoCheckRule, 'correctness');
  registerNewEngineRule(noNgAfterContentInitRule, 'correctness');
  registerNewEngineRule(noNgAfterContentCheckedRule, 'correctness');
  registerNewEngineRule(noNgAfterViewInitRule, 'correctness');
  registerNewEngineRule(noNgAfterViewCheckedRule, 'correctness');
  registerNewEngineRule(noNgOnDestroyRule, 'correctness');

  registerNewEngineRule(preferOnPushRule, 'performance');
  registerNewEngineRule(templateNoCallExpressionRule, 'performance');
  registerNewEngineRule(templateTrackByRequiredRule, 'performance');
  registerNewEngineRule(templateNoObjectLiteralBindingRule, 'performance');
  registerNewEngineRule(templateNoArrayLiteralBindingRule, 'performance');

  registerNewEngineRule(noBypassSanitizationRule, 'security');
  registerNewEngineRule(templateNoUnsafeBindingsRule, 'security');

  registerNewEngineRule(noDocumentAccessRule, 'ssr');
  registerNewEngineRule(preferAfterRenderOverAfterViewInitRule, 'ssr');

  registerNewEngineRule(rxjsNoSubscribeInComponentRule, 'reactivity');
  registerNewEngineRule(rxjsRequireTakeUntilDestroyedRule, 'reactivity');
  registerNewEngineRule(rxjsAvoidSubjectRule, 'reactivity');
  registerNewEngineRule(rxjsPreferToSignalRule, 'reactivity');
  registerNewEngineRule(toSignalRequireInitialValueRule, 'reactivity');
  registerNewEngineRule(signalPreferComputedRule, 'reactivity');
  registerNewEngineRule(signalAvoidUntrackedRule, 'reactivity');

  registerNewEngineRule(preferInjectRule, 'modern-api');
  registerNewEngineRule(signalPreferInputSignalRule, 'modern-api');
  registerNewEngineRule(signalPreferOutputFunctionRule, 'modern-api');
  registerNewEngineRule(signalPreferModelRule, 'modern-api');
  registerNewEngineRule(noViewDecoratorRule, 'modern-api');
  registerNewEngineRule(noContentDecoratorRule, 'modern-api');

  registerNewEngineRule(templatePreferControlFlowRule, 'template');
  registerNewEngineRule(templateNoAsyncPipeDuplicationRule, 'template');
  registerNewEngineRule(templateNoAsyncPipeRule, 'template');

  registerNewEngineRule(specNoFocusedTestRule, 'testing');
  registerNewEngineRule(noDetectChangesTestingRule, 'testing');
  registerNewEngineRule(noNgZoneTestingRule, 'testing');
  registerNewEngineRule(noZoneJsTestingFunctionsRule, 'testing');
}
