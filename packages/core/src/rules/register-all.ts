/**
 * Registers all built-in rules with the registry.
 * Imported for side-effects.
 */

// New high-performance engine
import { registerNewEngineRule } from './engine/adapter.js';
import { preferOnPushRule } from './domains/prefer-on-push.rule.js';
import { preferStandaloneRule } from './domains/prefer-standalone.rule.js';
import { preferSignalInputsRule } from './domains/prefer-signal-inputs.rule.js';
import { templateNoCallExpressionRule } from './domains/template-no-call-expression.rule.js';
import { templatePreferControlFlowRule } from './domains/template-prefer-control-flow.rule.js';

registerNewEngineRule(preferOnPushRule);
registerNewEngineRule(preferStandaloneRule);
registerNewEngineRule(preferSignalInputsRule);
registerNewEngineRule(templateNoCallExpressionRule);
registerNewEngineRule(templatePreferControlFlowRule);
