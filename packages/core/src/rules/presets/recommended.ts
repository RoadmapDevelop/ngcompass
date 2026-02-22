import { PresetConfig } from "../types.js";

/**
 * Recommended Preset
 */
export const recommendedPreset: PresetConfig = {
    name: 'ngcompass:recommended',
    description: 'Recommended rules for modern Angular projects',
    rules: {
        // Change Detection
        'prefer-on-push-component-change-detection': 'high',
        'component-no-manual-detect-changes': 'high',          // fixed: was 'component-no-manual-detectChanges'

        // Dependency Injection
        'prefer-inject-over-constructor-di': 'moderate',

        // RxJS → Signals migration
        'rxjs-no-subscribe-in-component': 'high',
        'rxjs-require-takeUntilDestroyed': 'high',
        'rxjs-avoid-behaviorsubject-for-local-state': 'moderate',
        'rxjs-avoid-subject-as-event-bus': 'moderate',
        'rxjs-prefer-toSignal-for-template-state': 'low',
        'toSignal-require-initialValue': 'moderate',

        // Signals correctness
        'signal-no-side-effects-in-computed': 'high',
        'signal-prefer-computed-over-sync-effect': 'moderate',
        'signal-effect-must-be-destroy-scoped': 'high',
        'signal-no-effect-in-constructor': 'low',
        'signal-avoid-untracked-overuse': 'low',

        // Template performance
        'template-no-call-expression': 'high',
        'template-trackby-required-for-ngfor': 'high',
        'template-no-object-literal-binding': 'moderate',
        'template-no-array-literal-binding': 'moderate',
        'template-no-async-pipe-duplication': 'moderate',
    },
};
