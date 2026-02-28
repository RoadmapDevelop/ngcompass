/**
 * Built-in Presets Registry
 */

import { PresetConfig, BuiltinPreset } from "@ngcompass/common";
import { recommendedPreset } from './recommended.js';
import { strictPreset } from './strict.js';
import { allPreset } from './all.js';
import { architecturePreset } from './architecture.js';
import { performancePreset } from './performance.js';
import { securityPreset } from './security.js';
import { reactivityPreset } from './reactivity.js';
import { bestPracticePreset } from './best-practice.js';
import { codeSmellPreset } from './code-smell.js';
import { accessibilityPreset } from './accessibility.js';
import { testingPreset } from './testing.js';
import { ssrPreset } from './ssr.js';

/**
 * Registry of built-in presets
 */
export const builtinPresets: ReadonlyMap<BuiltinPreset, PresetConfig> = new Map([
    ['recommended', recommendedPreset],
    ['strict', strictPreset],
    ['all', allPreset],
    ['architecture', architecturePreset],
    ['performance', performancePreset],
    ['security', securityPreset],
    ['reactivity', reactivityPreset],
    ['best-practice', bestPracticePreset],
    ['code-smell', codeSmellPreset],
    ['accessibility', accessibilityPreset],
    ['testing', testingPreset],
    ['ssr', ssrPreset],
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
