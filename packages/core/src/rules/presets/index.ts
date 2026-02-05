/**
 * Built-in Presets Registry
 */

import type { PresetConfig, BuiltinPreset } from '../types.js';
import { recommendedPreset } from './recommended.js';
import { strictPreset } from './strict.js';

/**
 * Registry of built-in presets
 */
export const builtinPresets: ReadonlyMap<BuiltinPreset, PresetConfig> = new Map([
    ['recommended', recommendedPreset],
    ['strict', strictPreset],
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
