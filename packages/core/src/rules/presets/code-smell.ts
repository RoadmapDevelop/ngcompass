import type { PresetConfig } from '../types.js';

/**
 * Code Smell Preset
 *
 * Checks for patterns that are likely to be bugs or maintainability issues.
 */
export const codeSmellPreset: PresetConfig = {
    name: 'ngcompass:code-smell',
    description: 'Rules for detecting common code smells',
    rules: {
        'rxjs-no-nested-subscribe': 'high',
        'template-no-call-expression': 'high',
        'no-empty-lifecycle-method': 'moderate',
        'no-conflicting-lifecycle': 'high',
        'rxjs-no-async-subscribe': 'high',
    },
};
