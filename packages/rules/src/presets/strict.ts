import { PresetConfig } from "@ngcompass/common";

/**
 * Strict Preset
 *
 * Every rule is enforced at `error` severity — intended for teams that want
 * zero tolerance for architectural and performance violations in CI.
 */
export const strictPreset: PresetConfig = {
    name: 'ngcompass:strict',
    description: 'All rules enforced at error severity — zero tolerance mode',
    rules: {
        // Change Detection
        'prefer-on-push-component-change-detection': 'error',
        'component-no-manual-detect-changes': 'error',

        // Dependency Injection
        'prefer-inject-over-constructor-di': 'error',

        // RxJS → Signals migration
        'rxjs-no-subscribe-in-component': 'error',
        'rxjs-require-takeUntilDestroyed': 'error',
        'rxjs-avoid-subject-as-event-bus': 'error',
        'rxjs-prefer-toSignal-for-template-state': 'error',
        'toSignal-require-initialValue': 'error',

        // Signals correctness
        'signal-no-side-effects-in-computed': 'error',
        'signal-prefer-computed-over-sync-effect': 'error',
        'signal-effect-must-be-destroy-scoped': 'error',
        'signal-no-effect-in-constructor': 'error',
        'signal-avoid-untracked-overuse': 'error',

        // Template performance
        'template-no-call-expression': 'error',
        'template-trackby-required-for-ngfor': 'error',
        'template-no-object-literal-binding': 'error',
        'template-no-array-literal-binding': 'error',
        'template-no-async-pipe-duplication': 'error',
    },
};
