/**
 * Registers all built-in rules with the registry.
 * Imported for side-effects.
 */

// New high-performance engine
import { registerNewEngineRule } from './engine/adapter.js';

// ── Phase 0: MVP (10 rules — COMPLETE) ────────────────────────────────────────

// P0: Migration Blockers
import { preferOnPushRule } from './domains/prefer-on-push.rule.js';
import { preferStandaloneRule } from './domains/prefer-standalone.rule.js';
import { preferSignalInputsRule } from './domains/prefer-signal-inputs.rule.js';
import { templateNoCallExpressionRule } from './domains/template-no-call-expression.rule.js';
import { templatePreferControlFlowRule } from './domains/template-prefer-control-flow.rule.js';

// P1: High-ROI Quick Wins
import { rxjsNoNestedSubscribeRule } from './domains/rxjs-no-nested-subscribe.rule.js';
import { templateUseTrackByFunctionRule } from './domains/template-use-track-by-function.rule.js';
import { noInputRenameRule } from './domains/no-input-rename.rule.js';
import { componentSelectorRule } from './domains/component-selector.rule.js';
import { directiveSelectorRule } from './domains/directive-selector.rule.js';
import { rxjsPreferTakeuntilRule } from './domains/rxjs-prefer-takeuntil.rule.js';

// ── Phase 1: Differentiation (15 rules — COMPLETE) ────────────────────────────

// P2: Migration Support
import { preferSignalQueriesRule } from './domains/prefer-signal-queries.rule.js';
import { useInjectRule } from './domains/use-inject.rule.js';
import { noAttributeDecoratorRule } from './domains/no-attribute-decorator.rule.js';
import { templateNoNegatedAsyncRule } from './domains/template-no-negated-async.rule.js';
import { rxjsNoCreateRule } from './domains/rxjs-no-create.rule.js';

// P3: Code Quality & Safety
import { implementsOnDestroyRule } from './domains/implements-on-destroy.rule.js';
import { noOutputNativeRule } from './domains/no-output-native.rule.js';
import { noConflictingLifecycleRule } from './domains/no-conflicting-lifecycle.rule.js';
import { templateNoDuplicateAttributesRule } from './domains/template-no-duplicate-attributes.rule.js';
import { noEmptyLifecycleMethodRule } from './domains/no-empty-lifecycle-method.rule.js';

// P4: Naming & Conventions
import { componentClassSuffixRule } from './domains/component-class-suffix.rule.js';
import { directiveClassSuffixRule } from './domains/directive-class-suffix.rule.js';
import { noOutputOnPrefixRule } from './domains/no-output-on-prefix.rule.js';
import { noOutputRenameRule } from './domains/no-output-rename.rule.js';

// ── Phase 2: Evaluation Improvements (13 rules — NEW) ─────────────────────────

// Priority 1: Critical Gaps
import { preferSignalOutputsRule } from './domains/prefer-signal-outputs.rule.js';
import { noInnerHtmlRule } from './domains/no-inner-html.rule.js';
import { noBypassSecurityTrustRule } from './domains/no-bypass-security-trust.rule.js';

// Priority 2: Complete Naming Conventions
import { pipeClassSuffixRule } from './domains/pipe-class-suffix.rule.js';
import { serviceClassSuffixRule } from './domains/service-class-suffix.rule.js';
import { guardClassSuffixRule } from './domains/guard-class-suffix.rule.js';

// Priority 3: Template Coverage
import { templateNoAnyCastRule } from './domains/template-no-any-cast.rule.js';
import { templateNoInlineStylesRule } from './domains/template-no-inline-styles.rule.js';
import { preferAsyncPipeRule } from './domains/prefer-async-pipe.rule.js';

// Priority 4: Signal Modernisation
import { preferComputedRule } from './domains/prefer-computed.rule.js';
import { noNgOnChangesForDerivedStateRule } from './domains/no-ngonchanges-for-derived-state.rule.js';

// Priority 5: RxJS Safety
import { rxjsNoAsyncSubscribeRule } from './domains/rxjs-no-async-subscribe.rule.js';
import { rxjsNoSubjectValueRule } from './domains/rxjs-no-subject-value.rule.js';

// ── Registration: Phase 0 ──────────────────────────────────────────────────────

// P0: Migration Blockers
registerNewEngineRule(preferOnPushRule);
registerNewEngineRule(preferStandaloneRule);
registerNewEngineRule(preferSignalInputsRule);
registerNewEngineRule(templateNoCallExpressionRule);
registerNewEngineRule(templatePreferControlFlowRule);

// P1: High-ROI Quick Wins
registerNewEngineRule(rxjsNoNestedSubscribeRule);
registerNewEngineRule(templateUseTrackByFunctionRule);
registerNewEngineRule(noInputRenameRule);
registerNewEngineRule(componentSelectorRule);
registerNewEngineRule(directiveSelectorRule);
registerNewEngineRule(rxjsPreferTakeuntilRule);

// ── Registration: Phase 1 ──────────────────────────────────────────────────────

// P2: Migration Support
registerNewEngineRule(preferSignalQueriesRule);
registerNewEngineRule(useInjectRule);
registerNewEngineRule(noAttributeDecoratorRule);
registerNewEngineRule(templateNoNegatedAsyncRule);
registerNewEngineRule(rxjsNoCreateRule);

// P3: Code Quality & Safety
registerNewEngineRule(implementsOnDestroyRule);
registerNewEngineRule(noOutputNativeRule);
registerNewEngineRule(noConflictingLifecycleRule);
registerNewEngineRule(templateNoDuplicateAttributesRule);
registerNewEngineRule(noEmptyLifecycleMethodRule);

// P4: Naming & Conventions
registerNewEngineRule(componentClassSuffixRule);
registerNewEngineRule(directiveClassSuffixRule);
registerNewEngineRule(noOutputOnPrefixRule);
registerNewEngineRule(noOutputRenameRule);

// ── Registration: Phase 2 ──────────────────────────────────────────────────────

// Priority 1: Critical Gaps
registerNewEngineRule(preferSignalOutputsRule);
registerNewEngineRule(noInnerHtmlRule);
registerNewEngineRule(noBypassSecurityTrustRule);

// Priority 2: Complete Naming Conventions
registerNewEngineRule(pipeClassSuffixRule);
registerNewEngineRule(serviceClassSuffixRule);
registerNewEngineRule(guardClassSuffixRule);

// Priority 3: Template Coverage
registerNewEngineRule(templateNoAnyCastRule);
registerNewEngineRule(templateNoInlineStylesRule);
registerNewEngineRule(preferAsyncPipeRule);

// Priority 4: Signal Modernisation
registerNewEngineRule(preferComputedRule);
registerNewEngineRule(noNgOnChangesForDerivedStateRule);

// Priority 5: RxJS Safety
registerNewEngineRule(rxjsNoAsyncSubscribeRule);
registerNewEngineRule(rxjsNoSubjectValueRule);
