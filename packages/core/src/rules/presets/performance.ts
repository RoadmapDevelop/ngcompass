import type { PresetConfig } from '../types.js';

/**
 * Performance Preset
 *
 * Rules focused on optimizing Angular change detection, template execution,
 * and memory management.
 */
export const performancePreset: PresetConfig = {
    name: 'ngcompass:performance',
    description: 'Rules for optimizing Angular application performance',
    rules: {
        'prefer-on-push-component-change-detection': 'high',
        'template-no-call-expression': 'high',
        'template-use-track-by-function': 'high',
        'prefer-async-pipe': 'moderate',
        'prefer-computed': 'moderate',
    },
};
