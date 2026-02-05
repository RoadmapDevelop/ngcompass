/**
 * Recommended Preset
 *
 * Baseline rules for Angular projects
 * Focus: Common issues, best practices
 */

import type { PresetConfig } from '../types.js';

export const recommendedPreset: PresetConfig = {
    name: 'cangcompass:recommended',
    description: 'Recommended rules for Angular projects',
    rules: {
        // Console & debugging
        'no-console': 'moderate',
        'no-debugger': 'high',

        // Variables & declarations
        'no-var': 'moderate',
        'prefer-const': 'low',

        // Code quality
        'no-unused-vars': 'moderate',
        'no-duplicate-imports': 'low',

        // Angular specific (placeholders - will be implemented later)
        'component-selector': 'moderate',
        'directive-selector': 'moderate',
        'use-lifecycle-interface': 'low',

        // Template (placeholders)
        'no-inline-styles': 'low',
        'template-accessibility-alt-text': 'moderate',
    },
};
