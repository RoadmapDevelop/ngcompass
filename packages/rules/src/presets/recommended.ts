import { PresetConfig } from "@ngcompass/common";

/**
 * Recommended Preset
 *
 * Rules every Angular team should use regardless of their modernization stage.
 * Criteria: high-confidence (low false positives), high impact, works on both
 * older and newer Angular codebases.
 *
 * Deliberately excludes opinionated migration rules (signals, RxJS→signals).
 * Use `ngcompass:reactivity` to layer those on top.
 */
export const recommendedPreset: PresetConfig = {
    name: 'ngcompass:recommended',
    description: 'High-confidence rules that prevent real bugs and regressions in any Angular project',
    rules: {
        // ── Correctness ────────────────────────────────────────────────────────
        // These catch real bugs and memory leaks, not style preferences.
        'component-no-manual-detect-changes': 'error',
        'rxjs-no-nested-subscribe': 'error',
        'signal-no-side-effects-in-computed': 'error',
        'signal-effect-must-be-destroy-scoped': 'error',

        // ── RxJS memory safety ─────────────────────────────────────────────────
        // Open-ended subscriptions and missing teardown are the most common
        // source of memory leaks in Angular apps.
        'rxjs-no-subscribe-in-component': 'error',
        'rxjs-require-takeUntilDestroyed': 'error',

        // ── Change detection ───────────────────────────────────────────────────
        'prefer-on-push-component-change-detection': 'error',

        // ── Template performance ───────────────────────────────────────────────
        'template-no-call-expression': 'error',
        'template-trackby-required': 'error',
        'template-no-object-literal-binding': 'warn',
        'template-no-array-literal-binding': 'warn',
        'template-no-async-pipe-duplication': 'warn',

        // ── Security ───────────────────────────────────────────────────────────
        // XSS vectors — should always be flagged regardless of team preferences.
        'no-bypass-sanitization': 'error',
        'template-no-unsafe-bindings': 'error',

        // ── Testing ────────────────────────────────────────────────────────────
        // fdescribe/fit silently skips all other tests — a CI blind spot.
        'spec-no-focused-test': 'error',
    },
};
