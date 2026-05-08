import { PresetConfig } from "@ngcompass/common";

/**
 * Reactivity Preset
 *
 * Full Signals correctness + RxJS → Signals migration coverage.
 * Use this preset when modernising an existing RxJS-heavy codebase to the
 * Angular Signals model (Angular 17+).
 *
 * Pairs well with `ngcompass:recommended` (adds correctness and security
 * on top of this migration-focused set).
 */
export const reactivityPreset: PresetConfig = {
    name: 'ngcompass:reactivity',
    description: 'Signals correctness and RxJS → Signals migration rules for Angular 17+ projects',
    rules: {
        // ── RxJS correctness & memory safety ───────────────────────────────────
        'rxjs-no-nested-subscribe': 'error',
        'rxjs-no-subscribe-in-component': 'error',
        'rxjs-require-takeUntilDestroyed': 'error',
        'rxjs-avoid-subject-as-event-bus': 'warn',

        // ── RxJS → Signals migration ───────────────────────────────────────────
        'rxjs-prefer-toSignal-for-template-state': 'warn',
        'toSignal-require-initialValue': 'warn',

        // ── Signal correctness ─────────────────────────────────────────────────
        'signal-no-side-effects-in-computed': 'error',
        'signal-effect-must-be-destroy-scoped': 'error',
        'signal-prefer-computed-over-sync-effect': 'warn',
        'signal-avoid-untracked-overuse': 'warn',

        // ── Modern signal APIs ─────────────────────────────────────────────────
        // Migrate decorator-based I/O to the signal equivalents.
        'signal-prefer-input-signal': 'warn',
        'signal-prefer-output-function': 'warn',
        'signal-prefer-model': 'warn',
    },
};
