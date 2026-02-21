import type { PresetConfig } from '../types.js';

/**
 * Best Practice Preset
 *
 * General best practices for Angular development.
 */
export const bestPracticePreset: PresetConfig = {
    name: 'ngcompass:best-practice',
    description: 'General best practices for Angular development',
    rules: {
        'no-input-rename': 'moderate',
        'no-output-rename': 'moderate',
        'no-output-native': 'high',
        'no-output-on-prefix': 'moderate',
        'no-attribute-decorator': 'moderate',
        'template-no-negated-async': 'moderate',
        'template-no-duplicate-attributes': 'high',
        'no-empty-lifecycle-method': 'moderate',
        'no-conflicting-lifecycle': 'high',
        'template-no-any-cast': 'high',
        'template-no-inline-styles': 'moderate',
    },
};
