import { PresetConfig } from "@ngcompass/common";

/**
 * Reactivity Preset
 *
 * Covers all Signals correctness rules and RxJS→Signal migration rules.
 * Use this preset when migrating an existing RxJS-heavy codebase to the
 * Angular Signals model.
 */
export const reactivityPreset: PresetConfig = {
    name: 'ngcompass:reactivity',
    description: 'Signals correctness and RxJS → Signals migration rules',
    rules: {
        // RxJS → Signals migration
        'rxjs-no-subscribe-in-component': 'error',
        'rxjs-require-takeUntilDestroyed': 'error',
        'rxjs-avoid-behaviorsubject-for-local-state': 'warn',
        'rxjs-avoid-subject-as-event-bus': 'warn',
        'rxjs-prefer-toSignal-for-template-state': 'warn',
        'toSignal-require-initialValue': 'warn',

        // Signals correctness
        'signal-no-side-effects-in-computed': 'error',
        'signal-prefer-computed-over-sync-effect': 'warn',
        'signal-effect-must-be-destroy-scoped': 'error',
        'signal-no-effect-in-constructor': 'warn',
        'signal-avoid-untracked-overuse': 'warn',
    },
};
