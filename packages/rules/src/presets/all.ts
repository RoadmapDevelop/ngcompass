import { PresetConfig } from "@ngcompass/common";

/**
 * All Rules Preset
 *
 * Includes every available rule. Severity mirrors the recommended preset.
 * Use this preset when you want full coverage without customising individual rules.
 */
export const allPreset: PresetConfig = {
    name: 'ngcompass:all',
    description: 'All available rules enabled at their default severity',
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
        'rxjs-no-nested-subscribe': 'warn',

        // Signals correctness
        'signal-no-side-effects-in-computed': 'error',
        'signal-prefer-computed-over-sync-effect': 'warn',
        'signal-effect-must-be-destroy-scoped': 'error',
        'signal-avoid-untracked-overuse': 'warn',
        'signal-prefer-input-signal': 'warn',
        'signal-prefer-output-function': 'warn',
        'signal-prefer-model': 'warn',

        // Template performance & features
        'template-no-call-expression': 'error',
        'template-trackby-required': 'error',
        'template-no-object-literal-binding': 'warn',
        'template-no-array-literal-binding': 'warn',
        'template-no-async-pipe-duplication': 'warn',
        'template-prefer-control-flow': 'warn',

        // Security
        'no-bypass-sanitization': 'warn',
        'template-no-unsafe-bindings': 'warn',

        // Best Practices & General
        'no-document-access': 'warn',
        'prefer-after-render-over-after-view-init': 'warn',

        // Testing
        'spec-no-focused-test': 'error',
    },
};
