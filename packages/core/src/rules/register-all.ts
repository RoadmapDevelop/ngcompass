/**
 * Registers all built-in rules with the registry.
 * Imported for side-effects.
 */

// New high-performance engine
import { registerNewEngineRule } from './engine/adapter.js';

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
