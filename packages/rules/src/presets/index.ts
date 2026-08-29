import type { BuiltinPreset, PresetConfig } from '@ngcompass/common';
import { allPreset } from './all.js';
import { performancePreset } from './performance.js';
import { reactivityPreset } from './reactivity.js';
import { recommendedPreset } from './recommended.js';
import { securityPreset } from './security.js';
import { ssrPreset } from './ssr.js';
import { strictPreset } from './strict.js';
import { zonelessPreset } from './zoneless.js';

export const builtinPresets: ReadonlyMap<BuiltinPreset, PresetConfig> = new Map(
  [
    ['recommended', recommendedPreset],
    ['strict', strictPreset],
    ['performance', performancePreset],
    ['reactivity', reactivityPreset],
    ['security', securityPreset],
    ['ssr', ssrPreset],
    ['zoneless', zonelessPreset],
    ['all', allPreset],
  ]
);

function stripPrefix(name: string): BuiltinPreset {
  return name.replace(/^ngcompass:/, '') as BuiltinPreset;
}

export function isBuiltinPreset(name: string): boolean {
  return builtinPresets.has(stripPrefix(name));
}

export function getBuiltinPreset(name: string): PresetConfig | undefined {
  return builtinPresets.get(stripPrefix(name));
}

export function getPresetsForRule(ruleName: string): string[] {
  const result: string[] = [];
  for (const [presetName, preset] of builtinPresets) {
    if (ruleName in preset.rules) result.push(presetName);
  }
  return result;
}
