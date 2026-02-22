import { PresetConfig } from "../types.js";

/**
 * Recommended Preset
 */
export const recommendedPreset: PresetConfig = {
    name: 'ngcompass:recommended',
    description: 'Recommended rules for modern Angular projects',
    rules: {
        'prefer-on-push-component-change-detection': 'high',
        'template-no-call-expression': 'high',
        'rxjs-no-subscribe-in-component': 'high',
        'rxjs-avoid-behaviorsubject-for-local-state': 'moderate',
        'template-trackby-required-for-ngfor': 'high',
        'template-no-object-literal-binding': 'moderate',
        'template-no-array-literal-binding': 'moderate',
        'toSignal-require-initialValue': 'moderate',
        'rxjs-avoid-subject-as-event-bus': 'moderate',
        'signal-no-side-effects-in-computed': 'high',
        'prefer-inject-over-constructor-di': 'moderate',
        'component-no-manual-detectChanges': 'high',
        'rxjs-require-takeUntilDestroyed': 'high',
        'template-no-async-pipe-duplication': 'moderate',
    },
};
