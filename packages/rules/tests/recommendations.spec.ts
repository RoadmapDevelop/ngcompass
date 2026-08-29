import { describe, expect, it } from 'vitest';
import { CODE_EXAMPLES, RECOMMENDATIONS } from '../src/recommendations.js';
import { registerAllBuiltinRules } from '../src/registry/register-all.js';
import {
  getGlobalRegistry,
  resetGlobalRegistry,
} from '../src/registry/rule-registry.js';

function registeredRuleNames(): ReadonlySet<string> {
  resetGlobalRegistry();
  registerAllBuiltinRules();
  return new Set(getGlobalRegistry().getRuleNames());
}

describe('rule guidance maps', () => {
  it('keys every recommendation by a registered rule name', () => {
    const registered = registeredRuleNames();

    const unknown = Object.keys(RECOMMENDATIONS).filter(
      (ruleName) => !registered.has(ruleName)
    );

    expect(unknown).toEqual([]);
  });

  it('keys every code example by a registered rule name', () => {
    const registered = registeredRuleNames();

    const unknown = Object.keys(CODE_EXAMPLES).filter(
      (ruleName) => !registered.has(ruleName)
    );

    expect(unknown).toEqual([]);
  });
});
