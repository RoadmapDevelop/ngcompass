import { PresetConfig } from "@ngcompass/common";

/**
 * Recommended Preset
 */
export const recommendedPreset: PresetConfig = {
    name: 'ngcompass:recommended',
    description: 'Recommended rules for modern Angular projects',
    rules: {
        // Change Detection
        'prefer-on-push-component-change-detection': 'error',
        'component-no-manual-detect-changes': 'error',

        // Dependency Injection
        'prefer-inject-over-constructor-di': 'warn',

        // RxJS → Signals migration
        'rxjs-no-subscribe-in-component': 'error',
        'rxjs-require-takeUntilDestroyed': 'error',
        'rxjs-avoid-subject-as-event-bus': 'warn',
        'rxjs-prefer-toSignal-for-template-state': 'warn',
        'toSignal-require-initialValue': 'warn',

        // Signals correctness
        'signal-no-side-effects-in-computed': 'error',
        'signal-prefer-computed-over-sync-effect': 'warn',
        'signal-effect-must-be-destroy-scoped': 'error',
        'signal-no-effect-in-constructor': 'warn',
        'signal-avoid-untracked-overuse': 'warn',

        // Template performance
        'template-no-call-expression': 'error',
        'template-trackby-required-for-ngfor': 'error',
        'template-no-object-literal-binding': 'warn',
        'template-no-array-literal-binding': 'warn',
        'template-no-async-pipe-duplication': 'warn',
    },
};
