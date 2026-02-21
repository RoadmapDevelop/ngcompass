/**
 * Strict Preset
 *
 * Stricter rules for high-quality codebases
 * Extends: recommended
 */

import type { PresetConfig } from '../types.js';

export const strictPreset: PresetConfig = {
    name: 'ngcompass:strict',
    description: 'Strict rules for production Angular projects',
    extends: 'ngcompass:recommended',
    rules: {
        // Override recommended with stricter settings
        'no-console': 'high',
        'no-debugger': 'critical',
        'no-unused-vars': 'high',

        // Additional strict rules
        'no-any': 'moderate',
        'explicit-function-return-type': 'moderate',
        'no-explicit-any': 'high',

        // Angular strict — naming
        'component-class-suffix': 'high',
        'directive-class-suffix': 'high',
        'pipe-class-suffix': 'high',
        'service-class-suffix': 'high',
        'guard-class-suffix': 'high',
        'no-input-rename': 'moderate',
        'no-output-rename': 'moderate',

        // Template strict
        'template-no-negated-async': 'moderate',
        'template-use-track-by-function': 'high',
        'template-no-any-cast': 'high',
        'template-no-inline-styles': 'moderate',

        // Security strict
        'no-inner-html': 'high',
        'no-bypass-security-trust': 'high',

        // Signals strict
        'prefer-signal-outputs': 'moderate',
        'prefer-computed': 'moderate',
        'no-ngonchanges-for-derived-state': 'high',

        // RxJS strict
        'rxjs-no-async-subscribe': 'high',
        'rxjs-no-subject-value': 'high',
    },
};
