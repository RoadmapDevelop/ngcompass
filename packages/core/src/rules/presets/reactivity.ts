import type { PresetConfig } from '../types.js';

/**
 * Reactivity Preset
 *
 * Rules managing modern Angular signals and RxJS patterns.
 */
export const reactivityPreset: PresetConfig = {
    name: 'ngcompass:reactivity',
    description: 'Rules for modern Angular reactivity (Signals and RxJS)',
    rules: {
        'prefer-signal-inputs': 'moderate',
        'prefer-signal-queries': 'moderate',
        'prefer-signal-outputs': 'moderate',
        'prefer-computed': 'moderate',
        'no-ngonchanges-for-derived-state': 'moderate',
        'rxjs-no-nested-subscribe': 'high',
        'rxjs-prefer-takeuntil': 'high',
        'rxjs-no-create': 'high',
        'rxjs-no-async-subscribe': 'high',
        'rxjs-no-subject-value': 'moderate',
    },
};
