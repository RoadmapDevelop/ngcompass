/**
 * Registers all built-in rules with the registry.
 * Imported for side-effects.
 */
import { registerRuleImplementation } from './registry.js';
import { preferOnPush } from './domains/prefer-on-push.js';
import { templateNoCallExpression } from './domains/template-no-call-expression.js';

registerRuleImplementation('prefer-on-push-component-change-detection', preferOnPush as any);
registerRuleImplementation('template-no-call-expression', templateNoCallExpression as any);
