import { PresetConfig } from "@ngcompass/common";

/**
 * Strict Preset
 *
 * All 27 rules enforced at `error` severity — intended for teams that want
 * zero tolerance for architectural, performance, and style violations in CI.
 *
 * This is a superset of every other preset. It includes opinionated
 * migration rules (signals, modern API) alongside correctness and security.
 */
export const strictPreset: PresetConfig = {
    name: 'ngcompass:strict',
    description: 'All rules at error severity — zero tolerance mode',
    rules: {
        // ── Correctness ────────────────────────────────────────────────────────
        'component-no-manual-detect-changes': 'error',
        'rxjs-no-nested-subscribe': 'error',
        'signal-no-side-effects-in-computed': 'error',
        'signal-effect-must-be-destroy-scoped': 'error',

        // ── Change detection ───────────────────────────────────────────────────
        'prefer-on-push-component-change-detection': 'error',

        // ── Dependency injection ───────────────────────────────────────────────
        'prefer-inject-over-constructor-di': 'error',

        // ── RxJS ──────────────────────────────────────────────────────────────
        'rxjs-no-subscribe-in-component': 'error',
        'rxjs-require-takeUntilDestroyed': 'error',
        'rxjs-avoid-subject-as-event-bus': 'error',
        'rxjs-prefer-toSignal-for-template-state': 'error',
        'toSignal-require-initialValue': 'error',

        // ── Signals ────────────────────────────────────────────────────────────
        'signal-prefer-computed-over-sync-effect': 'error',
        'signal-avoid-untracked-overuse': 'error',
        'signal-prefer-input-signal': 'error',
        'signal-prefer-output-function': 'error',
        'signal-prefer-model': 'error',

        // ── Template ───────────────────────────────────────────────────────────
        'template-no-call-expression': 'error',
        'template-trackby-required': 'error',
        'template-no-object-literal-binding': 'error',
        'template-no-array-literal-binding': 'error',
        'template-no-async-pipe-duplication': 'error',
        'template-prefer-control-flow': 'error',

        // ── Security ───────────────────────────────────────────────────────────
        'no-bypass-sanitization': 'error',
        'template-no-unsafe-bindings': 'error',

        // ── SSR ────────────────────────────────────────────────────────────────
        'no-document-access': 'error',
        'prefer-after-render-over-after-view-init': 'error',

        // ── Testing ────────────────────────────────────────────────────────────
        'spec-no-focused-test': 'error',
    },
};
