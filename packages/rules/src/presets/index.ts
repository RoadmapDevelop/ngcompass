/**
 * Built-in Presets Registry
 */

import { PresetConfig, BuiltinPreset } from "@ngcompass/common";
import { recommendedPreset } from './recommended.js';
import { strictPreset } from './strict.js';
import { allPreset } from './all.js';
import { performancePreset } from './performance.js';
import { reactivityPreset } from './reactivity.js';

/**
 * Registry of built-in presets
 */
export const builtinPresets: ReadonlyMap<BuiltinPreset, PresetConfig> = new Map([
    ['recommended', recommendedPreset],
    ['strict', strictPreset],
    ['all', allPreset],
    ['performance', performancePreset],
    ['reactivity', reactivityPreset],
]);

/**
 * Check if a preset name is a built-in preset
 */
export const isBuiltinPreset = (name: string): boolean => {
    const normalized = name.replace(/^ngcompass:/, '') as BuiltinPreset;
    return builtinPresets.has(normalized);
};

/**
 * Get a built-in preset by name
 */
export const getBuiltinPreset = (name: string): PresetConfig | undefined => {
    const normalized = name.replace(/^ngcompass:/, '') as BuiltinPreset;
    return builtinPresets.get(normalized);
};

/**
 * Returns all preset names that include the given rule.
 */
export function getPresetsForRule(ruleName: string): string[] {
    const result: string[] = [];
    for (const [presetName, preset] of builtinPresets) {
        if (ruleName in preset.rules) {
            result.push(presetName);
        }
    }
    return result;
}
