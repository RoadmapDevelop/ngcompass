import { PresetConfig } from "@ngcompass/common";

/**
 * Performance Preset
 *
 * Targets rules that have a direct impact on rendering performance and
 * change-detection overhead. Combine with `ngcompass:recommended` for
 * full correctness + security coverage.
 */
export const performancePreset: PresetConfig = {
    name: 'ngcompass:performance',
    description: 'Rules that directly impact Angular rendering and change-detection performance',
    rules: {
        // ── Change detection ───────────────────────────────────────────────────
        'prefer-on-push-component-change-detection': 'error',
        'component-no-manual-detect-changes': 'error',

        // ── Template ───────────────────────────────────────────────────────────
        'template-no-call-expression': 'error',
        'template-trackby-required': 'error',
        'template-no-object-literal-binding': 'warn',
        'template-no-array-literal-binding': 'warn',
        'template-no-async-pipe-duplication': 'warn',

        // ── Reactivity ─────────────────────────────────────────────────────────
        // Signals have lower overhead than async pipe subscriptions in templates.
        'rxjs-prefer-toSignal-for-template-state': 'warn',
    },
};
