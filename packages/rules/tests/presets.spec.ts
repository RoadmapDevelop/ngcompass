import { describe, expect, it } from 'vitest';
import { allPreset } from '../src/presets/all.js';
import { builtinPresets } from '../src/presets/index.js';
import { registerAllBuiltinRules } from '../src/registry/register-all.js';
import {
  getGlobalRegistry,
  resetGlobalRegistry,
} from '../src/registry/rule-registry.js';

describe('builtin presets', () => {
  it('only references registered builtin rules', () => {
    resetGlobalRegistry();
    registerAllBuiltinRules();

    const registeredRules = new Set(getGlobalRegistry().getRuleNames());
    const unknownRules: string[] = [];

    for (const [presetName, preset] of builtinPresets) {
      for (const ruleName of Object.keys(preset.rules)) {
        if (!registeredRules.has(ruleName)) {
          unknownRules.push(`${presetName}:${ruleName}`);
        }
      }
    }

    expect(unknownRules).toEqual([]);
  });

  it('keeps the all preset in sync with registered builtin rules', () => {
    resetGlobalRegistry();
    registerAllBuiltinRules();

    const allPresetRules = new Set(Object.keys(allPreset.rules));
    const missingFromAll = getGlobalRegistry()
      .getRuleNames()
      .filter((ruleName) => !allPresetRules.has(ruleName));

    expect(missingFromAll).toEqual([]);
  });
});
